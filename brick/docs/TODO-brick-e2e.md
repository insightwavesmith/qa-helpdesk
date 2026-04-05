# TODO — 브릭 E2E 완전 자동화

> 2026-04-04 정정. 이전 버전은 과장된 진단이 있었음. 실제 문제에 맞게 수정.

## 현황
- 3축 엔진 동작 ✅ (482 passed, 체인 실행 확인)
- bkit hooks 충돌로 자동 실행 실패 ❌ (SessionStart → AskUserQuestion → exit 1)
- `--bare`로 우회 가능하지만 CLAUDE.md 안 읽히는 부작용

---

## P0 — 지금 해야 할 것

### 1. bkit hooks 정리
- **문제**: bkit SessionStart hook이 `--print` 모드에서 `AskUserQuestion` 강제 호출 → exit 1
- **해결**: hooks 3개만 남기고 제거 (destructive-detector, prevent-tmux-kill, enforce-agent-teams)
- **검증**: `--bare` 없이 `claude --print -`로 블록 실행 → exit 0

### 2. bkit 요소 추출 → CLAUDE.md 적용
- 템플릿 3개 (plan, design, report) → `docs/templates/` 복사
- 에이전트 프롬프트 6개 (gap-detector, code-analyzer, design-validator, cto-lead, pm-lead, qa-monitor)
- 상세: `docs/bkit-decomposition.md`

### 3. 디버깅 프로세스 (블록 실패 자동 진단)
- **문제**: 블록 실패 시 "exit code 1" + stderr 비어있음. 원인 찾는 데 5분+
- **해결**: Slack agent-ops에 실패 알림 — exit code + stderr 마지막 10줄 + 실패 원인 자동 분류
- **검증**: 의도적 실패 → Slack 메시지만 보고 원인 파악 가능한가?

---

## P1 — 다음 (운영 품질)

### 4. assignee 기반 어댑터 아키텍처
- 블록과 참여자 분리. `cto`/`pm` 하드코딩 → `assignee` 필드 기반

### 5. COO 어댑터
- EventBus → OpenClaw API → 모찌한테 직접 전달 → 자동 검토+승인/반려

### 6. Smith 어댑터
- 워크플로우 완료 → Smith님 DM 자동 보고 + 승인/반려

### 7. 반려 사유 전달
- Gate FAIL / COO 반려 시 `context.reject_reason` 주입

### 8. Slack 알림 개선
- 작업 정보 표기 (feature + task 이름)
- 시점 정리 (workflow 시작/완료만 디폴트)

### 9. 테스트 Slack 격리
- `BRICK_ENV=test` 시 Slack 미발송 (mock 처리)

---

## P2 — 나중

### 10. 워크플로우 대시보드 (웹 UI)
### 11. 어댑터 헬스체크 (서버 시작 시 사전 검증)
### 12. 멀티유저 + RBAC (오픈소스용)
