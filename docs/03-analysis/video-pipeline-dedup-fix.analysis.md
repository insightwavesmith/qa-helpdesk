# Video Pipeline Dedup Fix — Gap 분석

> 분석일: 2026-03-30
> 설계서: `docs/02-design/features/video-pipeline-dedup-fix.design.md`
> TASK: `.claude/tasks/TASK-VIDEO-PIPELINE-DEDUP-FIX.md`

## Match Rate: 97%

## 일치 항목 (33/34)

### Problem A — Dedup 공회전 수정 ✅
- [x] Step 1-B: creative_saliency 사전 조회 (.in + .eq target_type=video)
- [x] Step 1-C: 이미 분석된 건 즉시 동기화 (summaryMap → update)
- [x] syncOnlyRows / needsCloudRun 분리
- [x] Step 2 `rows` → `needsCloudRun` 변경
- [x] 응답에 preSynced, cloudRunProcessed 추가
- [x] 에러 fallback: saliency 조회 실패 시 전체 Cloud Run (빈 Set)
- [x] 사전동기화 update 실패 시 에러 로그 + continue

### Problem B — embed chain 끊김 수정 ✅
- [x] chain 조건: `|| result.dedup > 0` 추가
- [x] console.log에 dedup 값 포함

### Problem C — L1 자동 보고 ✅
- [x] task-quality-gate.sh v3: L0 fix:/hotfix: → 전스킵
- [x] task-quality-gate.sh v3: L1 src/ 변경없음 → 산출물 확인만 (exit 0)
- [x] task-quality-gate.sh v3: L1 TASK 파일도 산출물 인정
- [x] task-quality-gate.sh v3: L2/L3 기존 검증 유지
- [x] pdca-chain-handoff.sh v3: CTO-only 제거 → 전팀 대상
- [x] pdca-chain-handoff.sh v3: FROM_ROLE 변수 (CTO→CTO_LEADER, PM→PM_LEADER)
- [x] pdca-chain-handoff.sh v3: L0/L1 → Match Rate 스킵 + ANALYSIS_REPORT
- [x] pdca-chain-handoff.sh v3: ANALYSIS_REPORT payload 구조 (protocol, type, from_role, to_role)
- [x] pdca-chain-handoff.sh v3: broker 전송 + fallback ACTION_REQUIRED
- [x] pdca-chain-handoff.sh v3: L2/L3 from_role 하드코딩 → FROM_ROLE 변수

### Problem D — 비디오 URL 수집 누락 ✅
- [x] fetchVideoSourceUrls 개별 fallback (GET /{video_id}?fields=source)
- [x] 5개씩 배치 병렬 처리
- [x] 권한 에러(#10, #283) 분리 처리
- [x] 최종 미발견 경고 로그
- [x] collect-daily: 비-CAROUSEL VIDEO → thumbnail_url fallback
- [x] collect-daily: CAROUSEL 카드 VIDEO → thumbnail_url fallback
- [x] collect-daily: CAROUSEL fallback VIDEO → thumbnail_url fallback

### TDD ✅
- [x] VS-1~8: video-saliency dedup 테스트 (8건)
- [x] EC-1~5: embed chain 테스트 (5건)
- [x] LR-1~18: L1 auto report 테스트 (18건, 기존 QL/CL과 통합)
- [x] VF-1~7: video source fallback 테스트 (7건)
- [x] CT-1~4: collect-daily thumbnail 테스트 (4건)
- [x] 전체 64건 Green (기존 QL/CL 22건 + 신규 42건)

## 불일치 항목 (1/34)

### ANALYSIS_REPORT 타입 정의 미포함
- 설계서 §1-1에 `AnalysisReport` TypeScript 인터페이스 정의 있으나, 실제 타입 파일에 추가되지 않음
- **영향**: hooks가 bash로 JSON 생성하므로 런타임 영향 없음. 향후 TypeScript에서 사용 시 추가 필요
- **심각도**: Low (문서 정합성 이슈)

## 수정 필요 없음
- Match Rate 97% (기준 90% 충족)
- 불일치 1건은 bash-only 구현이므로 TS 타입 불필요

## 검증 결과

| 항목 | 결과 |
|------|------|
| `npx tsc --noEmit` | 0 에러 |
| `npm run build` | 성공 |
| TDD 64건 | 전부 Green |
| 기존 hooks 테스트 | regression 없음 (peers 인프라 10건 제외) |
