# TASK: brick-hook-link-codex-qa

**담당**: PM (sdk-pm) → Design, CTO-1 (sdk-cto) → 구현
**산출물**: docs/02-design/features/brick-hook-link-codex-qa.design.md
**레벨**: L2 Design
**우선순위**: P0 (이번 브릭 핵심)

---

## 배경

CTO가 코드를 짤 때마다(커밋 시) Codex가 감시자처럼 QA를 자동 실행하고,
결과를 COO(모찌)에게 보고하고, COO가 코드 검토까지 끝내서 Smith님에게 보고하는 파이프라인.

## 요구사항

### 1. Hook Link (7번째 Link 타입)
- 기존 6개: sequential, branch, loop, parallel, compete, cron
- 신규: `hook` — 외부 이벤트가 발생하면 다음 블록 발동
- cron = 시간 기반 트리거, hook = 이벤트 기반 트리거
- git `post-commit` hook → 브릭 API 호출 → Link 발동 → 다음 블록 실행

### 2. Codex QA 블록
- `codex review --commit HEAD` 또는 `--uncommitted` 실행
- adapter: `claude_local` (이번 Sprint에서 구현 완료)
- 커스텀 프롬프트 지원: 보안 취약점, 타입 에러, 테스트 누락 등

### 3. 결과 보고 파이프라인
- Codex QA 완료 → COO(모찌)에게 Slack DM 보고 (채널: D09V1NX98SK)
- 보고 내용: QA 결과 요약 + 파일 목록 + 이슈 목록
- COO가 코드 직접 검토 (diff 확인)
- COO 검토 완료 → Smith님에게 Slack 보고

### 4. 프리셋 예시
```yaml
blocks:
  - id: do
    type: Do
    what: "구현"
  - id: codex-qa
    type: QA
    what: "codex review --commit HEAD"

links:
  - from: do
    to: codex-qa
    type: hook
    trigger: post-commit  # git post-commit 이벤트

teams:
  do: {adapter: claude_agent_teams}
  codex-qa: {adapter: claude_local, config: {command: codex, extraArgs: ["review", "--commit", "HEAD"]}}
```

## 선행 완료
- 3axis-plugin (45/45 PASS) — Link 레지스트리 이미 dict 기반. `register_link("hook", handler)` 1줄로 추가 가능
- claude_local 어댑터 구현 완료 — codex CLI 실행 가능
- EventBus 있음 — 이벤트 발행/구독 인프라

## 레퍼런스
- 기존 cron Link: `state_machine.py` → `_resolve_cron()` (시간 트리거 패턴 참고)
- git hook: `.bkit/hooks/` 디렉토리 (기존 hook 인프라)
- codex CLI: `codex review --help` (커밋/브랜치/uncommitted 리뷰)

## 제약
- 기존 Link 6종 동작 변경 금지
- Link 레지스트리 패턴 유지 (dict 기반)
- 프리셋 YAML 하위호환
- COO 보고는 Slack API (webhook 또는 기존 알림 채널)

## 완료 기준
- Hook Link 등록 + git post-commit → 브릭 블록 발동
- Codex QA 결과 → COO Slack 보고
- COO 코드 검토 → Smith님 Slack 보고
- TDD 케이스 전부 PASS

**COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.**
