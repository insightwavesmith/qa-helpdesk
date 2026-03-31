# 수집 구조 v3 — Plan

## 1. 배경
현재 collect-daily는 ad_accounts 테이블에 등록된 42개 계정(가입 수강생)만 수집.
Meta 앱 토큰으로 접근 가능한 전체 계정(100~200개)을 수집하고,
동일 콘텐츠(image_hash/video_id 기준) 중복 다운로드·분석을 제거.

## 2. 목표
1. **계정 디스커버리**: Meta API로 접근 가능한 전체 광고계정 자동 발견 + 등록
2. **콘텐츠 중복 제거**: image_hash/video_id 기준 content_hash로 다운로드·임베딩·분석 1회만 실행
3. **수집 = 웨어하우스, 서빙 = 필터** 원칙 확립

## 3. 범위

### In-Scope
- ad_accounts 테이블 확장 (is_member, discovered_at 등)
- creative_media에 content_hash 컬럼 추가
- 계정 디스커버리 크론 신규 생성
- collect-daily에 content_hash 저장 로직 추가
- process-media에 content_hash 기반 storage_url 재사용
- 다운스트림 크론(embed, saliency) content_hash 기반 결과 복사

### Out-of-Scope
- 프론트엔드 계정 필터 UI (별도 TASK)
- daily_ad_insights 구조 변경 (성과는 ad_id×date 기준 유지)
- collect-benchmarks 변경 (벤치마크는 ad_id 기준 독립)

## 4. 성공 기준
- [ ] 디스커버리 크론이 ad_accounts에 신규 계정 등록
- [ ] collect-daily가 content_hash를 creative_media에 저장
- [ ] process-media가 동일 content_hash의 storage_url 재사용 (중복 다운로드 0)
- [ ] 다운스트림 크론이 동일 content_hash의 분석 결과 복사
- [ ] tsc + build 통과
- [ ] 기존 backfill 엔드포인트 정상 동작

## 5. 구현 순서
```
Wave 1: DB 마이그레이션 (스키마 + 기존 데이터 backfill)
Wave 2: 크론 수정 (discover-accounts, collect-daily, process-media) — 병렬 가능
Wave 3: 다운스트림 크론 수정 (embed, saliency)
Wave 4: tsc + build + 커밋
```

## 6. 리스크
- Meta API rate limit: 디스커버리가 계정별 insights 체크 시 호출 수 증가
- content_hash=NULL 기존 데이터: 마이그레이션 스크립트로 raw_creative에서 추출
- CAROUSEL 카드별 content_hash: 카드마다 다른 image_hash → 정상 동작
