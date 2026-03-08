# 경쟁사 분석기 v2 — T4 다운로드 Gap 분석

## Match Rate: 100%

## 일치 항목

### T4.1 클라이언트 직접 다운로드 유틸 ✅
- `src/lib/competitor/client-download.ts` 신규 생성
- `downloadFile(url, filename)`: fetch → blob → createObjectURL → a.click
- `downloadFilesAsZip(files, zipFilename, onProgress)`: JSZip 클라이언트 ZIP
- 에러 핸들링: throw Error (호출측에서 alert/toast)
- 진행 표시: onProgress 콜백 (total/completed/failed)
- 파일명 중복 방지: usedNames Set + suffix

### T4.2 개별 다운로드 전환 ✅
- `ad-card.tsx`: `<a href="/api/...">` → `<button onClick={downloadFile()}>` + 로딩 스피너
- `ad-media-modal.tsx`: `window.open(서버API)` → `downloadFile()` 직접 호출
- 서버 API 호출 완전 제거

### T4.3 선택 다운로드 (체크박스 + ZIP) ✅
- `ad-card.tsx`: 좌상단 체크박스 (selected/onSelect props)
- `competitor-dashboard.tsx`: `selectedAds: Set<string>` 상태 + `handleSelectAd` 토글
- `ad-card-list.tsx`: "N개 선택 다운로드" 버튼 + 진행 표시 (N/M건)
- 전체 다운로드: 서버 API → 클라이언트 ZIP 전환
- 캐러셀: 폴더 묶음 (`브랜드_광고ID/slide_N.jpg`)
- 새 검색 시 selectedAds 초기화

### T4.4 서버 API 정리 ✅
- `download/route.ts`, `download-zip/route.ts` 파일 유지 (삭제 안 함)
- 프론트에서 더 이상 호출하지 않음

## 불일치 항목
- 없음

## 검증 결과
- `npx tsc --noEmit`: 에러 0
- `npm run lint`: 변경 파일 에러 0 (기존 44 warnings은 무관)
- `npm run build`: 성공

## 변경 파일
1. `src/lib/competitor/client-download.ts` (신규)
2. `src/app/(main)/protractor/competitor/components/ad-card.tsx` (수정)
3. `src/app/(main)/protractor/competitor/components/ad-media-modal.tsx` (수정)
4. `src/app/(main)/protractor/competitor/components/ad-card-list.tsx` (수정)
5. `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` (수정)
6. `docs/01-plan/features/competitor-v2-download.plan.md` (신규)
7. `docs/02-design/features/competitor-v2-download.design.md` (신규)
