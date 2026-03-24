# TASK: Wave 3 — 하류 수정 (reach 버그 + 카드별 분석)

> CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라
> 코드리뷰 보고서: docs/03-analysis/collection-review.analysis.md 참조
> Wave 1+2 완료 전제

## T7: reach 합산 버그 수정 (3곳)

reach는 유니크 수치. 일별 합산하면 중복 카운트됨.

1. `src/app/api/protractor/overlap/route.ts:176` — reach 합산 → MAX(reach) 또는 제거
2. `src/app/api/admin/backfill/route.ts:377` — 동일 수정
3. `src/lib/precompute/insights-precompute.ts:188` — `acc.reach += row.reach` → MAX 또는 제거

해결 방향: 기간 내 reach가 필요하면 일별 중 MAX(reach) 사용. 정확한 값이 필요하면 Meta API에서 account-level reach 별도 요청 필요하지만 지금은 MAX로 충분.

## T8: embed-creatives 카드별 임베딩

`src/app/api/cron/embed-creatives/route.ts` + `src/lib/ad-creative-embedder.ts`:
- maybeSingle() → position별 처리
- CAROUSEL: 각 카드별 독립 임베딩 생성
- IMAGE/VIDEO: 기존대로 (position=0)

## T9: analyze-five-axis 카드별 5축

`scripts/analyze-five-axis.mjs`:
- creative_media N행 순회
- CAROUSEL: 카드별 5축 분석 결과 저장 (analysis_json에 position 포함)
- IMAGE/VIDEO: 기존대로

## T10: creative-saliency 카드별 DeepGaze

`src/app/api/cron/creative-saliency/route.ts`:
- CAROUSEL: 각 카드(이미지)별 DeepGaze 실행
- 카드별 saliency_map 저장
- VIDEO 카드가 섞여있으면 이미지 카드만 DeepGaze

## T-추가: source → is_member/is_benchmark 전환

RPC `get_student_creative_summary`에서 `c.source = 'member'` → `c.is_member = true` 전환.
- 파일: `supabase/migrations/20260322_v3_schema_additions.sql` 내 RPC 또는 해당 migration 재작성

## 검증
1. tsc + build 통과
2. reach 수치 검증: 합산 vs MAX 비교
3. 기존 IMAGE/VIDEO 분석 결과 영향 없음 확인
