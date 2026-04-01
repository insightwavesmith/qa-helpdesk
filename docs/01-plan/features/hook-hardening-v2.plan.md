# Hook Hardening V2 (훅 보강 2차) Plan

> 작성일: 2026-04-01
> 프로세스 레벨: L2-기능 (PDCA)
> 작성자: PM 리더
> 근거: operational-issues.md OI-007 ~ OI-017 (14건 Open)

---

## Executive Summary

현재 hook 시스템에 14건의 우회/결함이 확인됨. 이번 작업으로 전체 해결한다.
핵심: **T-PDCA 프로세스의 모든 단계를 훅으로 강제**하되, 복구 경로도 보장.

---

## 대상 이슈 전체 목록

### 🔴 Critical (5건 — 즉시)

| ID | 문제 | 해결 |
|----|------|------|
| OI-001 | pane_index 할당 버그 | validate-delegate.sh에 pane 재확인 로직 |
| OI-007 | Bash 파일 수정으로 역할 경계 우회 (11패턴) | `bash-file-write-guard.sh` 신규 hook |
| OI-008 | Slack 알림 5가지 우회 경로 | 크론 감시 + 실패 재시도 + 토큰 보호 |
| OI-014 | Hook 데드락 (좀비 팀 복구 불가) | 강제 종료 플래그 + 좀비 자동 정리 |

### 🟡 High (7건 — 1차 스프린트)

| ID | 문제 | 해결 |
|----|------|------|
| OI-003 | ODAX 레거시 PAUSED 미처리 | PAUSED 캠페인 포함 |
| OI-009 | MOCK_ 변수 프로덕션 동작 | BKIT_TEST=true 조건부 허용 |
| OI-010 | TaskCompleted hook 순서 (quality-gate > gap-analysis) | 순서 swap |
| OI-012 | validate-pdca stale state 오탐 | Track B 경로 스킵 |
| OI-015 | COO→팀 TASK 없이 전달 가능 | `validate-task-before-message.sh` 신규 hook |
| OI-016 | Smith→팀 직접 접근 COO 미경유 | `route-to-coo.sh` 인바운드 라우팅 |
| OI-017 | 체인 핸드오프 Plan/Design 미검증 | pdca-chain-handoff.sh 게이트 추가 |

### 🟢 Medium (2건 — 2차 스프린트)

| ID | 문제 | 해결 |
|----|------|------|
| OI-011 | runtime JSON 조작 가능 | 체크섬 검증 |
| OI-013 | webhook/broker 단일 장애점 | 크론 fallback + 마커 |

---

## Feature 분리 (구현 단위)

### F-1: bash-file-write-guard (OI-007) — Critical
- **산출물**: `.bkit/hooks/bash-file-write-guard.sh`
- **동작**: PreToolUse:Bash에서 sed/awk/python/node/cat/echo/cp/mv/tee/dd 파일 쓰기 패턴 감지 → 대상 경로가 허용 목록 외면 exit 2
- **허용 경로**: docs/, .bkit/state/, .bkit/runtime/, /tmp/, TASK*.md, *.log
- **settings.local.json**: PreToolUse:Bash hooks 배열에 추가

### F-2: slack-defense (OI-008) — Critical
- **산출물**: 
  - `.bkit/hooks/helpers/slack-retry-queue.sh` — 전송 실패 시 큐에 적재
  - `.bkit/cron/slack-watchdog.sh` — 5분 크론: git log vs Slack 대조 + 재전송
  - `notify-completion.sh` 수정 — 실패 시 retry-queue 호출
- **토큰 보호**: SLACK_BOT_TOKEN unset 감지 hook

### F-3: deadlock-recovery (OI-014) — Critical
- **산출물**:
  - `validate-pdca-before-teamdelete.sh` 수정 — `FORCE_DELETE=true` 환경변수 시 PDCA 스킵
  - `session-resume-check.sh` 수정 — config.json 없는 좀비 팀 자동 정리
  - validate-delegate.sh 허용 목록에 `.claude/teams/*/config.json` 추가

### F-4: mock-env-guard (OI-009) — High
- **산출물**: 각 hook에서 MOCK_ 변수 사용 시 `BKIT_TEST=true` 체크 추가
- **대상**: pane-access-guard.sh, filter-completion-dm.sh

### F-5: hook-order-fix (OI-010) — High
- **산출물**: settings.local.json TaskCompleted 순서 변경
  - gap-analysis.sh → #2 (quality-gate 앞으로)
  - task-quality-gate.sh → #3 (gap-analysis 뒤로)

### F-6: pdca-stale-fix (OI-012) — High
- **산출물**: validate-pdca.sh 수정
  - Track B 경로 판별: staged 파일이 `docs/`, `.bkit/`, `TASK`, `CLAUDE` 등만이면 → pdca 검증 스킵
  - src/ 포함 시에만 기존 로직 실행

### F-7: t-stage-enforcement (OI-015, 016, 017) — High ★신규 핵심
- **산출물 3개**:
  1. `.bkit/hooks/validate-task-before-message.sh` — COO가 claude-peers send_message로 팀에 전달 시 TASK 파일 + coo_approved 체크. 없으면 차단
  2. `.bkit/hooks/route-to-coo.sh` — 팀 세션에 인바운드 메시지 도착 시 발신자가 COO가 아니면 → "COO를 거쳐야 합니다" 안내 + COO에 자동 전달
  3. `pdca-chain-handoff.sh` 수정 — CTO 전달 전 레벨별 Plan/Design 존재 체크 (L2/L3: 둘 다, L1: Design만)

### F-8: runtime-integrity (OI-011, 013) — Medium (2차 스프린트)
- **산출물**:
  - `.bkit/hooks/helpers/json-checksum.sh` — runtime JSON 쓰기 시 sha256 기록
  - `.bkit/cron/runtime-integrity-check.sh` — 일일 크론: 체크섬 대조
  - pdca-chain-handoff.sh fallback 강화 — webhook + Slack + 마커 3중 fallback

---

## 구현 순서 + 의존성

```
Phase 1 (Critical — 병렬 가능)
  F-1 bash-file-write-guard ──────── 독립
  F-3 deadlock-recovery ──────────── 독립
  F-5 hook-order-fix ─────────────── 독립 (settings.json 수정만)

Phase 2 (High — F-1 완료 후)
  F-4 mock-env-guard ─────────────── 독립
  F-6 pdca-stale-fix ─────────────── 독립
  F-7 t-stage-enforcement ────────── 독립 (핵심 신규)

Phase 3 (Slack 방어 — 독립)
  F-2 slack-defense ──────────────── 크론 설정 필요

Phase 4 (Medium — 2차 스프린트)
  F-8 runtime-integrity ──────────── F-2 크론 패턴 재사용
```

---

## 완료 조건

- [ ] OI-007~017 전체 14건 Open → Resolved
- [ ] 신규 hook 4개: bash-file-write-guard, validate-task-before-message, route-to-coo, slack-retry-queue
- [ ] 수정 hook 6개: validate-pdca-before-teamdelete, session-resume-check, validate-delegate, validate-pdca, pdca-chain-handoff, notify-completion
- [ ] settings.local.json hook 순서 수정 (F-5)
- [ ] 크론 2개: slack-watchdog, runtime-integrity-check
- [ ] shell 테스트 전량 PASS (기존 63건 + 신규)
- [ ] block-logger 연동 확인 (신규 hook 전부 EXIT trap 포함)

---

## 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| bash-file-write-guard 오탐 | 정상 팀원 작업 차단 | 허용 경로 충분히 넓게 + 팀원은 is-teammate.sh로 패스 |
| route-to-coo 무한 루프 | COO → 팀 → COO 반복 | COO 발신 메시지는 라우팅 스킵 |
| hook 추가로 Bash 실행 지연 | 작업 속도 저하 | 신규 hook timeout 5초 이내 |
| deadlock-recovery FORCE_DELETE 남용 | PDCA 기록 누락 | FORCE_DELETE 시 Slack 경고 알림 |
