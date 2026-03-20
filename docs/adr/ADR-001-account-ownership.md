# ADR-001: 계정 종속 구조 (Account Ownership)

**상태**: 확정 (2026-03-20)
**결정자**: Smith님

## 결정
모든 콘텐츠(소재/LP/분석결과/미디어)는 수강생 계정에 종속된다.
경쟁사 데이터는 경쟁사 브랜드에 종속된다.

## 적용 범위 (전 레이어 — 하나라도 빠지면 안 됨)

| 레이어 | 규칙 | 예시 |
|--------|------|------|
| DB | account_id FK 필수 | creatives.account_id → ad_accounts |
| Storage | `{account_id}/` 폴더 분리 | `creatives/{account_id}/video/{ad_id}.mp4` |
| API | account_id 필터링 | `?account_id=eq.xxx` |
| 프론트 | 계정 셀렉터로 분기 | AccountSelector → 데이터 필터 |

## Storage 경로 패턴
```
creatives/{account_id}/media/{ad_id}.jpg      ← 이미지 원본
creatives/{account_id}/video/{ad_id}.mp4      ← 영상 원본
creatives/{account_id}/thumb/{ad_id}.jpg      ← 썸네일
lp/{account_id}/{lp_id}/mobile_full.png       ← LP 모바일 풀페이지
lp/{account_id}/{lp_id}/pc_full.png           ← LP PC 풀페이지
lp/{account_id}/{lp_id}/mobile_hero.png       ← LP 모바일 Hero
lp/{account_id}/{lp_id}/mobile_detail.png     ← LP 모바일 Detail
lp/{account_id}/{lp_id}/mobile_review.png     ← LP 모바일 Review
lp/{account_id}/{lp_id}/mobile_cta.png        ← LP 모바일 CTA
lp/{account_id}/{lp_id}/option.png            ← 옵션창
saliency/{account_id}/{ad_id}.png             ← 시선 히트맵
competitor/{brand_id}/media/{ad_id}.jpg       ← 경쟁사
```

## 이유
- 수강생 탈퇴 시 폴더째 삭제 가능
- 용량 관리 계정 단위
- 권한/RLS 자연스러운 분기
- DB 구조와 Storage 구조 일치

## 예외
- 경쟁사 데이터: `competitor/{brand_id}/` (ad_accounts에 없음)
- 벤치마크 데이터: `benchmark/` (특정 계정에 종속 안 됨)

## 체크리스트 (새 기능 추가 시)
- [ ] DB 테이블에 account_id 컬럼 있는가?
- [ ] Storage 경로에 {account_id} 포함되는가?
- [ ] API에서 account_id로 필터링하는가?
- [ ] 프론트에서 계정 셀렉터 연동되는가?
