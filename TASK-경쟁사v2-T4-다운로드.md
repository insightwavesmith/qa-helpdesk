# TASK: 경쟁사 분석기 v2 — T4 다운로드 (클라이언트 직접 + 선택)

## 전제
- T1(구조) 완료 후 실행
- fbcdn CORS 확인됨: Access-Control-Allow-Origin: * → 브라우저에서 직접 fetch 가능

## 목표
다운로드를 서버 프록시 → 클라이언트 직접 다운로드로 전환. 선택 다운로드(체크박스) 추가.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234!

## T4.1 클라이언트 직접 다운로드 유틸
### 파일
- `src/lib/competitor/client-download.ts` (신규)
### 할 것
- `downloadFile(url: string, filename: string)` — fetch → blob → createObjectURL → a.click
- `downloadFilesAsZip(files: {url, filename}[])` — JSZip으로 클라이언트에서 ZIP 생성
- 에러 핸들링: fetch 실패 시 toast 알림
- 진행 표시: 다운로드 진행 건수 (3/10)

## T4.2 개별 다운로드 전환
### 파일
- `src/app/(main)/protractor/competitor/components/ad-card.tsx`
- `src/app/(main)/protractor/competitor/components/ad-media-modal.tsx`
### 할 것
- 기존: `/api/competitor/download?ad_id=xxx` (서버 프록시)
- 변경: `downloadFile(ad.imageUrl, filename)` (클라이언트 직접)
- 영상 다운로드도 직접: `downloadFile(ad.videoUrl, filename)`
- 서버 API 호출 제거

## T4.3 선택 다운로드 (체크박스 + ZIP)
### 파일
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- `src/app/(main)/protractor/competitor/components/ad-card-list.tsx`
- `src/app/(main)/protractor/competitor/components/ad-card.tsx`
### 할 것
- 각 카드에 체크박스 추가 (좌상단)
- 상태: `selectedAds: Set<string>` (ad.id)
- 헤더에 "☑️ N개 선택됨" + "📥 선택 다운로드" 버튼
- "전체 다운로드" 버튼 유지
- 선택 다운로드: 선택된 광고의 이미지+영상을 클라이언트 ZIP으로
- 캐러셀: 전체 이미지를 폴더로 묶음 (`브랜드_광고ID/slide_1.jpg`)
- 다운로드 중 진행 표시 + 완료 후 toast

## T4.4 서버 다운로드 API 정리
### 파일
- `src/app/api/competitor/download/route.ts`
- `src/app/api/competitor/download-zip/route.ts`
### 할 것
- 두 파일 모두 삭제하지는 마라 — 극단적 fallback으로 유지
- 프론트에서 더 이상 호출하지 않으면 됨

## 하지 말 것
- 검색/필터 UI 변경하지 마라
- 서버 API 삭제하지 마라 (fallback 유지)

## 검증 기준
- 개별 다운로드: 카드/모달에서 클릭 → 파일 다운로드 (서버 거치지 않음)
- 선택 다운로드: 체크박스 선택 → ZIP 다운로드 (이미지+영상 포함)
- 전체 다운로드: 기존처럼 동작 (클라이언트 ZIP)
- 영상 다운로드: MP4 파일 직접 다운로드 (용량 제한 없음)
