---
team: CTO
status: done
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
1. **Dedup 공회전 (251건)** — video-saliency cron이 creative_media.video_analysis IS NULL 기준으로 251건 매번 조회하지만, creative_saliency 테이블에 이미 분석 결과 존재 → Cloud Run 호출해도 SKIP → 영구 공회전
2. **embed-creatives chain 끊김** — process-media에서 content_hash dedup만 발생하면 uploaded=0, processed=0 → chain 조건 불충족 → embed-creatives 트리거 안 됨
3. **L1 자동 보고 안 됨** — task-quality-gate.sh가 L1에도 gap analysis 강제 → 차단. pdca-chain-handoff.sh가 CTO-only + Match Rate 95% → L1 보고 불가
4. **비디오 URL 수집 누락 (77건)** — fetchVideoSourceUrls가 계정 리스팅만 사용 → 교차 계정/공유 비디오 49건 미발견. 권한 에러 28건(별도 TASK). collect-daily가 VIDEO thumbnail_url 미활용

## 구현 범위

### Wave 1: TDD 테스트 작성 (Red)
- [x] W1-1: `__tests__/hooks/video-saliency-dedup.test.ts` — VS-1~VS-8 (8건)
- [x] W1-2: `__tests__/hooks/embed-chain-fix.test.ts` — EC-1~EC-5 (5건)
- [x] W1-3: `__tests__/hooks/l1-auto-report.test.ts` — LR-1~LR-18 (18건)
- [x] W1-4: `__tests__/hooks/video-source-fallback.test.ts` — VF-1~VF-7 (7건)
- [x] W1-5: `__tests__/hooks/collect-daily-thumbnail.test.ts` — CT-1~CT-4 (4건)
- [x] W1-6: Fixtures 5개 작성
- [x] W1-7: 전부 Red 확인

### Wave 2: src/ + lib/ 코드 수정 (Green — Problem A, B, D)
- [x] W2-1: `src/app/api/cron/video-saliency/route.ts` — Step 1-B(creative_saliency 사전 조회) + Step 1-C(즉시 동기화) + Step 2 needsCloudRun 변경
- [x] W2-2: `src/app/api/cron/process-media/route.ts` — chain 조건에 `|| result.dedup > 0` 추가 (1줄)
- [x] W2-3: `src/lib/protractor/creative-image-fetcher.ts` — fetchVideoSourceUrls 개별 fallback 추가
- [x] W2-4: `src/app/api/cron/collect-daily/route.ts` — VIDEO thumbnail_url 보강 (3곳)
- [x] W2-5: VS-1~VS-8, EC-1~EC-5, VF-1~VF-7, CT-1~CT-4 Green 확인

### Wave 3: hooks 수정 (Green — Problem C)
- [x] W3-1: `.claude/hooks/task-quality-gate.sh` — v3 전면 재작성 (L0 스킵, L1 산출물만, L2/L3 기존)
- [x] W3-2: `.claude/hooks/pdca-chain-handoff.sh` — v3 (CTO-only 제거 + FROM_ROLE + L1 ANALYSIS_REPORT)
- [x] W3-3: LR-1~LR-18 Green 확인

### Wave 4: 검증 + 마무리
- [x] W4-1: `npx tsc --noEmit` — 타입 에러 0
- [x] W4-2: `npm run build` — 빌드 성공
- [x] W4-3: 전체 TDD 64건 Green (기존 22 + 신규 42)
- [x] W4-4: Gap 분석 → `docs/03-analysis/video-pipeline-dedup-fix.analysis.md` (97%)
- [x] W4-5: `.pdca-status.json` + `docs/.pdca-status.json` 업데이트

## 수정 파일 (6개)

| 파일 | 변경 내용 | 담당 |
|------|----------|------|
| `src/app/api/cron/video-saliency/route.ts` | Step 1-B, 1-C 삽입 + Step 2 needsCloudRun | backend-dev |
| `src/app/api/cron/process-media/route.ts` | chain 조건 1줄 | backend-dev |
| `src/lib/protractor/creative-image-fetcher.ts` | fetchVideoSourceUrls 개별 fallback 추가 | backend-dev |
| `src/app/api/cron/collect-daily/route.ts` | VIDEO thumbnail_url 보강 (3곳) | backend-dev |
| `.claude/hooks/task-quality-gate.sh` | v3 전면 재작성 | backend-dev |
| `.claude/hooks/pdca-chain-handoff.sh` | v3 3가지 변경 | backend-dev |

## 테스트 파일 (5개, 신규)

| 파일 | 테스트 수 |
|------|----------|
| `__tests__/hooks/video-saliency-dedup.test.ts` | VS-1~VS-8 (8건) |
| `__tests__/hooks/embed-chain-fix.test.ts` | EC-1~EC-5 (5건) |
| `__tests__/hooks/l1-auto-report.test.ts` | LR-1~LR-18 (18건) |
| `__tests__/hooks/video-source-fallback.test.ts` | VF-1~VF-7 (7건) |
| `__tests__/hooks/collect-daily-thumbnail.test.ts` | CT-1~CT-4 (4건) |

## 의존성
- dependsOn: 없음 (독립 작업)
- 관련: video-collection-audit (독립 진행, 결과에 따라 범위 변동 가능)

## 하지 말 것
- `is-teammate.sh` 라인 15 버그 수정 — 별도 TASK
- creative_media / creative_saliency 테이블 스키마 변경 — 없음
- embed-creatives/route.ts 수정 — 체인 트리거만 받음, 코드 변경 불필요
- meta-collector.ts AD_FIELDS 변경 — 이미 thumbnail_url 요청 중
- fetchVideoThumbnails 수정 — thumbnails API는 정상 작동

## 완료 후 QA
1. `npx vitest run __tests__/hooks/` — TDD 42건 Green
2. `npx tsc --noEmit && npm run build` 통과
3. Gap 분석 Match Rate 90%+
4. `.pdca-status.json` 상태 completed 업데이트
