# 경쟁사v2 검색 고도화 — Gap 분석

## Match Rate: 95%

## 일치 항목

### T1: 브랜드 검색 고도화
- ✅ `brands/route.ts`: page_search + ad_library 병렬 검색 (Promise.allSettled)
- ✅ URL 입력 감지 → 도메인 추출 (`extractDomain` 함수 추가)
- ✅ ad_library 결과에서 page_id별 그룹핑 → AdPage[] 반환
- ✅ 공식 브랜드와 중복되는 page_id 제외
- ✅ 상위 10개 adPage만 반환 (광고 건수 내림차순)
- ✅ `brand-search-bar.tsx`: 드롭다운 2섹션 (📌 공식 브랜드 + 🔗 URL 광고 페이지)
- ✅ adPage 클릭 → BrandPage 변환 → 기존 handleBrandSelect 재활용
- ✅ 플레이스홀더 변경: "브랜드명, 자사몰 URL, 인스타 계정 등 뭐든 입력하세요"
- ✅ `types/competitor.ts`: AdPage 인터페이스 추가
- ✅ 에러 처리: 한쪽 실패해도 나머지 결과 표시 (Promise.allSettled)

### T2~T5: 핫픽스에서 이미 처리됨
- ✅ 더보기 동작 (nextPageToken + append)
- ✅ 정렬 (최신순/운영기간순)
- ✅ 필터 (게재중/플랫폼 필터 이미 제거됨)
- ✅ 카드 버튼 (소재보기+다운로드+브랜드등록 3개만)

## 불일치 항목
- ⚠️ TASK 설계서에서 "🔗 이 URL로 광고하는 페이지" 라벨이지만, 일반 텍스트 입력 시에도 ad_library 검색이 발생하므로 "이 키워드로 광고하는 페이지"로 변경함 (더 정확한 표현)
- ⚠️ 인스타/페북 URL 입력 시 도메인 검색이 아닌 username 검색으로 처리 (extractDomain에서 제외) — 의도적 설계

## 수정 불필요
- 기존 기능 (키워드 검색, 모니터링, 다운로드) 영향 없음

## 빌드 검증
- tsc --noEmit: ✅ 에러 0개
- npm run lint: ✅ 신규 에러 0개 (기존 20개 에러는 변경사항 외 파일)
- npm run build: ✅ 성공
