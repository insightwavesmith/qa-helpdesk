# Chain 100% (에이전트팀 체인 구조 완전체) 설계서

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | Chain 100% (에이전트팀 체인 구조 완전체) |
| 작성일 | 2026-03-30 |
| TASK | .claude/tasks/TASK-CHAIN-100-PERCENT.md |
| 선행 설계 | pdca-chain-automation.design.md, chain-context-fix.design.md, agent-ops-phase2.design.md |
| 프로세스 레벨 | L2 (hooks/scripts 수정, src/ 미수정) |
| 항목 수 | 5건 + Smith님 실전 체크리스트 |

| 관점 | 내용 |
|------|------|
| **Problem** | (1) 팀원 pending 승인 요청을 리더가 모름 → stuck (2) TDD 433건 Green이지만 실전 e2e 미검증 (3) 리더가 배포 명령어까지 차단됨 (4) dashboard-sync 삭제 후 대안 없음 (5) heartbeat 5분 설정했지만 실제 동작 미확인 |
| **Solution** | (1) 팀원→리더 send-keys 즉시 알림 (2) 실전 e2e 시나리오 3종 + 자동 검증 (3) validate-delegate 배포 화이트리스트 (4) GCS 직접 업로드 cron (5) heartbeat TDD + watchdog |
| **Function UX Effect** | 승인 대기 0→즉시 감지, 체인 실전 검증 100%, 리더 배포 가능, state 동기화 복원, heartbeat 신뢰성 확보 |
| **Core Value** | 에이전트팀 체인이 실전에서 100% 무중단 자동 운영 |

---

## 현재 완료 상태 (전제 조건)

| 완료 항목 | 커밋 | 내용 |
|-----------|------|------|
| team-context 병렬 분리 | e4c41dc | 팀별 파일 + resolver + 아카이빙 |
| requireApproval 승인 게이트 | 861acfb | approval-handler.sh + validate-delegate 연동 |
| 방탄 TDD 38건 | 4d95107 | R1-R7 hook 방어 코드 |
| TDD 433건 전부 Green | 최신 | chain-e2e + chain-e2e-realworld + bulletproof 포함 |

---

## 문제 1: 리더가 승인 대기 자동 감지

### 현재 문제

```
팀원이 .claude/ 수정 시도
  → approval-handler.sh → pending/{key}.json 생성 + exit 2 차단
  → 팀원은 "승인 필요" 메시지 받고 멈춤
  → ⚠️ 리더는 모름 → 팀원 stuck → 수동 확인 필요
```

pending 파일은 `.claude/runtime/approvals/pending/` 에 생성되지만, 리더가 이 디렉토리를 폴링하는 메커니즘이 없다.

### 해결: 팀원 → 리더 tmux send-keys 즉시 알림

COO 의견대로 **팀원이 차단되면 리더한테 직접 알리는** 방식이 가장 단순하고 확실하다.

```
팀원이 .claude/ 수정 시도
  → approval-handler.sh → pending/{key}.json 생성
  → [신규] notify_leader_approval() → tmux send-keys로 리더 pane에 직접 알림
  → exit 2 차단
  → 리더가 알림 수신 → 승인/거부 처리
  → 팀원 재시도 → 승인 확인 → 통과
```

### 설계 상세

#### 1-1. approval-handler.sh 수정

`request_approval()` 함수 끝에 리더 알림 추가:

```bash
# request_approval() 내부 끝에 추가
notify_leader_approval() {
    local REL_FILE="$1"
    local KEY="$2"

    # tmux 환경 아니면 스킵
    [ -z "${TMUX:-}" ] && return 0

    # 리더 pane = 항상 pane 0 (세션 내)
    local SESSION_NAME
    SESSION_NAME=$(tmux display-message -p '#{session_name}' 2>/dev/null) || return 0

    local TEAMMATE_PANE
    TEAMMATE_PANE=$(tmux display-message -p '#{pane_index}' 2>/dev/null) || return 0

    # 리더한테 보낼 메시지 (Claude Code 프롬프트에 입력)
    # send-keys는 리더 pane 0의 stdin에 텍스트를 넣는다
    # 리더가 idle 상태면 바로 보이고, 작업 중이면 입력 버퍼에 쌓인다
    local MSG="[승인요청] 팀원(pane${TEAMMATE_PANE})이 ${REL_FILE} 수정 승인 요청. 처리: echo \$(date +%s) > ${_APPROVAL_DIR}/granted/${KEY}"

    # 리더 pane(0)에 send-keys — 실패해도 무시
    tmux send-keys -t "${SESSION_NAME}:0.0" "" 2>/dev/null  # 기존 입력 클리어
    tmux send-keys -t "${SESSION_NAME}:0.0" "$MSG" 2>/dev/null

    return 0
}
```

#### 1-2. 리더 승인 처리 방법

리더가 알림을 받으면 두 가지 방법으로 승인:

| 방법 | 명령 | 용도 |
|------|------|------|
| **승인** | `echo $(date +%s) > .claude/runtime/approvals/granted/{key}` | 팀원 재시도 시 통과 |
| **거부** | `echo rejected > .claude/runtime/approvals/granted/{key}` | 팀원 재시도 시 차단 유지 |

리더는 Claude Code 프롬프트에서 `! echo ...` 명령으로 실행 가능.

#### 1-3. 엣지케이스

| 케이스 | 처리 |
|--------|------|
| 리더가 다른 작업 중 (busy) | send-keys 버퍼에 쌓임 → 리더 턴 끝나면 표시됨 |
| 리더 pane이 없음 (비정상) | tmux send-keys 실패 → return 0 (Slack fallback은 기존 notify_hook) |
| 동일 파일 중복 요청 | pending/{key}.json 덮어쓰기 → send-keys도 재전송 (문제없음) |
| 승인 TTL 만료 (5분) | 팀원 재시도 시 다시 exit 2 → 리더 재알림 |
| 여러 팀원이 동시 요청 | 각각 다른 key → 각각 send-keys → 리더가 순서대로 처리 |

### 수정 파일

| 파일 | 변경 | 변경량 |
|------|------|--------|
| `.claude/hooks/helpers/approval-handler.sh` | `notify_leader_approval()` 추가 + `request_approval()` 내부 호출 | ~25줄 |

### TDD 케이스

| ID | 시나리오 | 검증 | 기대 결과 |
|----|---------|------|-----------|
| P1-1 | 팀원 pending 생성 시 send-keys 호출 | tmux send-keys mock + pending 파일 확인 | pending 파일 존재 + send-keys 1회 호출 |
| P1-2 | tmux 없는 환경에서 알림 | TMUX='' | pending 파일 생성 + send-keys 스킵 (에러 없음) |
| P1-3 | 리더 승인 후 팀원 재시도 | granted/{key} 에 현재 timestamp 기록 → check_approval | return 0 (승인됨) |
| P1-4 | 리더 거부 후 팀원 재시도 | granted/{key} 에 "rejected" 기록 → check_approval | return 1 (미승인) |
| P1-5 | 승인 TTL 만료 후 재알림 | granted/{key} = 6분 전 timestamp → 팀원 재시도 | exit 2 + 새 pending + send-keys 재호출 |
| P1-6 | 동시 다중 팀원 요청 | 2개 파일 동시 request_approval | 각각 별도 pending + send-keys 2회 |

---

## 문제 2: 체인 실전 테스트 시나리오

### 현재 문제

TDD 433건은 mock 환경 (tmpDir + 환경변수 주입). 실전에서:
- 실제 tmux 세션 간 통신
- 실제 broker 기동 상태
- 실제 TaskCompleted hook 체인 발동
- 실제 PM/COO 세션 수신

이 검증이 안 되어 있다.

### 해결: 실전 e2e 시나리오 3종 + 자동 검증 스크립트

#### 시나리오 설계

##### E2E-1: 단일 팀 풀 체인 (Happy Path)

```
사전 조건: CTO-2 + PM + COO(모찌) 세션 기동, broker 기동
─────────────────────────────────────────────────────────

1. CTO-2 리더가 간단 TASK 배정 → 팀원 생성
2. 팀원이 src/test-chain-e2e.ts 작성 (1줄 수정)
3. 팀원 완료 → TeamDelete
4. TaskCompleted 발동:
   ├─ task-quality-gate.sh → tsc/build 통과
   ├─ gap-analysis.sh → Match Rate 파싱
   └─ pdca-chain-handoff.sh 발동
       ├─ Match Rate ≥ 95% 확인
       ├─ resolve_peer("PM_LEADER") → PM 세션 ID
       └─ send_chain_message → PM에 COMPLETION_REPORT
5. PM 세션 수신 확인 (check_messages)
6. PM 검수 → pm-chain-forward.sh → COO에 전달
7. COO 수신 확인

검증 포인트:
✅ pdca-chain-handoff.sh 실행됨 (exit 0)
✅ last-completion-report.json 생성됨
✅ PM 세션에 메시지 도착
✅ COO 세션에 메시지 도착
✅ chain-sent.log에 기록 (dedup 확인)
```

##### E2E-2: Match Rate 미달 → CTO 자체 수정 루프

```
사전 조건: CTO-2 세션, 분석 문서에 Match Rate 80% 기록
──────────────────────────────────────────────────────

1. 분석 문서를 Match Rate 80%로 작성
2. TaskCompleted 발동
3. pdca-chain-handoff.sh:
   ├─ match-rate-parser.sh → 80%
   └─ 95% 미만 → exit 2 차단
4. CTO 리더가 자체 수정 지시 → 팀원 재수정
5. 분석 문서 Match Rate 96%로 갱신
6. TaskCompleted 재발동 → 95%+ → PM 전달 성공

검증 포인트:
✅ 1차: exit 2 (차단) 확인
✅ 2차: exit 0 (통과) + PM 전달 확인
✅ dedup: 같은 feature의 2번째 메시지만 전달됨
```

##### E2E-3: 병렬 팀 독립 체인

```
사전 조건: CTO-1 + CTO-2 동시 기동, PM + COO 기동
───────────────────────────────────────────────────

1. CTO-1 TASK-A 진행, CTO-2 TASK-B 진행
2. CTO-2 먼저 완료 → TeamDelete → chain 발동
3. 확인: CTO-1의 team-context 영향 없음
4. CTO-1 완료 → TeamDelete → chain 발동
5. 확인: PM에 TASK-A, TASK-B 별도 메시지 도착

검증 포인트:
✅ CTO-2 TeamDelete 후 CTO-1 context 유지
✅ 각 팀 chain이 독립 발동
✅ PM에 2개 별도 COMPLETION_REPORT 도착
✅ dedup: 서로 다른 msg_id로 각각 전달
```

#### 자동 검증 스크립트: `verify-chain-e2e.sh`

수동 e2e 후 결과를 자동 확인하는 스크립트:

```bash
#!/bin/bash
# verify-chain-e2e.sh — 체인 실전 e2e 결과 자동 검증
# 사용: bash verify-chain-e2e.sh [e2e-1|e2e-2|e2e-3]

PROJECT_DIR="/Users/smith/projects/bscamp"
RUNTIME="$PROJECT_DIR/.claude/runtime"
PASS=0; FAIL=0

check() {
    local DESC="$1"; local COND="$2"
    if eval "$COND"; then
        echo "✅ $DESC"; PASS=$((PASS+1))
    else
        echo "❌ $DESC"; FAIL=$((FAIL+1))
    fi
}

case "${1:-e2e-1}" in
e2e-1)
    echo "=== E2E-1: 단일 팀 풀 체인 ==="
    check "last-completion-report.json 존재" "[ -f '$RUNTIME/last-completion-report.json' ]"
    check "chain-sent.log에 기록 있음" "[ -f '$RUNTIME/chain-sent.log' ] && [ -s '$RUNTIME/chain-sent.log' ]"
    check "PM 세션 기동 확인" "tmux has-session -t sdk-pm 2>/dev/null"
    check "COO 세션 기동 확인" "tmux has-session -t hermes 2>/dev/null"
    check "broker 기동 확인" "curl -sf http://localhost:7899/health >/dev/null 2>&1"
    # PM 수신 확인: broker check-messages
    local PM_MSGS=$(curl -sf -X POST http://localhost:7899/check-messages \
        -H 'Content-Type: application/json' \
        -d '{"peer_id":"pm-leader"}' 2>/dev/null | jq -r '.messages | length' 2>/dev/null)
    check "PM에 메시지 도착 (${PM_MSGS:-0}건)" "[ '${PM_MSGS:-0}' -gt 0 ]"
    ;;
e2e-2)
    echo "=== E2E-2: Match Rate 미달 루프 ==="
    check "분석 문서 존재" "ls $PROJECT_DIR/docs/03-analysis/*.analysis.md >/dev/null 2>&1"
    check "chain-sent.log 기록" "[ -s '$RUNTIME/chain-sent.log' ]"
    ;;
e2e-3)
    echo "=== E2E-3: 병렬 팀 독립 체인 ==="
    check "CTO-1 context 유지" "ls $RUNTIME/team-context-sdk-cto*.json >/dev/null 2>&1"
    check "chain-sent.log에 2건+ 기록" "[ $(wc -l < '$RUNTIME/chain-sent.log' 2>/dev/null || echo 0) -ge 2 ]"
    ;;
esac

echo ""
echo "결과: ✅ $PASS / ❌ $FAIL"
[ "$FAIL" -eq 0 ] && echo "🎉 전체 통과" || echo "⚠️ 실패 항목 확인 필요"
```

### 수정 파일

| 파일 | 변경 | 변경량 |
|------|------|--------|
| `.claude/hooks/verify-chain-e2e.sh` | **신규** — 자동 검증 스크립트 | ~80줄 |

### TDD 케이스 (mock 환경, 기존 테스트 확장)

| ID | 시나리오 | 검증 | 기대 결과 |
|----|---------|------|-----------|
| P2-1 | E2E-1 시뮬레이션: handoff → PM 전달 | mock broker + chain-messenger | send_chain_message 호출 + msg_id 기록 |
| P2-2 | E2E-2 시뮬레이션: 80% → exit 2 → 96% → exit 0 | match-rate 주입 | 1차 exit 2, 2차 exit 0 |
| P2-3 | E2E-3 시뮬레이션: 병렬 context 독립 | 2개 session context 동시 생성 | 각각 독립 resolve |
| P2-4 | verify-chain-e2e.sh 기본 실행 | 스크립트 문법 검증 | bash -n 통과 |

---

## 문제 3: 리더 역할 제한 + 배포 화이트리스트

### 현재 문제

```bash
# validate-delegate.sh L96-101:
# 리더 (pane_index == 0) + src/ 파일 → exit 2 차단
# → 이건 맞음

# 하지만 리더가 Bash로 gcloud 명령어 실행할 때:
# validate-delegate.sh는 Edit|Write hook이므로 Bash는 영향 없음
# → 실제 차단은 다른 곳?
```

**분석 결과**: `validate-delegate.sh`는 `PreToolUse(Edit|Write)` hook이므로 Bash 명령어는 차단하지 않는다. 리더의 배포 명령어 차단은 `destructive-detector.sh`의 Bash hook에서 발생할 수 있다.

CLAUDE.md의 feedback memory `feedback_leader_no_infra_commands.md`에 따르면: **"리더는 gcloud 등 인프라 CLI도 직접 실행 금지, 팀원 위임 필수"** — 이것은 기존 피드백이지만, TASK의 요구사항은 반대: 배포는 리더 권한으로 허용.

### 해결: 리더 배포 명령어 화이트리스트

TASK 지시에 따라 **배포/인프라 명령어는 리더만 가능**으로 전환한다.

#### 3-1. 리더 배포 화이트리스트 (validate-delegate.sh 확장)

현재 validate-delegate.sh는 Edit|Write matcher이므로 Bash 명령어와 무관하다. 배포 명령어 통제는 별도 hook이 필요하다.

**방안: `validate-deploy-authority.sh` 신규 hook (PreToolUse Bash)**

```bash
#!/bin/bash
# validate-deploy-authority.sh — 배포 명령어는 리더만 허용
# PreToolUse(Bash) hook
# 팀원이 배포 명령어 실행 → exit 2 차단
# 리더가 배포 명령어 실행 → exit 0 허용

DEPLOY_WHITELIST=(
    "gcloud run deploy"
    "gcloud storage cp"
    "gcloud app deploy"
    "gcloud builds submit"
    "gcloud functions deploy"
    "gcloud scheduler"
    "docker push"
    "firebase deploy"
)

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

[ -z "$COMMAND" ] && exit 0

# 배포 명령어인지 확인
IS_DEPLOY=false
for PATTERN in "${DEPLOY_WHITELIST[@]}"; do
    if echo "$COMMAND" | grep -q "$PATTERN"; then
        IS_DEPLOY=true
        break
    fi
done

# 배포 명령어가 아니면 패스
[ "$IS_DEPLOY" = "false" ] && exit 0

# tmux 환경 아니면 패스
[ -z "${TMUX:-}" ] && exit 0
[ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" != "1" ] && exit 0

# 리더/팀원 판별
PANE_INDEX=$(tmux display-message -p '#{pane_index}' 2>/dev/null)
[ -z "$PANE_INDEX" ] && exit 0

# 리더 (pane 0) → 허용
if [ "$PANE_INDEX" -eq 0 ] 2>/dev/null; then
    exit 0
fi

# 팀원 (pane 1+) → 차단
echo "BLOCKED: 배포 명령어는 리더 권한. 리더에게 배포를 요청하세요: $COMMAND" >&2
exit 2
```

#### 3-2. settings.local.json 등록

기존 `Bash` matcher hook 목록에 `validate-deploy-authority.sh` 추가:

```json
{
    "matcher": "Bash",
    "hooks": [
        // 기존 7개...
        { "type": "command", "command": ".claude/hooks/validate-deploy-authority.sh" }
    ]
}
```

#### 3-3. 엣지케이스

| 케이스 | 처리 |
|--------|------|
| 리더가 `gcloud run deploy` | 허용 (pane 0 + 배포 명령어) |
| 팀원이 `gcloud run deploy` | 차단 (pane 1+ + 배포 명령어) |
| 리더가 `gcloud storage ls` (조회) | 패스 (화이트리스트에 없음 → 비배포 명령어) |
| 팀원이 `npm run build` | 패스 (비배포 명령어 → 기존 로직 유지) |
| 리더가 `gcloud storage cp ... gs://` | 허용 (화이트리스트 매칭) |
| 파이프 명령: `npm run build && gcloud run deploy` | 화이트리스트 매칭 → 리더만 허용 |

#### 3-4. 기존 feedback memory 업데이트

`feedback_leader_no_infra_commands.md` 업데이트 필요:
- AS-IS: "리더는 gcloud 등 인프라 CLI도 직접 실행 금지"
- TO-BE: "리더는 배포/인프라 명령어 실행 가능 (TASK 지시). 팀원은 차단."

### 수정 파일

| 파일 | 변경 | 변경량 |
|------|------|--------|
| `.claude/hooks/validate-deploy-authority.sh` | **신규** — 배포 권한 hook | ~50줄 |
| `.claude/settings.local.json` | Bash matcher에 hook 추가 | ~1줄 |

### TDD 케이스

| ID | 시나리오 | 검증 | 기대 결과 |
|----|---------|------|-----------|
| P3-1 | 리더 + gcloud run deploy | pane_index=0, command="gcloud run deploy..." | exit 0 (허용) |
| P3-2 | 팀원 + gcloud run deploy | pane_index=1, command="gcloud run deploy..." | exit 2 (차단) |
| P3-3 | 팀원 + npm run build | pane_index=1, command="npm run build" | exit 0 (비배포) |
| P3-4 | 리더 + gcloud storage cp gs:// | pane_index=0, command="gcloud storage cp ..." | exit 0 (허용) |
| P3-5 | tmux 없는 환경 | TMUX='', command="gcloud run deploy" | exit 0 (패스) |
| P3-6 | 복합 명령: build && deploy | pane_index=1, command="npm run build && gcloud run deploy" | exit 2 (차단) |

---

## 문제 4: 대시보드 동기화 근본 수정

### 현재 문제

`dashboard-sync-loop.sh`가 매분 git commit+push → 7,396건 커밋 + GitHub Actions 메일 폭탄. 스크립트 삭제 완료. 대안 없는 상태.

### 해결: GCS 직접 업로드 (git 미경유)

#### 4-1. 아키텍처

```
AS-IS (삭제됨):
  state.json → git add → git commit → git push → GitHub Actions → GCS
  (매분 실행 → 7,396건 커밋 + 메일 폭탄)

TO-BE:
  state.json 변경 감지 → gcloud storage cp → GCS 직접 업로드
  (변경 있을 때만 실행, git 무관)
```

#### 4-2. `dashboard-sync.sh` 신규 스크립트

```bash
#!/bin/bash
# dashboard-sync.sh — state.json을 GCS에 직접 업로드
# cron 또는 hook에서 호출
# git 경유하지 않음 — GCS 직접 업로드만

PROJECT_DIR="/Users/smith/projects/bscamp"
STATE_FILE="$PROJECT_DIR/.claude/runtime/state.json"
GCS_DEST="gs://mozzi-reports/dashboard/state.json"
HASH_FILE="$PROJECT_DIR/.claude/runtime/.state-hash"

# state.json 없으면 스킵
[ ! -f "$STATE_FILE" ] && exit 0

# 변경 감지: md5 비교
CURRENT_HASH=$(md5 -q "$STATE_FILE" 2>/dev/null || md5sum "$STATE_FILE" | awk '{print $1}')
LAST_HASH=""
[ -f "$HASH_FILE" ] && LAST_HASH=$(cat "$HASH_FILE")

# 변경 없으면 스킵
if [ "$CURRENT_HASH" = "$LAST_HASH" ]; then
    exit 0
fi

# GCS 업로드
if gcloud storage cp "$STATE_FILE" "$GCS_DEST" \
    --cache-control="no-cache, max-age=0" \
    --content-type="application/json" 2>/dev/null; then
    echo "$CURRENT_HASH" > "$HASH_FILE"
    exit 0
fi

echo "dashboard-sync: GCS 업로드 실패" >&2
exit 1
```

#### 4-3. 실행 방식: 2가지 트리거

| 트리거 | 방식 | 빈도 |
|--------|------|------|
| **cron (주기적)** | `crontab -e` 또는 launchd plist | 10분 간격 |
| **hook (이벤트)** | TaskCompleted hook에 추가 | TASK 완료 시마다 |

**cron 설정 (crontab)**:
```
*/10 * * * * /Users/smith/projects/bscamp/.claude/hooks/dashboard-sync.sh
```

**hook 연동 (선택적)**: task-completed.sh 또는 pdca-update.sh 끝에 호출:
```bash
# state.json이 갱신된 직후
"$PROJECT_DIR/.claude/hooks/dashboard-sync.sh" &
```

#### 4-4. 기존 reports/ 배포와의 관계

| 대상 | 방식 | 변경 |
|------|------|------|
| `state.json` (대시보드) | GCS 직접 업로드 (신규) | **이 문서** |
| `reports/` (모찌리포트) | git push → GitHub Actions → GCS | 변경 없음 |

#### 4-5. 엣지케이스

| 케이스 | 처리 |
|--------|------|
| state.json 미존재 | exit 0 스킵 |
| gcloud 미인증 | 업로드 실패 → exit 1 → cron 다음 주기 재시도 |
| state.json 미변경 | md5 비교 → 동일 → 스킵 (불필요 업로드 방지) |
| 동시 실행 (cron + hook) | md5 비교가 자연스러운 lock 역할 → 중복 업로드해도 idempotent |

### 수정 파일

| 파일 | 변경 | 변경량 |
|------|------|--------|
| `.claude/hooks/dashboard-sync.sh` | **신규** — GCS 직접 업로드 | ~30줄 |

### TDD 케이스

| ID | 시나리오 | 검증 | 기대 결과 |
|----|---------|------|-----------|
| P4-1 | state.json 변경 시 업로드 호출 | mock gcloud + 파일 변경 | gcloud storage cp 호출 + hash 갱신 |
| P4-2 | state.json 미변경 시 스킵 | 동일 hash | gcloud 호출 없음 |
| P4-3 | state.json 미존재 | 파일 없음 | exit 0 |
| P4-4 | gcloud 실패 | gcloud mock exit 1 | exit 1 + hash 미갱신 |
| P4-5 | 스크립트 문법 검증 | bash -n | 통과 |

---

## 문제 5: heartbeat patrol 실전 검증

### 현재 문제

`settings.local.json`의 `TeammateIdle: []` — heartbeat 미설정 상태. agent-ops-phase2.plan.md에 B2 `runHeartbeatOnce`가 설계 예정이었으나 미구현.

CC의 heartbeat는 `every: "5m"` 설정으로 팀원 idle 감지 후 hook을 실행하는 기능이다. 현재 `teammate-idle.sh`는 존재하지만 설정이 비어있어 발동되지 않는다.

### 해결: heartbeat 설정 + TDD + watchdog

#### 5-1. settings.local.json heartbeat 설정

```json
{
    "hooks": {
        "TeammateIdle": [
            {
                "type": "command",
                "command": ".claude/hooks/teammate-idle.sh",
                "timeout": 15000
            }
        ]
    }
}
```

#### 5-2. teammate-idle.sh 기능 확인/보강

현재 `teammate-idle.sh` 존재 여부와 내용을 확인하고 필요 시 보강:

```bash
#!/bin/bash
# teammate-idle.sh — 팀원 idle 감지 시 실행
# TeammateIdle hook: CC가 5분 idle 감지 후 자동 호출
#
# 체크리스트:
# 1. 팀원 상태 확인 (tmux pane alive?)
# 2. 할당된 TASK 진행 상태 확인
# 3. stuck 판단 → 리더에게 보고
# 4. HEARTBEAT.md 업데이트

PROJECT_DIR="/Users/smith/projects/bscamp"
RUNTIME="$PROJECT_DIR/.claude/runtime"
HEARTBEAT_LOG="$RUNTIME/heartbeat.log"

# 타임스탬프 기록
mkdir -p "$RUNTIME" 2>/dev/null
echo "$(date '+%Y-%m-%d %H:%M:%S') heartbeat fired" >> "$HEARTBEAT_LOG"

# 팀원 상태 수집
source "$(dirname "$0")/helpers/team-context-resolver.sh" 2>/dev/null
resolve_team_context 2>/dev/null
CONTEXT_FILE="${TEAM_CONTEXT_FILE:-}"

if [ -f "$CONTEXT_FILE" ]; then
    TEAM=$(jq -r '.team // "unknown"' "$CONTEXT_FILE" 2>/dev/null)
    # 팀원 pane 상태 수집
    ACTIVE_PANES=$(tmux list-panes -t "$(tmux display-message -p '#{session_name}')" -F '#{pane_index} #{pane_current_command}' 2>/dev/null | tail -n +2)
    echo "$(date '+%Y-%m-%d %H:%M:%S') team=$TEAM panes: $ACTIVE_PANES" >> "$HEARTBEAT_LOG"
fi

# 좀비 pane 감지
source "$(dirname "$0")/helpers/zombie-pane-detector.sh" 2>/dev/null
if type detect_zombie_panes >/dev/null 2>&1; then
    ZOMBIES=$(detect_zombie_panes 2>/dev/null)
    if [ -n "$ZOMBIES" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') ZOMBIE detected: $ZOMBIES" >> "$HEARTBEAT_LOG"
        # Slack 알림
        source "$(dirname "$0")/notify-hook.sh" 2>/dev/null
        notify_hook "⚠️ [heartbeat] 좀비 pane 감지: $ZOMBIES" "heartbeat" 2>/dev/null
    fi
fi

exit 0
```

#### 5-3. heartbeat watchdog: 발동 확인

heartbeat가 실제로 돌고 있는지 확인하는 watchdog:

```bash
#!/bin/bash
# heartbeat-watchdog.sh — heartbeat 미발동 감지
# cron 또는 session-resume-check.sh에서 호출
# heartbeat.log의 마지막 기록이 15분 이상 전이면 알림

HEARTBEAT_LOG="/Users/smith/projects/bscamp/.claude/runtime/heartbeat.log"

[ ! -f "$HEARTBEAT_LOG" ] && { echo "heartbeat.log 미존재 — heartbeat 미설정 의심" >&2; exit 1; }

LAST_LINE=$(tail -1 "$HEARTBEAT_LOG")
LAST_TS=$(echo "$LAST_LINE" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}')
[ -z "$LAST_TS" ] && exit 1

LAST_EPOCH=$(date -j -f '%Y-%m-%d %H:%M:%S' "$LAST_TS" +%s 2>/dev/null)
NOW=$(date +%s)
AGE=$((NOW - LAST_EPOCH))

# 15분 (900초) 이상이면 경고
if [ "$AGE" -gt 900 ]; then
    echo "⚠️ heartbeat 미발동 ${AGE}초 (마지막: $LAST_TS)" >&2
    exit 1
fi

exit 0
```

#### 5-4. 엣지케이스

| 케이스 | 처리 |
|--------|------|
| 팀원 없는 세션 | heartbeat 미발동 (CC 자체 동작 — 팀원 있을 때만) |
| heartbeat.log 미존재 | watchdog exit 1 → 알림 |
| heartbeat 간격 > 15분 | watchdog 경고 (CC 내부 설정이 5분이므로 15분 초과 = 이상) |
| 여러 세션 동시 heartbeat | 각 세션 별도 heartbeat.log (runtime 디렉토리 공유) |

### 수정 파일

| 파일 | 변경 | 변경량 |
|------|------|--------|
| `.claude/settings.local.json` | TeammateIdle hook 등록 | ~5줄 |
| `.claude/hooks/teammate-idle.sh` | 보강 (heartbeat 로그 + 좀비 감지) | ~40줄 |
| `.claude/hooks/heartbeat-watchdog.sh` | **신규** — 미발동 감지 | ~25줄 |

### TDD 케이스

| ID | 시나리오 | 검증 | 기대 결과 |
|----|---------|------|-----------|
| P5-1 | heartbeat 발동 시 로그 기록 | teammate-idle.sh 실행 | heartbeat.log에 타임스탬프 기록 |
| P5-2 | 좀비 pane 감지 시 알림 | zombie-pane-detector mock | heartbeat.log에 ZOMBIE 기록 |
| P5-3 | watchdog: 정상 (5분 전 기록) | heartbeat.log 최근 기록 | exit 0 |
| P5-4 | watchdog: 이상 (20분 전 기록) | heartbeat.log 오래된 기록 | exit 1 + 경고 메시지 |
| P5-5 | watchdog: 로그 미존재 | heartbeat.log 없음 | exit 1 |
| P5-6 | 팀원 상태 수집 | team-context + tmux mock | heartbeat.log에 team/panes 기록 |

---

## Smith님 실전 검증 체크리스트

> 이전 TASK에서 미완성된 실전 체크리스트 포함. Smith님이 직접 확인하는 항목.

### A. 체인 자동화 실전 검증 (5분)

```
□ 1. 세션 상태 확인
  □ tmux ls → CTO-2, PM, COO(hermes) 세션 존재
  □ broker 기동 확인: curl http://localhost:7899/health
  □ peer-map.json에 3팀 등록 확인

□ 2. CTO-2에서 간단 TASK 실행
  □ 팀원 생성 → 코드 1줄 수정 → 완료 → TeamDelete
  □ pdca-chain-handoff.sh 발동 확인 (로그)
  □ PM 세션에 COMPLETION_REPORT 도착 확인

□ 3. PM 검수 → COO 전달
  □ PM에서 pm-chain-forward.sh 발동 확인
  □ COO(모찌)에 보고 도착 확인

□ 4. 체인 로그 확인
  □ cat .claude/runtime/chain-sent.log → 전송 기록 있음
  □ cat .claude/runtime/last-completion-report.json → 보고서 존재
```

### B. 승인 게이트 검증 (3분)

```
□ 1. 팀원이 .claude/ 파일 수정 시도
  □ "BLOCKED: 승인 필요" 메시지 표시
  □ .claude/runtime/approvals/pending/ 에 요청 파일 생성됨
  □ 리더 pane에 send-keys 알림 도착 (구현 후)

□ 2. 리더가 승인 처리
  □ ! echo $(date +%s) > .claude/runtime/approvals/granted/{key}
  □ 팀원 재시도 → 통과 확인

□ 3. 5분 TTL 확인
  □ 승인 후 6분 대기 → 팀원 재시도 → 다시 차단
```

### C. 배포 권한 검증 (2분)

```
□ 1. 리더가 배포 명령어 실행
  □ gcloud run deploy --dry-run → 통과 (차단 안 됨)

□ 2. 팀원이 배포 명령어 실행
  □ gcloud run deploy → "BLOCKED: 배포 명령어는 리더 권한" 차단

□ 3. 비배포 명령어 확인
  □ 리더/팀원 모두 npm run build → 통과
```

### D. 대시보드 동기화 검증 (2분)

```
□ 1. state.json 수정 → dashboard-sync.sh 실행
  □ GCS에 업로드 확인: gcloud storage ls gs://mozzi-reports/dashboard/state.json
  □ .state-hash 파일 갱신 확인

□ 2. state.json 미변경 → 재실행
  □ "스킵" 확인 (GCS 미호출)
```

### E. heartbeat 검증 (3분)

```
□ 1. 팀원이 있는 세션에서 5분 대기
  □ .claude/runtime/heartbeat.log에 기록 생성 확인

□ 2. watchdog 확인
  □ bash heartbeat-watchdog.sh → exit 0 (정상)

□ 3. 좀비 감지 (선택)
  □ 팀원 pane을 수동 kill → heartbeat에서 ZOMBIE 감지 확인
```

### F. 회귀 확인 (2분)

```
□ 1. 기존 TDD 전체 실행
  □ npx vitest run __tests__/hooks/ → 전체 Green

□ 2. 빌드 확인
  □ npx tsc --noEmit --quiet → 에러 0
  □ npm run build → 성공
```

---

## 전체 수정 파일 총괄

| # | 파일 | 변경 | 변경량 | 문제 |
|---|------|------|--------|------|
| 1 | `.claude/hooks/helpers/approval-handler.sh` | `notify_leader_approval()` 추가 | ~25줄 | #1 |
| 2 | `.claude/hooks/verify-chain-e2e.sh` | **신규** — 실전 검증 스크립트 | ~80줄 | #2 |
| 3 | `.claude/hooks/validate-deploy-authority.sh` | **신규** — 배포 권한 hook | ~50줄 | #3 |
| 4 | `.claude/settings.local.json` | Bash hook 추가 + TeammateIdle 설정 | ~8줄 | #3, #5 |
| 5 | `.claude/hooks/dashboard-sync.sh` | **신규** — GCS 직접 업로드 | ~30줄 | #4 |
| 6 | `.claude/hooks/teammate-idle.sh` | heartbeat 로그 + 좀비 감지 보강 | ~40줄 | #5 |
| 7 | `.claude/hooks/heartbeat-watchdog.sh` | **신규** — 미발동 감지 | ~25줄 | #5 |
| | **합계** | 신규 4 + 수정 3 = **7파일** | **~258줄** | |

---

## 전체 TDD 케이스 총괄

| 문제 | ID 범위 | 케이스 수 | 테스트 파일 |
|------|---------|----------|------------|
| #1 승인 자동 감지 | P1-1 ~ P1-6 | 6건 | `__tests__/hooks/approval-gate.test.ts` 확장 |
| #2 체인 실전 테스트 | P2-1 ~ P2-4 | 4건 | `__tests__/hooks/chain-e2e-realworld.test.ts` 확장 |
| #3 배포 화이트리스트 | P3-1 ~ P3-6 | 6건 | `__tests__/hooks/deploy-authority.test.ts` **신규** |
| #4 대시보드 동기화 | P4-1 ~ P4-5 | 5건 | `__tests__/hooks/dashboard-sync.test.ts` **신규** |
| #5 heartbeat 검증 | P5-1 ~ P5-6 | 6건 | `__tests__/hooks/heartbeat.test.ts` **신규** |
| | **합계** | **27건** | 기존 2 확장 + 신규 3 |

---

## 구현 순서 (권장)

| 순서 | 항목 | 이유 |
|------|------|------|
| 1 | #1 승인 자동 감지 | 기존 코드 최소 수정 (1파일), 팀원 stuck 즉시 해결 |
| 2 | #3 배포 화이트리스트 | 신규 hook 추가만, 기존 hook 수정 없음 |
| 3 | #5 heartbeat 검증 | 설정 + 보강, 독립적 |
| 4 | #4 대시보드 동기화 | 독립 스크립트, 기존 시스템 영향 없음 |
| 5 | #2 체인 실전 테스트 | 1~4 구현 완료 후 전체 검증 |

---

## 검증 기준

- [ ] 5건 전부 Design에 반영 ✅
- [ ] 각 건별 수정 파일 + TDD 케이스 명시 ✅
- [ ] 실전 테스트 시나리오 포함 ✅ (E2E-1~3 + verify-chain-e2e.sh)
- [ ] Smith님 실전 체크리스트 포함 ✅ (A~F 섹션)
- [ ] 기존 TDD 433건 회귀 영향 없음 (신규 파일 추가 위주)
