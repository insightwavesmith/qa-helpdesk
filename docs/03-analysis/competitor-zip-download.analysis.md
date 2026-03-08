# 경쟁사 분석기 ZIP 다운로드 Gap 분석

## Match Rate: 100%

## 일치 항목
| # | 설계 항목 | 구현 상태 | 일치 |
|---|----------|----------|------|
| 1 | POST /api/competitor/download-zip | `src/app/api/competitor/download-zip/route.ts` | ✅ |
| 2 | body에 ads 배열 전달 | ZipAdItem[] 타입으로 수신 | ✅ |
| 3 | 최대 50건 제한 | MAX_ADS=50 검증 | ✅ |
| 4 | 영상은 videoPreviewUrl로 대체 | displayFormat=VIDEO → videoPreviewUrl ?? imageUrl | ✅ |
| 5 | 이미지 없는 광고 스킵 | filter(Boolean) | ✅ |
| 6 | 파일명 `{pageName}_{adId}.jpg` | safeName + ad.id + .jpg | ✅ |
| 7 | ZIP 파일명 `competitor-ads-{timestamp}.zip` | ISO timestamp 포맷 | ✅ |
| 8 | 인증 확인 | supabase.auth.getUser() | ✅ |
| 9 | 병렬 fetch | Promise.allSettled | ✅ |
| 10 | 일부 실패 시 성공한 것만 포함 | fulfilled만 zip.file() | ✅ |
| 11 | 전체 실패 시 500 에러 | addedCount === 0 검사 | ✅ |
| 12 | 기존 download route 수정 없음 | 미변경 확인 | ✅ |
| 13 | 검색 결과 상단 "전체 다운로드" 버튼 | AdCardList 헤더 영역 | ✅ |
| 14 | 다운로드 중 로딩 스피너 | Loader2 animate-spin | ✅ |
| 15 | 빈 검색 결과 시 비활성화 | downloadableCount === 0 → disabled | ✅ |
| 16 | 완료 시 자동 파일 저장 | blob → createObjectURL → a.click() | ✅ |
| 17 | 디자인 시스템 색상 | #F75D5D / #E54949 | ✅ |
| 18 | 파일명 중복 방지 | usedNames Set + counter suffix | ✅ |

## 불일치 항목
없음.

## 수정 필요
없음.

## 빌드 검증
- `tsc --noEmit`: ✅ 통과
- `eslint` (변경 파일): ✅ 에러 0
- `npm run build`: ✅ 성공

## 변경 파일 목록
| 파일 | 변경 유형 |
|------|----------|
| `package.json` | JSZip 의존성 추가 |
| `src/app/api/competitor/download-zip/route.ts` | 신규 생성 |
| `src/app/(main)/protractor/competitor/components/ad-card-list.tsx` | ZIP 버튼 추가 |
| `docs/01-plan/features/competitor-zip-download.plan.md` | 신규 생성 |
| `docs/02-design/features/competitor-zip-download.design.md` | 신규 생성 |
| `docs/03-analysis/competitor-zip-download.analysis.md` | 신규 생성 |
| `docs/.pdca-status.json` | 상태 추가 |
