# TASK 소유권 프로세스 기획서

> **PM 관점 프로세스/구조 해결 방안**
> 작성일: 2026-03-28
> 상태: Plan

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | TASK 소유권 + Hook 컨텍스트 인식 프로세스 재설계 |
| **작성일** | 2026-03-28 |
| **예상 소요** | Wave 1~3, 총 3단계 |
| **핵심 문제** | Hook이 "누가 뭘 하고 있는지" 모른다 → 크로스팀 TASK 배정 → 무한 루프 |
| **핵심 해결** | TASK 파일에 소유권 메타데이터 도입 + Hook이 세션/팀 컨텍스트 읽기 |
| **가치** | 팀원 idle 루프 제거, 토큰 낭비 방지, 다팀 병렬 운영 안정화 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | Hook이 TASK 소유권 모르고 전체 스캔 → 다른 팀 TASK를 현재 팀원에게 배정 → 무한 루프 |
| **Solution** | TASK 메타데이터에 team/session 소유권 + Hook이 자기 팀 TASK만 참조 |
| **Function UX Effect** | 팀원이 자기 팀 TASK만 받아 정상 작업, 리더가 크로스팀 충돌 신경 안 써도 됨 |
| **Core Value** | 다팀 병렬 운영의 안정성 확보 → 동시 3팀 운영 시 토큰/시간 낭비 제거 |

---

## 1. 문제 정의

### 1-1. 현상

TeammateIdle hook이 `.claude/tasks/TASK-*.md` 전체를 스캔하여 미완료 체크박스를 찾고, **팀 구분 없이** 다음 작업을 배정한다.

```
CTO팀 팀원 idle → teammate-idle.sh 실행
  → TASK-PM-RESUME.md의 미완료 항목 발견
  → "다음: [TASK-PM-RESUME.md] 슬랙 알림 상세 설계" 배정
  → CTO팀 팀원이 PM팀 작업 시도 → 권한/컨텍스트 없음 → 실패
  → 다시 idle → 다시 같은 TASK 배정 → 무한 루프
```

### 1-2. 영향 범위

| 영향 | 심각도 | 설명 |
|------|--------|------|
| 토큰 낭비 | **Critical** | idle 루프 1건당 ~500토큰/분, 30분 방치 시 ~15K 토큰 |
| 작업 간섭 | **High** | CTO팀원이 PM TASK 파일 수정 시도 → 충돌 |
| 리더 부담 | **Medium** | 리더가 수동으로 팀원 중단/재배정 필요 |
| 세션 불안정 | **Medium** | 무한 루프로 팀원 프로세스 불안정 → tmux 강제 종료 필요 |

### 1-3. 재현 조건

1. `.claude/tasks/`에 **2개 이상 팀**의 TASK 파일이 공존
2. 한 팀의 TASK가 모두 완료 → 팀원 idle
3. 다른 팀의 미완료 TASK가 존재
4. → 크로스팀 배정 발생

---

## 2. 근본 원인 분석

### RC-1: TASK 파일에 소유권 메타데이터 없음

현재 TASK 파일 구조:
```markdown
# TASK: CTO팀 남은 작업 마무리    ← 제목에 팀명이 있지만 파싱 규칙 없음
## 배경
...
### T1: ...
- [ ] 체크박스                     ← 어느 팀 TASK인지 기계가 판단 불가
```

**문제**: 파일명(TASK-CTO-RESUME)이나 제목에 팀명이 암시적으로 있지만, Hook은 정규표현식으로 `- [ ]`만 검색. 소유권 메타데이터가 구조화되어 있지 않음.

### RC-2: Hook이 세션 내부 상태를 모름

현재 Hook의 컨텍스트 인식:

| 정보 | 접근 가능 | 방법 |
|------|-----------|------|
| tmux pane_index | O | `tmux display-message -p '#{pane_index}'` |
| 리더 vs 팀원 | O | is-teammate.sh (pane_index > 0) |
| **현재 팀 이름** | **X** | 없음 |
| **현재 세션 ID** | **X** | 없음 |
| **할당된 TASK 목록** | **X** | 없음 |

Hook은 쉘 스크립트로 실행되므로 Claude Code 내부 상태(TeamCreate 팀명, 할당된 TASK 등)에 접근할 수 없다. 유일한 인터페이스는 환경변수와 파일시스템.

### RC-3: Hook 31개 중 11개 미등록

`.claude/hooks/` 디렉토리에 31개 쉘 스크립트가 있지만, `settings.local.json`에 등록된 것은 20개(중복 포함). 나머지 11개는 "만들었지만 연결 안 된" 상태:

| 미등록 Hook | 원래 목적 | 상태 |
|-------------|-----------|------|
| `agent-slack-notify.sh` | Slack 알림 발송 | 미연결 |
| `agent-state-sync.sh` | 팀 상태 JSON 동기화 | 미연결 |
| `detect-process-level.sh` | 프로세스 레벨 감지 | 미연결 |
| `enforce-teamcreate.sh` | Agent 단독 spawn 차단 | **미연결 (동작 안 함)** |
| `force-team-kill.sh` | 팀 강제 종료 | 미연결 |
| `gap-analysis.sh` | Gap 분석 자동 트리거 | 미연결 |
| `notify-hook.sh` | 범용 알림 | 미연결 |
| `notify-task-completed.sh` | TASK 완료 알림 | 미연결 |
| `protect-stage.sh` | 스테이지 보호 | 미연결 |
| `teammate-idle.sh` | 팀원 idle 배정 | **TeammateIdle: [] (빈 배열)** |
| `is-teammate.sh` | 팀원 감지 헬퍼 | 다른 hook이 source |

**특이점**: `TeammateIdle` 이벤트에 빈 배열 `[]`이 등록되어 있어, teammate-idle.sh가 **현재는 실행되지 않는다**. 하지만 이 hook을 재활성화하려면 소유권 문제를 먼저 해결해야 한다.

**추가 특이점**: `enforce-teamcreate.sh`가 미등록이면 Agent 단독 spawn 차단이 작동하지 않는다. 실제로 이전 세션에서 pm-prd 에이전트를 Agent 도구로 직접 spawn 시도 시 이 hook에 의해 차단된 이력이 있으므로, **다른 경로(사용자 훅 설정 등)로 활성화된 상태**일 수 있다.

---

## 3. 현재 상태 분석

### 3-1. TASK 파일 현황 (10개)

| 파일 | 암시적 팀 | 미완료 항목 | 비고 |
|------|-----------|------------|------|
| TASK-CTO-RESUME.md | CTO | 있음 | Railway 정리, USE_CLOUD_SQL 제거 등 |
| TASK-CTO-CLEAN.md | CTO | 있음 | CTO팀 정리 작업 |
| TASK-PM-RESUME.md | PM | 있음 | Slack 알림 설계, 오케스트레이션 |
| TASK-MKT-RESUME.md | MKT | 있음 | 오가닉 채널 Design 완성 |
| TASK-ORGANIC-PHASE2.md | MKT/CTO | 있음 (20건) | Wave 1~4, 크로스팀 |
| TASK-LP-MEDIA-DOWNLOAD.md | ? | ? | 팀 표시 없음 |
| TASK-COLLECTION-GAPS.md | ? | ? | 팀 표시 없음 |
| TASK-COLLECT-AND-EMBED.md | ? | ? | 팀 표시 없음 |
| TASK-DEEPGAZE-GEMINI-PIPELINE.md | ? | ? | 팀 표시 없음 |
| TASK-GCS-STORAGE-MIGRATION.md | ? | ? | 팀 표시 없음 |

**문제**: 10개 TASK 중 4개는 파일명에 팀 접두사가 있지만, 6개는 팀 소속이 불명. ORGANIC-PHASE2는 Wave별로 backend-dev/frontend-dev/qa-engineer가 다르고, 다수 팀에 걸쳐 있다.

### 3-2. Hook 이벤트 매핑

```
settings.local.json의 hook 이벤트:

PreToolUse (Bash)         → 8개 hook 등록
PreToolUse (Edit|Write)   → 4개 hook 등록
PreToolUse (Task)         → 1개 hook 등록
PreToolUse (TeamDelete)   → 1개 hook 등록
Stop                      → 1개 hook 등록
TaskCompleted             → 6개 hook 등록
TeammateIdle              → 0개 (빈 배열)
```

### 3-3. Hook 간 역할 중복/충돌

| 기능 | 담당 Hook | 중복/충돌 |
|------|-----------|-----------|
| TASK 완료 알림 | task-completed.sh, notify-completion.sh, notify-task-completed.sh (미등록) | 3개 중복 |
| PDCA 상태 업데이트 | pdca-update.sh, pdca-sync-monitor.sh, pdca-single-source.sh | 3개 역할 경계 불명확 |
| 팀원 종료 관리 | auto-team-cleanup.sh, force-team-kill.sh (미등록) | 2개 중복 |
| 설계서 검증 | validate-design.sh (Bash + Edit|Write 양쪽 등록) | 중복 실행 |

---

## 4. 해결 방안

### 4-1. TASK 소유권 메타데이터 도입

**핵심 변경**: TASK 파일 상단에 YAML 프론트매터로 소유권 정보를 명시한다.

```markdown
---
team: CTO-1
session: sdk-cto
created: 2026-03-26
status: in-progress
owner: leader
assignees:
  - role: backend-dev
    tasks: [T1, T2, T3]
  - role: frontend-dev
    tasks: [T13, T14, T15]
  - role: qa-engineer
    tasks: [T20]
---
# TASK: CTO팀 남은 작업 마무리
```

**필드 정의**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `team` | string | Y | 팀 식별자 (TeamCreate 시 지정한 이름) |
| `session` | string | N | tmux 세션명 (다중 세션 구분용) |
| `created` | date | Y | TASK 생성일 |
| `status` | enum | Y | `pending` / `in-progress` / `completed` / `archived` |
| `owner` | string | Y | TASK 소유자 (보통 `leader`) |
| `assignees` | array | N | 할당된 팀원 역할 + 담당 태스크 |

### 4-2. Hook 컨텍스트 파일 도입

Hook은 쉘 스크립트이므로 Claude Code 내부 상태를 직접 읽을 수 없다. 대신 **리더가 팀 생성 시 컨텍스트 파일을 생성**하고, Hook이 이를 참조한다.

**파일**: `.claude/runtime/team-context.json`

```json
{
  "team": "CTO-1",
  "session": "sdk-cto",
  "created": "2026-03-28T10:00:00+09:00",
  "taskFiles": [
    "TASK-CTO-RESUME.md",
    "TASK-CTO-CLEAN.md"
  ],
  "teammates": [
    { "role": "backend-dev", "paneIndex": 1 },
    { "role": "frontend-dev", "paneIndex": 2 },
    { "role": "qa-engineer", "paneIndex": 3 }
  ]
}
```

**생성 시점**: 리더가 TeamCreate 실행 직후, 첫 TASK 배정 전에 이 파일을 Write.
**삭제 시점**: TeamDelete 실행 직전 (validate-pdca-before-teamdelete.sh에서 정리).

### 4-3. teammate-idle.sh 개선

현재 (전체 스캔):
```bash
for f in "$TASKS_DIR"/TASK-*.md; do
    ITEMS=$(grep -n '^\- \[ \]' "$f" 2>/dev/null)
```

개선 (팀 소유 TASK만 스캔):
```bash
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"

# 1. 컨텍스트 파일 없으면 → 전체 스캔 (하위 호환)
if [ ! -f "$CONTEXT_FILE" ]; then
    TASK_FILES=$(ls "$TASKS_DIR"/TASK-*.md 2>/dev/null)
else
    # 2. 컨텍스트 파일에서 자기 팀 TASK 파일 목록 추출
    TASK_FILES=$(jq -r '.taskFiles[]' "$CONTEXT_FILE" 2>/dev/null | \
        while read -r fname; do
            echo "$TASKS_DIR/$fname"
        done)
fi

# 3. 자기 팀 TASK만 스캔
for f in $TASK_FILES; do
    [ -f "$f" ] || continue
    ITEMS=$(grep -n '^\- \[ \]' "$f" 2>/dev/null)
    ...
done
```

**하위 호환**: 컨텍스트 파일이 없는 구 세션에서는 기존처럼 전체 스캔 (기존 동작 유지).

### 4-4. TASK 중앙 보드 (.claude/tasks/BOARD.json)

Smith님이 결정한 중앙 TASK 보드 구조. 모든 팀의 TASK 현황을 한 파일에서 조회한다.

```json
{
  "version": "1.0",
  "updatedAt": "2026-03-28T10:00:00+09:00",
  "teams": {
    "CTO-1": {
      "status": "active",
      "taskFiles": ["TASK-CTO-RESUME.md", "TASK-CTO-CLEAN.md"],
      "completedCount": 3,
      "totalCount": 8
    },
    "PM-1": {
      "status": "active",
      "taskFiles": ["TASK-PM-RESUME.md"],
      "completedCount": 0,
      "totalCount": 3
    },
    "MKT-1": {
      "status": "completed",
      "taskFiles": ["TASK-MKT-RESUME.md", "TASK-ORGANIC-PHASE2.md"],
      "completedCount": 20,
      "totalCount": 20
    }
  },
  "unassigned": [
    "TASK-LP-MEDIA-DOWNLOAD.md",
    "TASK-COLLECTION-GAPS.md",
    "TASK-COLLECT-AND-EMBED.md",
    "TASK-DEEPGAZE-GEMINI-PIPELINE.md",
    "TASK-GCS-STORAGE-MIGRATION.md"
  ]
}
```

**갱신 규칙**:
- 리더가 TeamCreate 후 `BOARD.json`에 팀 등록
- 리더가 TASK 배정 시 `taskFiles`에 추가
- task-completed.sh가 체크박스 집계하여 `completedCount/totalCount` 갱신
- TeamDelete 전 리더가 팀 status를 `completed`로 변경
- 미소속 TASK는 `unassigned`에 보관

### 4-5. PDCA↔TASK 소유권 관계

```
docs/.pdca-status.json (PDCA 상태)
  └── features.{기능}.team: "CTO-1"          ← 어느 팀이 이 기능을 담당하는가
  └── features.{기능}.taskFile: "TASK-CTO-RESUME.md"  ← 어느 TASK 파일과 연결되는가

.claude/tasks/TASK-CTO-RESUME.md (TASK 파일)
  └── frontmatter.team: "CTO-1"              ← PDCA와 동일한 팀 식별자
  └── frontmatter.pdcaFeature: "cto-resume"   ← PDCA 기능명 역참조

.claude/tasks/BOARD.json (중앙 보드)
  └── teams.CTO-1.taskFiles: [...]            ← 팀별 TASK 집합
```

**일관성 규칙**:
1. TASK 생성 시 → BOARD.json에 등록 + PDCA status에 연결
2. TASK 완료 시 → BOARD.json 집계 갱신 + PDCA status 갱신
3. 팀 삭제 시 → BOARD.json에서 팀 status 변경 (삭제 아닌 아카이브)

---

## 5. Hook 정리 계획

### 5-1. 등록 상태 정비

31개 Hook 전수 검토 결과, 아래와 같이 정비한다:

| Hook | 현재 상태 | 조치 | 이유 |
|------|-----------|------|------|
| **pre-read-context.sh** | Bash 등록 | 유지 | 세션 시작 컨텍스트 주입 |
| **validate-task.sh** | Bash 등록 | 유지 | TASK.md 존재 검증 |
| **validate-qa.sh** | Bash 등록 | 유지 | QA 마커 확인 |
| **validate-pdca.sh** | Bash 등록 | 유지 | PDCA 상태 검증 |
| **destructive-detector.sh** | Bash 등록 | 유지 | rm -rf 등 차단 |
| **validate-design.sh** | Bash+Edit 등록 | **Bash에서 제거** | Edit|Write만으로 충분 |
| **enforce-qa-before-merge.sh** | Bash 등록 | 유지 | main merge 전 QA 강제 |
| **pdca-single-source.sh** | Bash 등록 | 유지 | PDCA 단일 소스 보장 |
| **validate-delegate.sh** | Edit 등록 | 유지 | 리더 코드 작성 차단 |
| **validate-plan.sh** | Edit 등록 | 유지 | Plan 없이 코딩 차단 |
| **enforce-plan-before-do.sh** | Edit 등록 | 유지 | Plan→Design→Do 순서 강제 |
| **validate-before-delegate.sh** | Task 등록 | 유지 | 위임 전 검증 |
| **validate-pdca-before-teamdelete.sh** | TeamDelete 등록 | **개선** | 팀 컨텍스트 정리 추가 |
| **notify-openclaw.sh** | Stop 등록 | 유지 | 세션 종료 알림 |
| **task-completed.sh** | TaskCompleted 등록 | **개선** | BOARD.json 갱신 로직 추가 |
| **task-quality-gate.sh** | TaskCompleted 등록 | 유지 | tsc+build 검증 |
| **pdca-update.sh** | TaskCompleted 등록 | 유지 | PDCA 상태 갱신 |
| **notify-completion.sh** | TaskCompleted 등록 | 유지 | 완료 알림 |
| **pdca-sync-monitor.sh** | TaskCompleted 등록 | 유지 | PDCA 동기화 모니터 |
| **auto-team-cleanup.sh** | TaskCompleted 등록 | 유지 | 팀 자동 정리 |
| **teammate-idle.sh** | **빈 배열 (비활성)** | **개선 후 재활성화** | 소유권 로직 추가 후 등록 |
| **enforce-teamcreate.sh** | 미등록 | **PreToolUse Agent 등록** | Agent 단독 spawn 차단 |
| **agent-slack-notify.sh** | 미등록 | **보류** | Slack 연동 미구현 상태 |
| **agent-state-sync.sh** | 미등록 | **개선 후 등록** | team-context.json 갱신용 |
| **detect-process-level.sh** | 미등록 | **삭제 검토** | 용도 불명확 |
| **force-team-kill.sh** | 미등록 | **보류** | 수동 긴급 종료용 (hook 아닌 스크립트) |
| **gap-analysis.sh** | 미등록 | **TaskCompleted 등록** | Gap 분석 자동 트리거 |
| **notify-hook.sh** | 미등록 | **삭제** | notify-completion과 중복 |
| **notify-task-completed.sh** | 미등록 | **삭제** | task-completed와 중복 |
| **protect-stage.sh** | 미등록 | **삭제 검토** | 용도 불명확 |
| **is-teammate.sh** | 헬퍼 (source용) | 유지 | 다른 hook이 source |

**정비 결과**:
- 유지: 20개
- 개선 후 재활성화: 3개 (teammate-idle, task-completed, validate-pdca-before-teamdelete)
- 신규 등록: 2개 (enforce-teamcreate, gap-analysis)
- 삭제: 3개 (notify-hook, notify-task-completed, detect-process-level 또는 protect-stage)
- 보류: 2개 (agent-slack-notify, force-team-kill)
- 헬퍼: 1개 (is-teammate)

### 5-2. 이벤트별 최종 Hook 배치

```
PreToolUse (Bash):       7개 → validate-design 제거
PreToolUse (Edit|Write): 4개 유지
PreToolUse (Task):       1개 유지
PreToolUse (Agent):      1개 추가 (enforce-teamcreate)
PreToolUse (TeamDelete): 1개 (개선)
Stop:                    1개 유지
TaskCompleted:           7개 → gap-analysis 추가
TeammateIdle:            1개 → teammate-idle 재활성화
```

---

## 6. 구현 계획

### Wave 1: 기반 구조 (의존성 없음)

| ID | 작업 | 파일 | 담당 |
|----|------|------|------|
| W1-1 | TASK 프론트매터 스키마 정의 + 기존 10개 TASK 파일에 프론트매터 추가 | `.claude/tasks/TASK-*.md` | leader |
| W1-2 | `BOARD.json` 초기 생성 + 현재 TASK 매핑 | `.claude/tasks/BOARD.json` | leader |
| W1-3 | `team-context.json` 스키마 정의 + 문서화 | `docs/02-design/` | leader |

### Wave 2: Hook 개선 (Wave 1 완료 후)

| ID | 작업 | 파일 | 담당 |
|----|------|------|------|
| W2-1 | `teammate-idle.sh` 소유권 필터링 로직 구현 | `.claude/hooks/teammate-idle.sh` | backend-dev |
| W2-2 | `task-completed.sh`에 BOARD.json 갱신 로직 추가 | `.claude/hooks/task-completed.sh` | backend-dev |
| W2-3 | `validate-pdca-before-teamdelete.sh`에 team-context.json 정리 로직 추가 | `.claude/hooks/validate-pdca-before-teamdelete.sh` | backend-dev |
| W2-4 | `settings.local.json` Hook 등록 정비 (삭제 3, 추가 2, 재활성화 1) | `.claude/settings.local.json` | backend-dev |
| W2-5 | 중복 Hook 파일 삭제 (notify-hook.sh, notify-task-completed.sh) | `.claude/hooks/` | backend-dev |

### Wave 3: 검증 + 가이드 (Wave 2 완료 후)

| ID | 작업 | 파일 | 담당 |
|----|------|------|------|
| W3-1 | 다팀 시뮬레이션 테스트 (CTO + PM TASK 공존 상태에서 idle 동작 확인) | 수동 테스트 | qa-engineer |
| W3-2 | CLAUDE.md에 TASK 프론트매터 규칙 추가 | `CLAUDE.md` | leader |
| W3-3 | PDCA status 갱신 + Gap 분석 | `docs/03-analysis/` | qa-engineer |

---

## 7. 성공 기준

| 기준 | 측정 방법 | 목표 |
|------|-----------|------|
| 크로스팀 배정 0건 | teammate-idle.sh 로그에서 다른 팀 TASK 배정 횟수 | 0 |
| idle 루프 0건 | 팀원 idle 후 30초 내 종료 또는 자기 팀 TASK 배정 | 100% |
| Hook 등록 일치율 | 등록된 Hook / 실제 사용 Hook | 100% |
| BOARD.json 정확도 | BOARD.json 집계 vs 실제 TASK 파일 체크박스 | 일치 |
| TASK 프론트매터 커버리지 | 프론트매터 있는 TASK / 전체 TASK | 100% |

---

## 8. 리스크

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| 기존 TASK 파일 프론트매터 추가 시 파싱 오류 | 낮음 | 중간 | grep이 `---` 블록 안의 `- [ ]` 를 체크박스로 오인 → 프론트매터 파싱 로직에서 제외 처리 |
| team-context.json 미생성 (리더 누락) | 중간 | 높음 | 하위 호환: 파일 없으면 전체 스캔 (기존 동작). 별도 validate hook으로 경고 |
| BOARD.json 동기화 실패 | 중간 | 중간 | task-completed.sh에서 자동 갱신. 수동 갱신 스크립트 제공 |
| 다수 팀 동시 BOARD.json 쓰기 충돌 | 낮음 | 중간 | 각 팀 리더만 쓰기 가능 (팀원은 읽기만). 동시 쓰기 시 lockfile로 직렬화 |

---

## 9. 제외 범위 (이번에 안 하는 것)

- Slack 알림 연동 (agent-slack-notify.sh) — 별도 기능으로 분리
- 크로스팀 TASK 위임 프로토콜 — `/tmp/cross-team/` 기반 체인은 별도 설계
- TASK 파일 자동 생성 (리더가 수동 작성하는 현재 방식 유지)
- Hook의 HTTP 전환 (CC v2.1.63+ 지원하지만 현재 command 타입 유지)
- tmux 세션 자동 감지 (team-context.json 수동 생성 방식 유지)

---

## 10. TDD (테스트 주도 개발) 보완

### T1: 단위 테스트 시나리오

| ID | 대상 | 입력 | 기대 출력 | 우선순위 |
|----|------|------|-----------|----------|
| UT-1 | teammate-idle.sh (팀 소유 TASK만 스캔) | team-context.json에 "TASK-CTO-RESUME.md"만 등록, TASK-PM-RESUME.md에 미완료 존재 | TASK-CTO-RESUME만 스캔, PM TASK 무시 | P0 |
| UT-2 | teammate-idle.sh (하위 호환) | team-context.json 없음, TASK-*.md 3개 존재 | 전체 3개 스캔 (기존 동작) | P0 |
| UT-3 | teammate-idle.sh (전부 완료) | team-context.json에 등록된 TASK 모두 체크박스 완료 | exit 0 (idle 허용) | P0 |
| UT-4 | task-completed.sh (BOARD.json 갱신) | TASK-CTO-RESUME.md 체크박스 1개 완료 | BOARD.json의 CTO-1.completedCount +1 | P1 |
| UT-5 | TASK 프론트매터 파싱 | `---\nteam: CTO-1\nstatus: in-progress\n---` 포함 TASK 파일 | team="CTO-1", status="in-progress" 추출 | P0 |
| UT-6 | BOARD.json 유효성 검증 | teams 객체의 taskFiles vs 실제 파일 존재 여부 | 누락 파일 0개 | P1 |

### T2: 엣지 케이스

| ID | 시나리오 | 기대 동작 | 우선순위 |
|----|----------|-----------|----------|
| E-1 | team-context.json이 손상된 JSON | jq 파싱 실패 → 전체 스캔 폴백 | P0 |
| E-2 | TASK 파일에 프론트매터 없음 (레거시) | 프론트매터 없는 TASK는 팀 "unassigned" 취급 | P1 |
| E-3 | BOARD.json에 등록된 TASK 파일이 삭제됨 | BOARD.json 갱신 시 누락 파일 경고 + unassigned으로 이동 | P1 |
| E-4 | 동시 2개 팀이 BOARD.json 쓰기 시도 | lockfile로 직렬화, 2번째 팀은 1초 대기 후 재시도 | P2 |
| E-5 | TeamDelete 후 team-context.json 잔존 | validate-pdca-before-teamdelete.sh에서 자동 삭제 | P0 |
| E-6 | TASK 프론트매터의 `- [ ]` 패턴 오탐 | 프론트매터 `---` 블록 내부는 체크박스 스캔에서 제외 | P0 |
| E-7 | 팀원이 team-context.json 수정 시도 | is-teammate.sh 체크 → 팀원이면 쓰기 차단 | P1 |

### T3: Mock 데이터 (JSON Fixture)

**team_context_cto.json**:
```json
{
  "team": "CTO-1",
  "session": "sdk-cto",
  "created": "2026-03-28T10:00:00+09:00",
  "taskFiles": [
    "TASK-CTO-RESUME.md",
    "TASK-CTO-CLEAN.md"
  ],
  "teammates": [
    { "role": "backend-dev", "paneIndex": 1 },
    { "role": "frontend-dev", "paneIndex": 2 },
    { "role": "qa-engineer", "paneIndex": 3 }
  ]
}
```

**board_multi_team.json**:
```json
{
  "version": "1.0",
  "updatedAt": "2026-03-28T10:00:00+09:00",
  "teams": {
    "CTO-1": {
      "status": "active",
      "taskFiles": ["TASK-CTO-RESUME.md", "TASK-CTO-CLEAN.md"],
      "completedCount": 3,
      "totalCount": 8
    },
    "PM-1": {
      "status": "active",
      "taskFiles": ["TASK-PM-RESUME.md"],
      "completedCount": 0,
      "totalCount": 3
    }
  },
  "unassigned": [
    "TASK-LP-MEDIA-DOWNLOAD.md",
    "TASK-COLLECTION-GAPS.md"
  ]
}
```

**task_frontmatter_sample.md**:
```markdown
---
team: CTO-1
session: sdk-cto
created: 2026-03-26
status: in-progress
owner: leader
assignees:
  - role: backend-dev
    tasks: [T1, T2, T3]
---
# TASK: CTO팀 남은 작업 마무리

### T1: Railway 코드 정리
- [x] 파일명 변경
- [ ] 환경변수 변경
```

### T4: 테스트 파일 경로

```
tests/hooks/
├── teammate-idle.test.sh          ← UT-1, UT-2, UT-3, E-1, E-6
├── task-completed.test.sh         ← UT-4
├── frontmatter-parser.test.sh     ← UT-5, E-2, E-6
├── board-validator.test.sh        ← UT-6, E-3, E-4
└── fixtures/
    ├── team_context_cto.json      ← CTO팀 컨텍스트
    ├── team_context_empty.json    ← 빈 팀 컨텍스트
    ├── board_multi_team.json      ← 다팀 보드
    ├── task_with_frontmatter.md   ← 프론트매터 있는 TASK
    └── task_legacy.md             ← 프론트매터 없는 레거시 TASK
```

---

## 부록 A: 용어 정의

| 용어 | 정의 |
|------|------|
| **TASK 파일** | `.claude/tasks/TASK-*.md` — 에이전트팀에게 할당된 작업 명세서 |
| **TASK 소유권** | 특정 TASK가 어느 팀에 속하는지를 나타내는 메타데이터 |
| **team-context.json** | 현재 활성 팀의 런타임 상태를 Hook에게 전달하는 파일 |
| **BOARD.json** | 모든 팀의 TASK 현황을 집계하는 중앙 인덱스 |
| **idle 루프** | 팀원이 idle → Hook이 잘못된 TASK 배정 → 실패 → 다시 idle → 반복 |
| **크로스팀 배정** | 한 팀의 Hook이 다른 팀의 TASK를 현재 팀원에게 배정하는 오류 |
| **하위 호환** | team-context.json 없는 구 세션에서도 기존 동작 유지 |

## 부록 B: 관련 문서

- `CLAUDE.md` — 프로젝트 규칙 (에이전트팀 운영, PDCA 워크플로우)
- `docs/retrospective/README.md` — 과거 사고 교훈 (RET-001~004)
- `.claude/settings.local.json` — Hook 등록 현황
- `.claude/hooks/teammate-idle.sh` — 현재 문제의 핵심 Hook
- `.claude/hooks/is-teammate.sh` — 팀원 감지 헬퍼
