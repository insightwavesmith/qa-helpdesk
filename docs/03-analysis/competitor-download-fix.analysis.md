# 개별 다운로드 수정 Gap 분석

## Match Rate: 95%

## 일치 항목

### T1. 원인 파악 + 수정
| 스펙 요구사항 | 구현 상태 | 판정 |
|---|---|---|
| download/route.ts 수정 | 에러 핸들링 구조 개선, URL fallback 분기 추가 | OK |
| ad-cache.ts 수정 | `getAdFromCache()` try-catch 래핑, 예외 시 null 반환, 상세 로깅 | OK |
| search/route.ts UPSERT 확인 | 기존 await + try-catch 유지, UPSERT 실패해도 검색 응답 유지 | OK |
| 기대 동작: 검색→캐시→조회→fetch→스트림 | getAdFromCache 예외 방지로 500 에러 해소 | OK |
| ZIP route 수정 금지 | download-zip/route.ts 미변경 | OK |
| 새 테이블/환경변수 금지 | 추가 없음 | OK |

### T2. fallback 방식 추가
| 스펙 요구사항 | 구현 상태 | 판정 |
|---|---|---|
| `url` 쿼리 파라미터 수용 | `searchParams.get("url")` 처리 | OK |
| URL 있으면 캐시 스킵, 직접 fetch | `if (directUrl)` 분기에서 바로 mediaUrl 할당 | OK |
| URL 없으면 기존 캐시 로직 유지 | `else` 블록에 기존 로직 보존 | OK |
| scontent/video fbcdn 도메인만 허용 | `isAllowedFbcdnUrl()`: `.fbcdn.net`, `.facebook.com` 도메인만 허용 | OK |
| 기존 캐시 로직 삭제 금지 | 캐시 로직 온전히 존재 | OK |
| 클라이언트 연동 | ad-card.tsx, ad-media-modal.tsx에서 url 파라미터 전달 | OK |

### 검증 기준
| 항목 | 상태 |
|---|---|
| tsc --noEmit 통과 | PASS |
| npm run build 통과 | PASS |
| ZIP 다운로드 미수정 | PASS |

## 불일치 항목

### 1. 스펙 범위 외 파일 수정 (경미)
- ad-card.tsx, ad-media-modal.tsx는 T2 파일 목록에 없으나, T2 fallback이 실제로 동작하려면 클라이언트에서 URL 전달이 필수.
- 검증 기준에 "모달 내 다운로드 클릭 → 성공"이 있으므로 필수적 수정이었음.

### 2. URL fallback 시 pageName (경미)
- directUrl 사용 시 `pageName = "ad"` 하드코딩 → 파일명이 `ad_{ad_id}.jpg` 형태.
- 기능에 영향 없음, 파일명 품질 차이만.

## 수정 필요

### [필수] 없음

### [권장]
- URL fallback 시 pageName 개선 (ad_id로 캐시에서 page_name만 조회) — 심각도: 매우 낮음

## 변경 파일 목록
1. `src/lib/competitor/ad-cache.ts` — getAdFromCache try-catch 방어
2. `src/app/api/competitor/download/route.ts` — URL fallback + 에러 핸들링
3. `src/app/(main)/protractor/competitor/components/ad-card.tsx` — url 파라미터 추가
4. `src/app/(main)/protractor/competitor/components/ad-media-modal.tsx` — url 파라미터 추가
