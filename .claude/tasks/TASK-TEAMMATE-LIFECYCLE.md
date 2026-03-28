---
team: CTO
session: sdk-cto
created: 2026-03-28
status: archived
owner: leader
assignees:
  - role: backend-dev
    tasks: [W1-1, W1-2, W1-3, W2-1, W2-2]
  - role: qa-engineer
    tasks: [W3-1, W3-2, W3-3]
---
# TASK: 팀원 생명주기 자동화 구현

> **통합됨 → `TASK-AGENT-TEAM-OPS.md` 참조. 이 파일은 이력 보존용.**

## 타입
개발

## 배경
**이게 뭔지**: 팀원 종료가 매번 수동 (shutdown 무시 → tmux kill → TeamDelete 차단)이라 자동화 필요.
**왜 필요한지**: 세션마다 5~10분 수동 정리. 토큰 낭비. 좀비 프로세스 누적. RET 사고 반복.
**구현 내용**: 3단계 Graceful Shutdown + teammate-registry.json + hook 개선.

## 설계서
- Plan: `docs/01-plan/features/teammate-lifecycle.plan.md`
- Design: `docs/02-design/features/teammate-lifecycle.design.md`

**설계서를 반드시 읽고 시작해라. 설계에 없는 기능 임의 추가 금지.**

## Wave 1: 핵심 (파일 3개, 의존성 없음)

- [ ] W1-1: teammate-registry.json 생성 로직 (build_registry_from_config 함수)
- [ ] W1-2: `.claude/hooks/auto-shutdown.sh` 신규 작성 (3단계 프로토콜)
- [ ] W1-3: `.claude/hooks/force-team-kill.sh` 개선 (레지스트리 갱신 + 리더 보호)

## Wave 2: 통합 (파일 3개, Wave 1 완료 후)

- [ ] W2-1: `.claude/hooks/auto-team-cleanup.sh` 개선 (auto-shutdown 호출)
- [ ] W2-2: `.claude/settings.local.json` 확인 (TeammateIdle 비활성 유지 확인)

## Wave 3: 검증

- [ ] W3-1: 수동 테스트 — 팀 생성 → 작업 → auto-shutdown 전체 플로우
- [ ] W3-2: tmux list-panes로 좀비 0건 확인
- [ ] W3-3: Gap 분석 → `docs/03-analysis/teammate-lifecycle.analysis.md`

## 파일 경계

### backend-dev
```
.claude/hooks/auto-shutdown.sh (신규)
.claude/hooks/force-team-kill.sh (수정)
.claude/hooks/auto-team-cleanup.sh (수정)
.claude/settings.local.json (확인만)
```

### qa-engineer
```
docs/03-analysis/teammate-lifecycle.analysis.md (신규)
```

## 절대 주의 (2026-03-28 프로세스 점검 결과)

**TeammateIdle hook은 비활성(빈 배열 `[]`) 유지. 절대 재활성화하지 마라.**
- teammate-idle.sh 수정/개선 금지
- settings.local.json의 TeammateIdle에 hook 등록 금지
- 작업 배정은 리더 SendMessage로만 수행 — 이것이 올바른 프로세스
- 상세: `docs/01-plan/features/teammate-lifecycle.plan.md` 섹션 3-3, 3-4 참조

## 하지 말 것
- src/ 코드 수정 (이 TASK는 hooks/scripts만)
- Claude Code 내부 메커니즘 수정 (외부 스크립트로만 제어)
- Slack 알림 연동 (별도 TASK)
- 크로스팀 종료 오케스트레이션 (단일 팀 범위만)
- **teammate-idle.sh 수정/재활성화 (비활성 유지가 정답)**

## 완료 후 QA
1. tsc + build 통과 (hooks만 수정이라 빌드 영향 없어야 함)
2. 수동 테스트: TeamCreate → 팀원 spawn → TASK 수행 → 자동 종료 전체 플로우
3. tmux list-panes에서 좀비 pane 0개 확인
4. ~/.claude/teams/ 에서 좀비 디렉토리 0개 확인
5. Gap 분석 Match Rate 90%+
