# 경쟁사 분석기 v2 — T4 다운로드 (클라이언트 직접 + 선택) Plan

## 배경
- 현재 다운로드: 서버 프록시(`/api/competitor/download`, `/api/competitor/download-zip`) 경유
- fbcdn CORS 확인: `Access-Control-Allow-Origin: *` → 브라우저에서 직접 fetch 가능
- 서버 프록시 불필요한 트래픽 + 비용 발생

## 목표
1. 개별 다운로드: 서버 프록시 → 클라이언트 직접 다운로드 전환
2. 선택 다운로드: 체크박스로 광고 선택 → 클라이언트 ZIP 생성
3. 전체 다운로드: 서버 ZIP → 클라이언트 ZIP 전환
4. 서버 API: 삭제하지 않고 fallback으로 유지 (호출만 제거)

## 범위
### T4.1 클라이언트 직접 다운로드 유틸
- `src/lib/competitor/client-download.ts` (신규)
- `downloadFile(url, filename)`: fetch → blob → a.click
- `downloadFilesAsZip(files)`: JSZip 클라이언트 ZIP
- 에러 핸들링 + 진행 표시 (N/M건)

### T4.2 개별 다운로드 전환
- `ad-card.tsx`: 서버 API 링크 → `downloadFile()` 호출
- `ad-media-modal.tsx`: `window.open(서버API)` → `downloadFile()` 호출

### T4.3 선택 다운로드 (체크박스 + ZIP)
- `competitor-dashboard.tsx`: `selectedAds: Set<string>` 상태 관리
- `ad-card-list.tsx`: 헤더에 선택 카운트 + 선택 다운로드 버튼
- `ad-card.tsx`: 좌상단 체크박스 추가

### T4.4 서버 API 정리
- 서버 API 파일 유지 (삭제 금지)
- 프론트에서 호출 제거만

## 성공 기준
- 개별 다운로드 클릭 → 파일 다운로드 (서버 미경유)
- 체크박스 선택 → ZIP 다운로드 (이미지+영상 포함)
- 전체 다운로드 → 클라이언트 ZIP (서버 미경유)
- 캐러셀: 폴더로 묶음 (`브랜드_광고ID/slide_N.jpg`)
- `npm run build` 성공
