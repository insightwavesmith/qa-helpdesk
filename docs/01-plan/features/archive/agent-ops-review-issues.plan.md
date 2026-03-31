# Agent Ops Platform 리뷰 이슈 3건 조사 + 대안 Plan

> 작성일: 2026-03-29
> 프로세스 레벨: L1 (리서치/분석, src/ 미수정)
> 목적: 코드+사용성 리뷰에서 발견된 3건에 대해 레퍼런스 조사 후 최적 방안 제시

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | Agent Ops Review Issues 3건 조사 |
| **작성일** | 2026-03-29 |
| **범위** | 이슈 A(hook→MCP), B(세션 복구), C(의사결정 게이트) |
| **산출물** | 이슈별 COO 의견 검증 + 대안 비교 + 최종 권고 |

| 관점 | 내용 |
|------|------|
| **Problem** | 3건 모두 "지금은 수동 fallback"에 의존 → 운영 리스크 |
| **Solution** | 이슈별 최적 방안 선정 → TASK화 → CTO 구현 |
| **Core Value** | Smith님 TASK→배포 파이프라인의 변수를 0으로 줄이기 |

---

## 이슈 A: Hook에서 MCP 자동 메시지 전송

### 현재 문제

`pdca-chain-handoff.sh`가 Match Rate 95%+ 확인 후 stdout에 `ACTION_REQUIRED` 출력만 함.
리더 에이전트가 이 출력을 읽고 수동으로 `send_message` MCP tool을 실행해야 함.

```
현재: hook → stdout "ACTION_REQUIRED" → 리더가 수동 send_message
원하는: hook → 자동 PM 알림 → 끝
```

### COO 의견

> broker가 HTTP 서버니까 `curl`로 `localhost:7899/send-message` 때리면 됨.

### 검증 결과: COO 의견 **방향은 맞지만 보완 필요**

broker HTTP API 확인 결과 (`POST /send-message`):

```bash
curl -X POST http://localhost:7899/send-message \
  -H 'Content-Type: application/json' \
  -d '{"from_id": "abc123", "to_id": "def456", "text": "{...JSON...}"}'
```

**문제점**: `from_id`와 `to_id`는 **peer ID** (세션마다 바뀌는 8자리 랜덤값)이지 역할명이 아님.
hook은 현재 세션의 peer ID를 모르고, PM의 peer ID도 모름.

→ `/list-peers`로 먼저 peer를 찾아야 함:

```bash
# 1단계: 자기 ID 확인 (등록되어 있어야 함)
# 2단계: PM peer 찾기
PM_PEER=$(curl -s http://localhost:7899/list-peers \
  -H 'Content-Type: application/json' \
  -d '{"scope":"repo","cwd":"'$PWD'","git_root":"'$PWD'"}' \
  | jq -r '.[] | select(.summary | test("PM_LEADER")) | .id')
# 3단계: 메시지 전송
curl -X POST http://localhost:7899/send-message \
  -H 'Content-Type: application/json' \
  -d '{"from_id":"'$MY_ID'","to_id":"'$PM_PEER'","text":"'$PAYLOAD'"}'
```

### 대안 비교

| 방안 | 설명 | 장점 | 단점 |
|------|------|------|------|
| **A1: curl 직접** (COO안 보완) | hook에서 `/list-peers` → `/send-message` curl 호출 | 간단, 추가 인프라 불필요 | peer ID 조회 필요, from_id 문제 (hook에는 자기 peer ID 없음) |
| **A2: HTTP hook (type: "http")** | CC의 native HTTP hook으로 외부 서버에 POST → 서버가 MCP 호출 | CC 공식 패턴, async 지원 | 별도 HTTP 서버 필요 (relay server) |
| **A3: broker relay endpoint** | broker에 `/relay-message` 엔드포인트 추가 (역할명 기반 전송) | hook이 역할명만 알면 됨, peer ID 불필요 | broker 코드 수정 필요 (upstream fork) |
| **A4: 파일 큐 + watcher** | hook이 `/tmp/action-queue.json`에 쓰기 → watcher가 읽고 MCP 실행 | hook 변경 최소 | watcher 프로세스 추가 관리 필요 |

### 최종 권고: **A1 (curl 직접) + peer ID 해결책**

근거:
1. **A2**는 relay 서버를 새로 만들어야 함 — 과잉 투자
2. **A3**은 upstream broker 코드 수정 — 유지보수 비용 높음
3. **A4**는 watcher 프로세스 추가 — 장애 포인트 증가
4. **A1**은 기존 curl 패턴(notify-completion.sh, agent-slack-notify.sh)과 동일 — 검증된 패턴

**peer ID 해결**: hook 실행 시점에 리더 세션이 이미 broker에 등록되어 있으므로:

```bash
# 자기 ID: team-context.json 또는 환경변수에서 (SessionStart에서 기록)
MY_ID=$(jq -r '.peerId // empty' "$PROJECT_DIR/.claude/runtime/team-context.json")

# PM peer: list-peers로 summary에서 "PM_LEADER" 매칭
PM_ID=$(curl -s -X POST http://localhost:7899/list-peers \
  -H 'Content-Type: application/json' \
  -d '{"scope":"repo","cwd":"'"$PROJECT_DIR"'","git_root":"'"$PROJECT_DIR"'"}' \
  | jq -r '[.[] | select(.summary | test("PM_LEADER"))][0].id // empty')
```

**fallback**: PM peer 없으면 → 기존 ACTION_REQUIRED stdout (수동 fallback)
**from_id 없으면**: `/register`로 임시 등록 → 메시지 전송 → `/unregister`

### 참고 (Claude Code HTTP hooks)

CC v2.1+ 에서 `type: "http"` hook 지원됨 ([공식 문서](https://code.claude.com/docs/en/hooks)):

```json
{
  "type": "http",
  "url": "http://localhost:8080/hooks/task-completed",
  "timeout": 30,
  "headers": { "Authorization": "Bearer $TOKEN" }
}
```

현재는 과잉이지만, 향후 대시보드 서버(localhost:3000)에 hook relay endpoint를 추가하면
A2 방식으로 전환 가능. 확장성 확보.

---

## 이슈 B: 세션 죽으면 복구

### 현재 문제

CTO 세션이 TASK 중간에 죽으면 → 팀원 프로세스 소멸 → 진행 상태 불명 → 수동 파악 후 재시작.

### COO 의견

> teammate-registry.json + pdca-status.json에 상태 저장돼있으니까 재시작 시 읽고 이어가면 됨. 수동이지만 가능.

### 검증 결과: COO 의견 **맞음, 그런데 자동화 가능**

#### 현재 영속 상태 (코드베이스 확인)

| 파일 | 내용 | 크래시 후 생존 |
|------|------|:-----------:|
| `.bkit/state/pdca-status.json` | 피처별 phase, matchRate, timestamps | O |
| `.claude/runtime/teammate-registry.json` | 팀 멤버, 상태, shutdownState | O |
| `.claude/tasks/BOARD.json` | 팀별 TASK 할당, 미완료 목록 | O |
| `~/.claude-peers.db` | 모든 peer 등록, 미배달 메시지 (SQLite WAL) | O |
| `.bkit/state/session-history.json` | 세션 기록 (625건) | O |
| `.bkit/state/resume/` | **비어 있음 (인프라만 존재)** | - |
| 팀원 프로세스 (RAM) | 활성 팀원 상태, 진행 중 작업 | **X (소멸)** |

#### 레퍼런스: 다른 프레임워크의 복구 패턴

**LangGraph 1.0** ([Production Multi-Agent](https://markaicode.com/langgraph-production-agent/)):
- 모든 상태 전이를 자동 checkpoint → 크래시 후 정확히 그 지점에서 재개
- Durable execution: 서버 재시작 후 자동 복구
- Reducer 로직으로 동시 업데이트 머지

**CrewAI v1.10** ([AI Agent Frameworks 2026](https://letsdatascience.com/blog/ai-agent-frameworks-compared)):
- Task 단위 checkpoint → `replay` 명령으로 실패 지점부터 재시작
- 자동은 아니지만 수동 재개 비용 최소화

**SQLite WAL** ([공식 문서](https://sqlite.org/wal.html)):
- 크래시 후 첫 연결이 자동 recovery 수행
- `delivered=0` 메시지는 100% 생존
- broker 재시작 시 `cleanStalePeers()`로 죽은 peer 자동 정리 (30초 주기)

**"Your AI Agent Crashed at Step 47. Now What?"** ([DEV Community](https://dev.to/george_belsky_a513cfbf3df/your-ai-agent-crashed-at-step-47-now-what-41mb)):
- 핵심: "Log every state transition. Resume from last checkpoint. Don't replay from scratch."
- 패턴: checkpoint file + SessionStart hook에서 "이전 세션 미완료 감지 → 자동 재개"

### 대안 비교

| 방안 | 설명 | 자동화 수준 | 구현 비용 |
|------|------|:---------:|:--------:|
| **B1: 수동 재개** (COO안) | 리더가 registry+pdca 읽고 수동 이어가기 | 0% | 0 |
| **B2: SessionStart hook** | 세션 시작 시 자동으로 미완료 TASK 감지 → 보고 | 50% | 낮음 |
| **B3: Checkpoint + auto-resume** | LangGraph 스타일 자동 체크포인트 → 자동 재개 | 90% | 높음 |
| **B4: CLAUDE.md 지시** | CLAUDE.md에 "세션 시작 시 pdca-status 읽고 이어가라" 규칙 추가 | 30% | 최소 |

### 최종 권고: **B2 (SessionStart hook) + B4 (CLAUDE.md 규칙)**

근거:
1. **B3**은 LangGraph 수준 인프라 — 현재 bash hook 체계로는 과잉
2. **B1**은 리더가 매번 수동으로 파악 — 느리고 빠뜨릴 수 있음
3. **B2+B4 조합**이 비용 대비 효과 최대:

**B2 구현 (SessionStart hook)**:

```bash
#!/bin/bash
# session-resume-check.sh — 세션 시작 시 미완료 TASK 자동 감지

PDCA="$PROJECT_DIR/.bkit/state/pdca-status.json"
REGISTRY="$PROJECT_DIR/.claude/runtime/teammate-registry.json"

# 1. 미완료 피처 감지
INCOMPLETE=$(jq -r '
  .features | to_entries[] |
  select(.value.currentState != "completed" and .value.currentState != null) |
  "\(.key): \(.value.currentState) (phase: \(.value.phase // "unknown"))"
' "$PDCA" 2>/dev/null)

if [ -n "$INCOMPLETE" ]; then
    echo "⚠ 미완료 작업 감지:"
    echo "$INCOMPLETE"
    echo ""
    echo "이전 세션에서 중단된 작업입니다. pdca-status.json과 TASK 파일을 확인하세요."
fi

# 2. 좀비 팀원 감지
if [ -f "$REGISTRY" ]; then
    ZOMBIES=$(jq -r '
      .members | to_entries[] |
      select(.value.state == "active") | .key
    ' "$REGISTRY" 2>/dev/null)
    if [ -n "$ZOMBIES" ]; then
        echo "⚠ 이전 세션 팀원 잔존: $ZOMBIES (registry 정리 필요)"
    fi
fi

exit 0  # 정보 제공만, 차단 안 함
```

**B4 추가 (CLAUDE.md)**:

```markdown
## 세션 재시작 복구 프로토콜
세션 시작 시 아래 순서로 상태 확인:
1. `.bkit/state/pdca-status.json` — 미완료 피처 확인
2. `.claude/runtime/teammate-registry.json` — 좀비 팀원 정리
3. `.claude/tasks/BOARD.json` — 미할당 TASK 확인
4. 미완료 TASK가 있으면 → 해당 TASK부터 이어서 진행
```

**broker 복구**는 별도 조치 불필요:
- SQLite WAL이 자동 crash recovery 수행
- `cleanStalePeers()`가 죽은 peer 30초 내 정리
- 미배달 메시지(`delivered=0`)는 자동 보존 → 다음 poll에서 수신

---

## 이슈 C: 의사결정 입력 지점

### 현재 문제

리뷰에서 "PM 합격/불합격, Smith님 승인/반려를 어디서 입력?"이 미정의라고 지적.

### COO 의견

> Match Rate 95% 자동 게이트라 수동 입력 필요 없음. 이슈 아닌 것 같다.

### 검증 결과: COO 의견 **절반만 맞음**

#### Match Rate가 잡는 것과 못 잡는 것

| Match Rate가 잡는 것 | Match Rate가 못 잡는 것 |
|---------------------|----------------------|
| 설계서 체크리스트 누락 | 기획 의도와 구현의 미묘한 불일치 |
| API endpoint 불일치 | UX 흐름의 어색함 |
| 데이터 모델 차이 | 비즈니스 로직 edge case |
| 파일 구조 불일치 | 성능/보안 관련 판단 |
| 테스트 커버리지 부족 | "설계서가 틀렸는데 코드는 설계대로 만든" 경우 |

#### 레퍼런스

**CodeRabbit 2026 리뷰** ([UCStrategies](https://ucstrategies.com/news/coderabbit-review-2026-fast-ai-code-reviews-but-a-critical-gap-enterprises-cant-ignore/)):
> AI code review hits 46% accuracy on real-world runtime bugs. 자동 리뷰로 잡히는 건 스타일과 패턴뿐, 의도 검증과 시스템 영향은 여전히 사람의 영역.

**The Review Gap** ([DEV Community](https://dev.to/thesythesis/the-review-gap-16ff)):
> 40% quality deficit projected — AI가 코드 생성 속도를 높였지만, 검증 역량은 선형. 리뷰 없이 배포하면 기술 부채가 기하급수적 증가.

**CI/CD Approval Gates** ([JFrog](https://jfrog.com/blog/proceed-with-care-how-to-use-approval-gates-in-pipelines/), [InfoQ](https://www.infoq.com/articles/pipeline-quality-gates/)):
> 자동 게이트와 인간 승인 게이트를 결합. 소규모 변경은 자동 통과, 고위험 변경만 인간 리뷰.

#### 구체적 사례: Match Rate 95%인데 문제인 경우

**사례 1: "Specification Gap"**
```
설계서: "로그인 API → JWT 반환"
구현: JWT 반환 ✓ (Match Rate 100%)
문제: refresh token rotation 미설계 → 7일 후 전원 로그아웃
→ 설계서 자체가 불완전했지만 Match Rate는 100%
```

**사례 2: "UX Intent Mismatch"**
```
설계서: "질문 목록 페이지 → 최신순 정렬"
구현: 최신순 정렬 ✓ (Match Rate 95%+)
문제: Smith님 의도는 "답변 없는 질문 먼저" → 기획 의도 누락
→ PM이 보면 3초 만에 발견, 자동 게이트로는 불가능
```

**사례 3: "Cross-Feature Interaction"**
```
설계서: "A 기능 추가"
구현: A 기능 ✓ (Match Rate 97%)
문제: A가 기존 B 기능의 캐시를 무효화 → B 성능 5배 저하
→ 단일 기능 Gap 분석으로는 교차 영향 미검출
```

### 결론: **PM 검수는 필요하다. 다만 경량화가 핵심.**

COO가 맞는 부분: **모든 TASK에 수동 승인을 걸면 병목**이 됨.
COO가 틀린 부분: **자동 게이트만으로는 설계서 자체의 오류, UX 의도 불일치, 교차 영향을 잡지 못함**.

### 대안 비교

| 방안 | 설명 | PM 부하 | 리스크 커버 |
|------|------|:------:|:---------:|
| **C1: 수동 입력 없음** (COO안) | Match Rate 95%면 자동 통과 | 0 | 낮음 |
| **C2: 전수 리뷰** | PM이 모든 TASK를 수동 검수 | 높음 | 높음 |
| **C3: 위험도 기반 게이트** | L3 + 특정 패턴만 PM 검수, 나머지 자동 | 낮음 | 중상 |
| **C4: 타임아웃 자동 승인** | PM에게 알림 → 30분 내 반려 없으면 자동 승인 | 최소 | 중상 |

### 최종 권고: **C3 (위험도 기반) + C4 (타임아웃) 조합**

```
Match Rate 95%+ 통과 후:

[L0/L1] → 자동 통과 (PM 검수 없음)
[L2 일반] → PM에 MCP 알림 + 30분 타임아웃 자동 승인
[L2 고위험*] → PM 수동 승인 필수 (타임아웃 없음)
[L3] → PM 수동 승인 필수 + Smith님 최종 승인

*고위험 패턴: auth, middleware, migration, payment, 기존 API 변경
```

**구현**:

```bash
# pdca-chain-handoff.sh에 추가
LEVEL=$(source "$(dirname "$0")/detect-process-level.sh" && echo "$PROCESS_LEVEL")
HIGH_RISK=$(echo "$CHANGED_FILES" | grep -cE '(auth|middleware|migration|payment)' || true)

if [ "$LEVEL" -le 1 ]; then
    # L0/L1: PM 스킵, COO에 직접 보고
    CHAIN_STEP="cto_to_coo"
elif [ "$LEVEL" -ge 3 ] || [ "$HIGH_RISK" -gt 0 ]; then
    # L3 또는 고위험: PM 필수 검수 (타임아웃 없음)
    CHAIN_STEP="cto_to_pm"
    PAYLOAD_EXTRA='"requires_manual_review": true'
else
    # L2 일반: PM 알림 + 30분 타임아웃
    CHAIN_STEP="cto_to_pm"
    PAYLOAD_EXTRA='"auto_approve_after_minutes": 30'
fi
```

**PM 검수 프로토콜 (경량화)**:

PM은 코드를 보지 않음. 아래 3가지만 확인 (3분 이내):
1. **TASK 요약** — "뭘 했는지"가 원래 기획 의도와 맞는지
2. **변경 파일 목록** — 예상 범위를 벗어난 파일이 있는지
3. **Match Rate + Gap 분석 요약** — 불일치 항목이 심각한지

---

## 종합 실행 계획

| 순서 | 이슈 | 방안 | 구현 범위 | 우선순위 |
|:----:|:----:|------|----------|:--------:|
| 1 | A | curl 직접 전송 + peer ID 조회 | pdca-chain-handoff.sh 수정 | P0 |
| 2 | C | 위험도 기반 게이트 + 타임아웃 | pdca-chain-handoff.sh + CLAUDE.md | P0 |
| 3 | B | SessionStart hook + CLAUDE.md | session-resume-check.sh 신규 | P1 |

**이슈 A+C는 같은 파일(pdca-chain-handoff.sh)이므로 한 번에 구현 가능.**

### 하지 말 것
- broker 코드(upstream) 수정
- relay server 신규 구축
- LangGraph 스타일 풀 체크포인트 시스템 구축
- src/ 코드 수정

---

## Sources

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [CodeRabbit Review 2026 — Enterprise Gap](https://ucstrategies.com/news/coderabbit-review-2026-fast-ai-code-reviews-but-a-critical-gap-enterprises-cant-ignore/)
- [CI/CD Approval Gates — JFrog](https://jfrog.com/blog/proceed-with-care-how-to-use-approval-gates-in-pipelines/)
- [Pipeline Quality Gates — InfoQ](https://www.infoq.com/articles/pipeline-quality-gates/)
- [LangGraph Production Multi-Agent](https://markaicode.com/langgraph-production-agent/)
- [AI Agent Crash Recovery — DEV Community](https://dev.to/george_belsky_a513cfbf3df/your-ai-agent-crashed-at-step-47-now-what-41mb)
- [SQLite WAL — Official Docs](https://sqlite.org/wal.html)
- [AI Agent Frameworks Compared 2026](https://letsdatascience.com/blog/ai-agent-frameworks-compared)
- [The Review Gap — DEV Community](https://dev.to/thesythesis/the-review-gap-16ff)
