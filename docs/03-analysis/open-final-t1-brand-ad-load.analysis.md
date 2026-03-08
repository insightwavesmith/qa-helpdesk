# 브랜드 클릭 시 광고 로드 Gap 분석

## Match Rate: 100%

## 설계 항목 vs 구현 비교

### S1. meta-ad-library.ts — searchPageIds 존재 시 q 빈 문자열 설정
| 설계 | 구현 | 일치 |
|------|------|:----:|
| `searchPageIds` 존재 시 `url.searchParams.set("q", "")` | ✅ 설계대로 if/else 분기 구현 | ✅ |
| `searchPageIds` 없으면 기존 `params.searchTerms` 사용 | ✅ else 분기에서 기존 로직 유지 | ✅ |

### S2. route.ts — q 없이 page_id만으로 검색 허용
| 설계 | 구현 | 일치 |
|------|------|:----:|
| `!q && !pageId` 일 때만 400 에러 반환 | ✅ validation 완화 구현 | ✅ |
| `page_id`만 있으면 q 없이도 검색 허용 | ✅ 설계대로 구현 | ✅ |

## 일치 항목
- S1: `meta-ad-library.ts` — `searchPageIds` 존재 시 `q`를 빈 문자열로 설정 (100% 일치)
- S2: `route.ts` — `q` 없이 `page_id`만으로 검색 허용, validation 완화 (100% 일치)

## 불일치 항목
없음

## 수정 필요
없음

## 검증
- [x] `npx tsc --noEmit` — 타입 에러 0개
- [x] `npm run lint` — lint 에러 0개
- [x] `npm run build` — 빌드 성공
- [x] 기존 키워드 검색 모드 정상 동작 (하위 호환)
