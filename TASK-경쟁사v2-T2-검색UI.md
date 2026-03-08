# TASK: 경쟁사 분석기 v2 — T2 검색 UI (브랜드 드롭다운 + 모드 분리)

## 전제
- T1(구조) 완료 후 실행
- `/api/competitor/brands?q=xxx` API 정상 동작
- `BrandPage` 타입 정의 완료

## 목표
검색바를 브랜드 검색(드롭다운 자동완성) + 키워드 검색 두 모드로 분리

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234!

## T2.1 검색 모드 토글
### 파일
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
### 할 것
- 검색바 위에 모드 토글: `🏢 브랜드 검색` (기본) / `🔑 키워드 검색`
- 상태: `searchMode: 'brand' | 'keyword'`
- 브랜드 모드 선택 시 → BrandSearchBar 렌더
- 키워드 모드 선택 시 → 기존 SearchBar 렌더

## T2.2 브랜드 검색바 컴포넌트
### 파일
- `src/app/(main)/protractor/competitor/components/brand-search-bar.tsx` (신규)
### 할 것
- 텍스트 입력 → debounce 300ms → `/api/competitor/brands?q=입력값` 호출
- 드롭다운에 브랜드 목록 표시:
  - 프로필 사진 (image_uri, 32px 원형)
  - 브랜드명
  - @인스타계정 · 👍 좋아요수 · 카테고리
  - 📌 핀 등록 버튼
- 브랜드 클릭 → `onBrandSelect(brand)` 콜백 → page_id로 광고 검색
- URL 입력 감지: 인스타/페북/일반 URL → 자동으로 키워드 추출 후 검색
- 빈 결과 시 "검색 결과 없음" 표시
- ESC 또는 외부 클릭 시 드롭다운 닫힘

## T2.3 기존 검색바 유지
### 파일
- `src/app/(main)/protractor/competitor/components/search-bar.tsx`
### 할 것
- 변경 없음 (키워드 모드에서 그대로 사용)

## 하지 말 것
- 필터/다운로드 UI 변경하지 마라
- API 라우트 변경하지 마라

## 검증 기준
- 브랜드 모드: "올리브영" 타이핑 → 드롭다운에 브랜드 목록 → 클릭 → 해당 브랜드 광고 로드
- 키워드 모드: 기존과 동일하게 동작
- URL 입력: `instagram.com/oliveyoung_official` 입력 → 브랜드 드롭다운 표시
- 디자인: Primary #F75D5D, Radius 0.75rem, icons lucide-react
