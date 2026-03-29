---
team: CTO
status: ready
---
# TASK: Video Pipeline Dedup Fix (영상 파이프라인 수정)

## 타입
개발

## 프로세스 레벨
L2

## 문서
- Plan: `docs/01-plan/features/video-pipeline-dedup-fix.plan.md`
- Design: `docs/02-design/features/video-pipeline-dedup-fix.design.md`

## 문제 정의
1. **Dedup 공회전 (157건)** — video-saliency cron이 creative_media.video_analysis IS NULL 기준으로 157건 매번 조회하지만, creative_saliency 테이블에 이미 분석 결과 존재 → Cloud Run 호출해도 SKIP → 영구 공회전
2. **embed-creatives chain 끊김** — process-media에서 content_hash dedup만 발생하면 uploaded=0, processed=0 → chain 조건 불충족 → embed-creatives 트리거 안 됨
3. **L1 자동 보고 안 됨** — task-quality-gate.sh가 L1에도 gap analysis 강제 → 차단. pdca-chain-handoff.sh가 CTO-only + Match Rate 95% → L1 보고 불가

## 구현 범위

### Wave 1: TDD 테스트 작성 (Red)
- [ ] W1-1: `__tests__/hooks/video-saliency-dedup.test.ts` — VS-1~VS-8 (8건)
- [ ] W1-2: `__tests__/hooks/embed-chain-fix.test.ts` — EC-1~EC-5 (5건)
- [ ] W1-3: `__tests__/hooks/l1-auto-report.test.ts` — LR-1~LR-18 (18건)
- [ ] W1-4: Fixtures 3개 작성 (saliency-rows, process-result, team-context)
- [ ] W1-5: `npx vitest run __tests__/hooks/video-saliency-dedup.test.ts __tests__/hooks/embed-chain-fix.test.ts __tests__/hooks/l1-auto-report.test.ts` → 전부 Red 확인

### Wave 2: src/ 코드 수정 (Green — Problem A, B)
- [ ] W2-1: `src/app/api/cron/video-saliency/route.ts` — Step 1-B(creative_saliency 사전 조회) + Step 1-C(즉시 동기화) + Step 2 needsCloudRun 변경
- [ ] W2-2: `src/app/api/cron/process-media/route.ts` — chain 조건에 `|| result.dedup > 0` 추가 (1줄)
- [ ] W2-3: VS-1~VS-8, EC-1~EC-5 Green 확인

### Wave 3: hooks 수정 (Green — Problem C)
- [ ] W3-1: `.claude/hooks/task-quality-gate.sh` — v3 전면 재작성 (L0 스킵, L1 산출물만, L2/L3 기존)
- [ ] W3-2: `.claude/hooks/pdca-chain-handoff.sh` — v3 (CTO-only 제거 + FROM_ROLE + L1 ANALYSIS_REPORT)
- [ ] W3-3: LR-1~LR-18 Green 확인

### Wave 4: 검증 + 마무리
- [ ] W4-1: `npx tsc --noEmit --quiet` — 타입 에러 0
- [ ] W4-2: `npm run build` — 빌드 성공
- [ ] W4-3: 전체 TDD 31건 Green
- [ ] W4-4: Gap 분석 → `docs/03-analysis/video-pipeline-dedup-fix.analysis.md`
- [ ] W4-5: `.pdca-status.json` + `docs/.pdca-status.json` 업데이트

## 수정 파일 (4개)

| 파일 | 변경 내용 | 담당 |
|------|----------|------|
| `src/app/api/cron/video-saliency/route.ts` | Step 1-B, 1-C 삽입 + Step 2 needsCloudRun | backend-dev |
| `src/app/api/cron/process-media/route.ts` | chain 조건 1줄 | backend-dev |
| `.claude/hooks/task-quality-gate.sh` | v3 전면 재작성 | backend-dev |
| `.claude/hooks/pdca-chain-handoff.sh` | v3 3가지 변경 | backend-dev |

## 테스트 파일 (3개, 신규)

| 파일 | 테스트 수 |
|------|----------|
| `__tests__/hooks/video-saliency-dedup.test.ts` | VS-1~VS-8 (8건) |
| `__tests__/hooks/embed-chain-fix.test.ts` | EC-1~EC-5 (5건) |
| `__tests__/hooks/l1-auto-report.test.ts` | LR-1~LR-18 (18건) |

## 의존성
- dependsOn: 없음 (독립 작업)
- 관련: video-collection-audit (독립 진행, 결과에 따라 범위 변동 가능)

## 하지 말 것
- `is-teammate.sh` 라인 15 버그 수정 — 별도 TASK
- creative_media / creative_saliency 테이블 스키마 변경 — 없음
- embed-creatives/route.ts 수정 — 체인 트리거만 받음, 코드 변경 불필요

## 완료 후 QA
1. `npx vitest run __tests__/hooks/` — TDD 31건 Green
2. `npx tsc --noEmit && npm run build` 통과
3. Gap 분석 Match Rate 90%+
4. `.pdca-status.json` 상태 completed 업데이트
