# 경쟁사 분석기 ZIP 다운로드 설계서

## 1. 데이터 모델
기존 `CompetitorAd` 타입 그대로 사용. DB/타입 변경 없음.

ZIP 다운로드에 필요한 필드:
- `id` (ad_archive_id) — 파일명
- `pageName` — 파일명
- `imageUrl` — 이미지 URL
- `videoPreviewUrl` — 영상 광고의 썸네일 URL
- `displayFormat` — VIDEO면 videoPreviewUrl 우선

## 2. API 설계

### POST /api/competitor/download-zip
**요청:**
```json
{
  "ads": [
    { "id": "123", "pageName": "브랜드A", "imageUrl": "https://...", "videoPreviewUrl": "https://...", "displayFormat": "IMAGE" },
    ...
  ]
}
```
- `ads`: 다운로드할 광고 배열 (클라이언트에서 filteredAds 전달)
- 최대 50건 제한

**응답:**
- 200: ZIP 바이너리 (`application/zip`)
- 400: 유효성 실패 (빈 배열, 50건 초과)
- 401: 미인증
- 500: 서버 오류

**로직:**
1. 인증 확인
2. body에서 ads 배열 추출, 50건 제한 검증
3. 각 광고에서 이미지 URL 결정:
   - VIDEO → videoPreviewUrl ?? imageUrl
   - 그 외 → imageUrl
4. URL 있는 것만 필터
5. 병렬 fetch (fbcdn 프록시)
6. JSZip으로 파일 추가
7. ZIP 생성 → 스트림 응답
8. 파일명: `competitor-ads-{timestamp}.zip`
9. 개별 이미지: `{pageName}_{adId}.jpg`

## 3. 컴포넌트 구조

### AdCardList 수정
- 결과 헤더 영역에 "📥 전체 다운로드 (ZIP)" 버튼 추가
- `ads` prop에서 이미지 있는 광고 수 계산 → 0이면 비활성화
- 클릭 시 POST /api/competitor/download-zip 호출
- 로딩 중 스피너 표시
- 응답 blob → createObjectURL → a.click() 자동 다운로드

## 4. 에러 처리
| 상황 | 에러 코드 | 사용자 메시지 |
|------|----------|-------------|
| 미인증 | 401 | 로그인이 필요합니다 |
| 빈 배열 | 400 | 다운로드할 이미지가 없습니다 |
| 50건 초과 | 400 | 최대 50건까지 다운로드 가능합니다 |
| 모든 fetch 실패 | 500 | 이미지를 가져올 수 없습니다 |
| 일부 실패 | - | 성공한 것만 ZIP에 포함 (에러 무시) |

## 5. 구현 순서
- [x] Plan 작성
- [x] Design 작성
- [ ] JSZip 설치
- [ ] T1: API route 생성 (`src/app/api/competitor/download-zip/route.ts`)
- [ ] T2: AdCardList에 ZIP 다운로드 버튼 추가
- [ ] tsc + lint + build 검증
- [ ] Gap 분석
