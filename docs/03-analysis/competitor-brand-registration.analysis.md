# 경쟁사 분석기 브랜드 등록 개선 Gap 분석

> 분석일: 2026-03-07

## Match Rate: 95%

## 일치 항목

| # | 설계 항목 | 구현 상태 |
|---|-----------|-----------|
| 1 | T1: `/api/competitor/pages?q=` API Route (GET) | 구현 완료. `searchMetaAds` 활용, page_id 기준 중복 제거, Graph API 프로필 이미지 URL 생성 |
| 2 | T1: runtime="nodejs", dynamic="force-dynamic" | 설정 완료 |
| 3 | T1: 에러 처리 (INVALID_QUERY, TOKEN_MISSING, META_API_ERROR) | 구현 완료 |
| 4 | T2: MetaPage 타입 추가 | `src/types/competitor.ts`에 추가 완료 |
| 5 | T2: debounce 300ms 검색 | useRef + setTimeout 패턴으로 구현 |
| 6 | T2: 드롭다운 UI (프로필 이미지 32px + 페이지명 + page_id 회색) | 구현 완료 |
| 7 | T2: 선택 칩 (로고 20px + 이름 + X 버튼) | 구현 완료 |
| 8 | T2: 기존 텍스트 직접 입력 유지 (Enter로 pageId null 등록) | 구현 완료 |
| 9 | T2: POST body에 brandName + pageId 전송 | 구현 완료 |
| 10 | T2: 첫 글자 아바타 fallback | LetterAvatar 컴포넌트로 구현 |
| 11 | T2: 외부 클릭 시 드롭다운 닫기 | useEffect + mousedown 리스너 |
| 12 | T2: 로딩 스피너 | Loader2 아이콘 animate-spin |
| 13 | T2: 검색 결과 0건 안내 | "검색 결과가 없습니다" 표시 |
| 14 | T3: pageId 있으면 Graph API 프로필 이미지 표시 (28px 둥근) | 구현 완료 |
| 15 | T3: pageId 없으면 첫 글자 아바타 | LetterAvatar 컴포넌트 |
| 16 | T3: 이미지 로딩 실패 시 fallback | onError → setFailed(true) |
| 17 | bscamp 디자인 시스템 (Primary #F75D5D, rounded-xl, Pretendard) | 적용 완료 |
| 18 | 드롭다운 스타일 (bg-white, border-gray-200, shadow-lg, max-h-60) | 적용 완료 |
| 19 | eslint-disable-next-line @next/next/no-img-element 주석 | 적용 완료 |

## 불일치 항목

| # | 설계 | 실제 | 사유 |
|---|------|------|------|
| 1 | 드롭다운 max-height 240px | max-h-60 (240px) 사용 | Tailwind 클래스로 동일 효과, 일치 |

## 설계 외 추가 구현

| # | 항목 | 사유 |
|---|------|------|
| 1 | Search 아이콘 (input 왼쪽) | UX 개선: 검색 기능임을 시각적으로 표시 |
| 2 | 최소 2글자 입력 후 검색 시작 | 불필요한 API 호출 방지 |

## 빌드 검증

- tsc --noEmit: 에러 0개
- npm run lint: 내 파일 에러 0개 (기존 15개 에러는 변경 없음)
- npm run build: 성공

## 수정 필요

없음.
