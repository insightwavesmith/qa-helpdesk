# TASK: PM팀 — 슬랙 알림 + 오케스트레이션 설계 마무리

## CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라

## 배경
대시보드 Plan+Design은 완료됨 (agent-dashboard.plan.md, agent-dashboard.design.md).
이제 남은 건:
1. 슬랙 알림 상세 설계 — CTO팀이 구현할 수 있는 수준으로
2. 3팀 오케스트레이션 체인 규약 문서화

## TASK 1: 슬랙 알림 상세 설계
- 기존 Plan에 T11~T13 (slack-notifier, chain-detector, hook 트리거)이 있음
- 이걸 CTO팀이 바로 구현 가능한 수준으로 상세화:
  - 메시지 포맷 (Block Kit JSON 예시)
  - 이벤트 목록 (작업 시작/완료/에러/체인전달/승인필요)
  - 채널 매핑 (#agent-pm, #agent-cto, #agent-mkt + Smith DM)
  - API 엔드포인트 설계 (POST /api/agent-notify)
- `docs/02-design/features/slack-notification.design.md`에 작성

## TASK 2: 오케스트레이션 체인 규약
- 팀 간 핸드오프 규약: 어떤 파일에 뭘 쓰면 다음 팀이 시작하는지
- `/tmp/cross-team/` 파일 포맷 표준화
- 모찌(COO)가 체크하는 타이밍 + 트리거 정의
- `docs/02-design/features/orchestration-chain.design.md`에 작성

## TASK 3: 완료 마커
- 완료되면 `/tmp/cross-team/pm-slack-design-done.md`에 요약 작성
- CTO팀으로 체인 전달용

## 하지 말 것
- 대시보드 기획 다시 하기 (이미 완료)
- 코드 작성 (PM은 기획만)
- 처방 시스템 PRD (나중에)
