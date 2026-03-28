---
team: CTO
session: sdk-cto
created: 2026-03-28
status: pending
owner: leader
---

# TASK: Git 저장소 정리 — .gitignore + 완료 파일 archive + 통합 문서 정리

---

## T1. .gitignore 추가 ✅ 완료 (96ba5e9, 73a9fc8)

### 이게 뭔지
런타임/임시 파일이 git에 추적되고 있음. .gitignore에 추가 필요.

### 추가할 항목
```
# bkit runtime (임시 상태 파일)
.bkit/snapshots/
.bkit/runtime/

# claude drafts (임시 초안)
.claude/drafts/
```

### 검증 기준
- `git status`에서 .bkit/snapshots/, .bkit/runtime/, .claude/drafts/ 안 뜸
- 기존 추적 중인 파일은 `git rm --cached`로 제거

---

## T2. 삭제 대기 TASK 커밋

### 이게 뭔지
이미 로컬에서 삭제된 TASK 3개가 git에 반영 안 됨.

### 파일
- `.claude/tasks/TASK-CTO-CLEAN.md` (완료)
- `.claude/tasks/TASK-CTO-RESUME.md` (완료)
- `.claude/tasks/TASK-TEAMMATE-LIFECYCLE.md` (agent-team-operations에 통합)

### 검증 기준
- `git status`에서 `D .claude/tasks/` 0건

---

## T3. 통합된 구 plan/design 정리

### 이게 뭔지
agent-team-operations.plan.md에 통합된 구 파일 3개. "통합됨" 표시 있으니 archive로 이동.

### 파일
- `docs/01-plan/features/hook-task-ownership.plan.md` → `docs/archive/plan/`
- `docs/01-plan/features/task-ownership-process.plan.md` → `docs/archive/plan/`
- `docs/01-plan/features/teammate-lifecycle.plan.md` → `docs/archive/plan/`
- `docs/02-design/features/hook-task-ownership.design.md` → `docs/archive/design/`
- `docs/02-design/features/teammate-lifecycle.design.md` → `docs/archive/design/`

### 검증 기준
- 원본 삭제, archive 폴더에 이동 완료
- agent-team-operations 문서의 "통합 이력" 섹션 참조 경로 업데이트 불필요 (이력만 기록)

---

## T4. 완료된 오래된 plan/design archive

### 이게 뭔지
3월 8일 이전 완료된 plan/design이 대량 존재. 현재 활성 개발과 무관한 것들을 archive.

### 판단 기준
- **유지**: agent-team-operations, deepgaze-gemini-pipeline, gcp-full-migration, prescription-system, collection-v3, creative-analysis-tab, lp-media-download — 현재 진행중이거나 최근 참조됨
- **archive**: 3월 15일 이전 완료 + 현재 TASK에서 참조 안 되는 것 전부 → `docs/archive/plan/`, `docs/archive/design/`
- **잘 모르겠으면 archive** — 필요하면 git history에서 복구 가능

### 검증 기준
- `docs/01-plan/features/` 20개 이하로 정리
- `docs/02-design/features/` 20개 이하로 정리
- archive 폴더에 이동된 파일 목록 커밋 메시지에 포함

---

## T5. scripts/ 정리

### 이게 뭔지
66개 스크립트 중 일회성 마이그레이션/완료된 것 archive.

### 판단 기준
- **유지**: 현재 크론/파이프라인에서 사용 중인 것 (run-backfill, run-process-media-loop, saliency-predict, pdca-*.sh 등)
- **archive**: `migrate-*.js/ts/mjs`, `convert-*.mjs`, `fix-*.mjs`, `remove-supabase-*.mjs` — 완료된 마이그레이션
- → `scripts/archive/`로 이동

### 검증 기준
- `scripts/` 30개 이하로 정리
- archive 이동된 스크립트가 다른 파일에서 import 안 하는지 확인 (grep)

---

## 하지 말 것
- src/ 코드 수정 금지
- archive된 파일 완전 삭제 금지 (이동만)
- 현재 진행중인 TASK 관련 파일 건드리지 마라

## 검증 기준
- T1~T5 전부 완료 후 `npm run build` 성공
- `git status`에 런타임/임시 파일 0건
- 커밋 메시지에 archive 목록 포함
