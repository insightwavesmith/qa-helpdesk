# Brick Engine — CLAUDE.md

> 브릭 엔진 프로젝트 공통 규칙. 모든 에이전트가 세션 시작 시 읽어야 함.

## 프로젝트 개요

브릭(Brick)은 PDCA 워크플로우 오케스트레이션 엔진이다.
프리셋(YAML) 기반으로 블록 → 링크 → 게이트 → 이벤트 순서를 정의하고,
어댑터(claude_local, human, webhook 등)를 통해 각 블록을 실행한다.

## 디렉토리 구조

```
brick/
  brick/           # 엔진 코어 (Python)
    adapters/      # TeamAdapter 구현체
    engine/        # Executor, StateMachine, EventBus, ...
    gates/         # GateExecutor, 핸들러
    models/        # Block, Workflow, Event, Team 모델
    dashboard/     # FastAPI 대시보드
  .claude/agents/  # 에이전트 정의 (name, description, tools, model)
  templates/       # PDCA 문서 템플릿
  presets/         # 워크플로우 프리셋 YAML
  projects/        # 프로젝트별 산출물 (tasks, plans, designs, reports)
  tests/           # pytest 테스트
```

## 핵심 규칙

1. **Python 3.12+**: type hints 필수. `from __future__ import annotations` 사용.
2. **asyncio**: 엔진 코어는 async/await 기반. `asyncio.run()` 진입점.
3. **YAML 프리셋**: `brick/preset-v2` 스키마. blocks, links, teams, gates 구조.
4. **이벤트 기반**: EventBus publish/subscribe. 블록 간 커플링 금지.
5. **Gate 필수**: 블록 완료 시 Gate 검증 통과해야 다음 블록 진행.
6. **Checkpoint**: 모든 상태 변경은 CheckpointStore에 저장. 크래시 복구 가능.
7. **어댑터 격리**: 각 어댑터는 독립 프로세스/스레드. 실패해도 엔진 중단 안 됨.

## PDCA 문서 규칙

- Plan: `projects/{project}/plans/{feature}.md`
- Design: `projects/{project}/designs/{feature}.md`
- Report: `projects/{project}/reports/{feature}.md`
- 템플릿: `templates/` 디렉토리의 .md 파일 사용

## 변수 치환

프리셋 YAML에서 `{project}`, `{feature}` 변수를 사용할 수 있다.
PresetLoader가 로드 시 자동으로 치환한다.

```yaml
project: bscamp
feature: brick-p0-3axis
blocks:
  - id: plan
    what: "Plan for {project}/{feature}"
    done:
      artifacts: ["{project}/plans/{feature}.md"]
```

## 테스트

```bash
python3 -m pytest brick/tests/ -q        # 기존 테스트
python3 -m pytest brick/__tests__/ -q     # TDD 테스트
```

## 커밋 컨벤션

- prefix: feat/fix/refactor/test/chore
- 한글 커밋 메시지
- 변경 파일 수 표시

## 에이전트 역할

| 역할 | 담당 | 금지 |
|------|------|------|
| cto-lead | 구현 조율, 코드 리뷰, 배포 | Plan/Design 작성 |
| pm-lead | Plan, Design, TDD 케이스 | src/ 코드 수정 |
| qa-monitor | 테스트 실행, Gap 분석 | 기능 구현 |
| report-generator | 완료 보고서 생성 | 코드 수정 |
