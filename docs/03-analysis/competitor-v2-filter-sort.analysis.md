# 경쟁사 분석기 v2 — T3 필터·정렬·페이지네이션 Gap 분석

## Match Rate: 100%

## 설계 항목 vs 구현 비교

### T3.1 필터 칩 — 슬라이드 분리
| 설계 | 구현 | 일치 |
|------|------|:----:|
| FilterState.mediaType에 `carousel` 추가 | ✅ `"all" \| "image" \| "carousel" \| "video"` | ✅ |
| "📑 슬라이드" 칩 추가 (CAROUSEL 전용) | ✅ 구현됨 | ✅ |
| "🖼️ 이미지" → IMAGE만 (CAROUSEL 제외) | ✅ `displayFormat !== "IMAGE"` 만 체크 | ✅ |
| 칩 순서: 30일+/게재중/FB/IG │ 이미지/슬라이드/영상 | ✅ group별 분리 렌더링 | ✅ |

### T3.2 정렬 옵션
| 설계 | 구현 | 일치 |
|------|------|:----:|
| sortBy: `"latest" \| "duration"` | ✅ FilterState에 추가 | ✅ |
| 최신순 칩 (기본 활성) | ✅ 기본값 `"latest"`, 회색계열 활성 스타일 | ✅ |
| 운영기간순 칩 | ✅ durationDays DESC 정렬 | ✅ |
| 구분선(|) 후 정렬 칩 | ✅ `w-px h-5 bg-gray-200` divider | ✅ |

### T3.3 더보기 페이지네이션
| 설계 | 구현 | 일치 |
|------|------|:----:|
| 더보기 버튼 (nextPageToken 존재 시) | ✅ 이미 구현됨 | ✅ |
| 총 N건 표시 (serverTotalCount) | ✅ 이미 구현됨 | ✅ |
| 로딩 스피너 | ✅ 이미 구현됨 | ✅ |
| 기존 결과에 append + 중복 제거 | ✅ 이미 구현됨 | ✅ |

## 불일치 항목
없음

## 수정 필요
없음

## 검증
- [x] `npx tsc --noEmit` — 타입 에러 0개
- [x] `npm run lint` — 변경 파일 lint 에러 0개 (기존 에러는 다른 파일)
- [x] `npm run build` — 빌드 성공
- [x] 기존 기능 영향 없음 (API 변경 없음, 하위 호환)
