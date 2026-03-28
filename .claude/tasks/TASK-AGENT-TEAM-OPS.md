---
team: CTO
session: sdk-cto
created: 2026-03-28
status: in-progress
owner: leader
assignees:
  - role: backend-dev
    tasks: [W1-1, W1-2, W1-3, W2-1, W2-2, W3-1, W3-2, W3-3]
  - role: qa-engineer
    tasks: [W4-1, W4-2, W4-3]
---
# TASK: 에이전트팀 운영 체계 구현

## 타입
개발

## 배경
**이게 뭔지**: 에이전트팀 운영을 자동화하는 hooks/scripts 구현. TASK 소유권 + 팀 상시 유지 + 3단계 종료 자동화.
**왜 필요한지**: ① 크로스팀 TASK 배정 무한 루프 ② 팀원 종료 매번 수동 5~10분 ③ 매 TASK마다 팀 삭제/재생성 반복. 세 가지 문제를 한 번에 해결.
**구현 내용**: TASK 프론트매터 파싱 + team-context.json + teammate-registry.json + auto-shutdown.sh + hook 정비.

## 설계서
- Plan: `docs/01-plan/features/agent-team-operations.plan.md`
- Design: `docs/02-design/features/agent-team-operations.design.md` (작성 예정)

**설계서를 반드시 읽고 시작해라. 설계에 없는 기능 임의 추가 금지.**

## 통합 이력
이 TASK는 기존 `TASK-TEAMMATE-LIFECYCLE.md`를 대체한다. 기존 3개 Plan + 2개 Design이 각 1개로 통합됨.

## Wave 1: TASK 소유권 (의존성 없음)

- [ ] W1-1: TASK 프론트매터 파싱 헬퍼 (parse_frontmatter 함수) — `.claude/hooks/helpers/frontmatter-parser.sh`
- [ ] W1-2: team-context.json 생성/갱신 로직 — `.claude/runtime/team-context.json`
- [ ] W1-3: teammate-registry.json 스키마 + 초기화 로직 — `.claude/runtime/teammate-registry.json`

## Wave 2: 종료 자동화 (Wave 1 완료 후)

- [ ] W2-1: auto-shutdown.sh 신규 작성 (3단계 프로토콜) — `.claude/hooks/auto-shutdown.sh`
- [ ] W2-2: force-team-kill.sh 개선 (레지스트리 갱신 + 리더 보호) — `.claude/hooks/force-team-kill.sh`

## Wave 3: Hook 정비 (Wave 2 완료 후)

- [ ] W3-1: auto-team-cleanup.sh 개선 (알림만, auto-shutdown 호출 없음) — `.claude/hooks/auto-team-cleanup.sh`
- [ ] W3-2: settings.local.json TeammateIdle 비활성 확인 — `.claude/settings.local.json`
- [ ] W3-3: CLAUDE.md 규칙 업데이트 초안 (팀 상시 유지 + 종료 프로세스) — `CLAUDE.md`

## Wave 4: 검증

- [ ] W4-1: 수동 테스트 — TeamCreate → 연속 TASK → auto-shutdown 전체 플로우
- [ ] W4-2: tmux list-panes로 좀비 0건 확인
- [ ] W4-3: Gap 분석 → `docs/03-analysis/agent-team-operations.analysis.md`

## 파일 경계

### backend-dev
```
.claude/hooks/helpers/frontmatter-parser.sh (신규 또는 기존 활용)
.claude/hooks/auto-shutdown.sh (신규)
.claude/hooks/force-team-kill.sh (수정)
.claude/hooks/auto-team-cleanup.sh (수정)
.claude/runtime/team-context.json (신규)
.claude/runtime/teammate-registry.json (신규)
.claude/settings.local.json (확인만)
CLAUDE.md (초안 작성)
```

### qa-engineer
```
docs/03-analysis/agent-team-operations.analysis.md (신규)
```

## 절대 주의 (2026-03-28 프로세스 점검 결과)

**TeammateIdle hook은 비활성(빈 배열 `[]`) 유지. 절대 재활성화하지 마라.**
- teammate-idle.sh 수정/개선 금지
- settings.local.json의 TeammateIdle에 hook 등록 금지
- 작업 배정은 리더 SendMessage로만 수행 — 이것이 올바른 프로세스
- 상세: `docs/01-plan/features/agent-team-operations.plan.md` 섹션 2 (D-2) 참조

**auto-team-cleanup.sh는 알림만. auto-shutdown 자동 트리거 금지.**
- TASK 완료 시 리더에게 알림만 전송
- 리더가 판단: 다음 TASK 배정 또는 세션 종료
- 상세: Plan 섹션 2 (D-3) 참조

## 하지 말 것
- src/ 코드 수정 (이 TASK는 hooks/scripts만)
- Claude Code 내부 메커니즘 수정 (외부 스크립트로만 제어)
- Slack 알림 연동 (별도 TASK)
- 크로스팀 종료 오케스트레이션 (단일 팀 범위만)
- **teammate-idle.sh 수정/재활성화 (비활성 유지가 정답)**
- TaskCompleted에서 auto-shutdown 자동 호출 (리더 명시적 호출만)

## 완료 후 QA
1. tsc + build 통과 (hooks만 수정이라 빌드 영향 없어야 함)
2. 수동 테스트: TeamCreate → 팀원 spawn → 연속 TASK 수행 → 세션 종료 → auto-shutdown → TeamDelete
3. tmux list-panes에서 좀비 pane 0개 확인
4. ~/.claude/teams/ 에서 좀비 디렉토리 0개 확인
5. Gap 분석 Match Rate 90%+
