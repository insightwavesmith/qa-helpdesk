# Agent Ops Phase 4: 세션 복구 + 고도화 설계서

> 작성일: 2026-03-25
> 상태: Design 완료
> 의존성: Phase 1~3 완료

---

## 1. 데이터 모델

### 1.1 Circuit Breaker 상태 (slack-notifier.ts 내부)

```typescript
interface CircuitBreakerState {
  consecutiveFailures: number;
  lastFailureAt: number;      // Date.now()
  openUntil: number | null;   // Date.now() + BLOCK_DURATION_MS
  isOpen: boolean;
}
```

- `BLOCK_DURATION_MS`: 120000 (2분)
- `FAILURE_THRESHOLD`: 5회 연속 실패

### 1.2 Checkpoint Resume Context (기존 확장)

기존 `checkpoint.ts`의 `Checkpoint` 인터페이스 그대로 사용.
추가 필드 없음 — 로드/주입 로직만 추가.

---

## 2. 구현 상세

### P4-1: Checkpoint Auto-Resume (세션 시작 시 자동 로드)

**파일**: `scripts/session-resume.mjs` (신규, ~80줄)

**동작**:
1. 팀 ID를 인수로 받음: `node scripts/session-resume.mjs cto`
2. `/tmp/cross-team/{team}/checkpoint.json` 읽기
3. checkpoint가 있으면 resume context 텍스트 생성
4. stdout으로 출력 (호출자가 tmux send-keys로 주입)
5. checkpoint가 없으면 빈 출력

**Resume Context 형식** (기존 `buildResumeContext` 함수 활용):
```
이전 세션 복구 컨텍스트:
 - 기능: agent-ops-platform
 - 완료 TASK: P3-1 WebSocket, P3-2 xterm
 - 진행 중: P3-3 세션전환
 - 마지막 커밋: abc1234
 - 다음 작업: P3-3 완료 후 P3-4 시작
```

**호출 방식** (idle-detector의 자동 재시작에서 사용):
```bash
RESUME=$(node scripts/session-resume.mjs cto)
if [ -n "$RESUME" ]; then
  tmux send-keys -t sdk-cto "$RESUME" Enter
fi
```

### P4-2: idle-detector 세션 자동 재시작

**파일**: `scripts/idle-detector.mjs` (기존 확장, +40줄)

**변경 사항**:
- `checkTeam()` 함수에서 `tmuxAlive === false` 감지 시:
  1. 슬랙 알림 전송 (기존 동작 유지)
  2. **자동 재시작 시도** (신규):
     ```bash
     tmux new-session -d -s sdk-{team}
     ```
  3. 재시작 성공 시 checkpoint resume context 주입:
     ```bash
     node scripts/session-resume.mjs {team}
     → tmux send-keys -t sdk-{team} "{context}" Enter
     ```
  4. 재시작 결과 슬랙 알림 (성공/실패)

- **재시작 제한**: 같은 팀 10분 이내 재시작 1회만 (무한 루프 방지)
- 새 상태 추가: `teamState[team].lastRestartAt` 타임스탬프

### P4-3: PDCA auto-sync matchRate 자동 기록

**파일**: `.claude/hooks/agent-state-sync.sh` (기존 확장, +30줄)

**변경 사항**: PDCA auto-sync 섹션(#6)에 matchRate 자동 추출 추가

**동작**:
1. `docs/03-analysis/{feature}.analysis.md` 파일이 존재하면
2. 파일에서 `Match Rate: XX%` 패턴을 grep으로 추출
3. 추출된 matchRate를 `docs/.pdca-status.json`의 해당 feature에 기록
4. 루트 `.pdca-status.json`에도 동일하게 기록

**추출 로직** (python3 블록 내):
```python
# analysis 파일에서 matchRate 추출
if analysis_exists:
    try:
        with open(analysis_path, 'r') as f:
            content = f.read()
        import re
        match = re.search(r'Match Rate:\s*(\d+)%', content)
        if match:
            match_rate = int(match.group(1))
            features[current_feature]['matchRate'] = match_rate
    except Exception:
        pass
```

### P4-4: Slack 서킷 브레이커

**파일**: `src/lib/slack-notifier.ts` (기존 확장, +40줄)

**변경 사항**:

1. 모듈 상단에 서킷 브레이커 상태 추가:
```typescript
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_BLOCK_MS = 120_000; // 2분

const circuitBreaker: CircuitBreakerState = {
  consecutiveFailures: 0,
  lastFailureAt: 0,
  openUntil: null,
  isOpen: false,
};
```

2. `sendWithRetry()` 호출 전 서킷 브레이커 체크:
```typescript
function isCircuitOpen(): boolean {
  if (!circuitBreaker.isOpen) return false;
  if (circuitBreaker.openUntil && Date.now() > circuitBreaker.openUntil) {
    // half-open: 한 번 시도 허용
    circuitBreaker.isOpen = false;
    circuitBreaker.consecutiveFailures = 0;
    return false;
  }
  return true;
}
```

3. `sendWithRetry()` 결과에 따라 상태 갱신:
- 성공: `consecutiveFailures = 0`, `isOpen = false`
- 실패: `consecutiveFailures++`
  - 5회 도달 시: `isOpen = true`, `openUntil = Date.now() + 120000`
  - console.error로 차단 로그 출력

4. `sendSlackNotification()` 시작 부분에 서킷 체크:
```typescript
if (isCircuitOpen()) {
  console.warn("[slack-notifier] 서킷 브레이커 OPEN — 전송 차단 중");
  await enqueueNotification(channels[0], blocks, text);
  return result;
}
```

---

## 3. 에러 처리

| 상황 | 처리 |
|------|------|
| checkpoint.json 파싱 실패 | null 반환, 빈 컨텍스트로 시작 |
| tmux 재시작 실패 | 슬랙 알림 + console.error, 다음 폴링까지 대기 |
| matchRate 추출 실패 | null 유지, 수동 갱신 가능 |
| 서킷 브레이커 open | 큐에 적재, 2분 후 half-open |

---

## 4. 구현 순서

```
Wave 1 (병렬):
  P4-1 session-resume.mjs (backend-dev) — 신규 파일
  P4-3 agent-state-sync.sh matchRate (backend-dev) — 기존 확장
  P4-4 slack-notifier.ts 서킷 브레이커 (backend-dev) — 기존 확장

Wave 2 (P4-1 완료 후):
  P4-2 idle-detector.mjs 자동 재시작 (backend-dev) — P4-1 의존

Wave 3:
  P4-6 E2E 검증 + Gap 분석 (qa-engineer)
```

---

## 5. 파일별 담당

| 파일 | 변경 | 줄 수 (추정) |
|------|------|-------------|
| `scripts/session-resume.mjs` | 신규 | ~80 |
| `scripts/idle-detector.mjs` | 확장 | +40 |
| `.claude/hooks/agent-state-sync.sh` | 확장 | +30 |
| `src/lib/slack-notifier.ts` | 확장 | +40 |
| **합계** | | ~190줄 |
