# 경쟁사 분석기 v2 — T4 다운로드 설계서

## 1. 데이터 모델
기존 `CompetitorAd` 타입 변경 없음. 추가 타입:

```typescript
// client-download.ts
interface DownloadFile {
  url: string;
  filename: string;
  folder?: string;  // ZIP 내 폴더 경로
}

interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
}
```

## 2. API 설계
서버 API 변경 없음 (fallback 유지).
모든 다운로드를 클라이언트에서 직접 처리.

### 클라이언트 유틸 (`src/lib/competitor/client-download.ts`)

```typescript
// 단일 파일 다운로드
export async function downloadFile(url: string, filename: string): Promise<void>

// 복수 파일 ZIP 다운로드
export async function downloadFilesAsZip(
  files: DownloadFile[],
  zipFilename: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void>
```

#### downloadFile 로직
1. `fetch(url)` → blob
2. `URL.createObjectURL(blob)` → `<a>` 생성 → click → revoke
3. 실패 시 toast 알림

#### downloadFilesAsZip 로직
1. `files` 순회, 각각 `fetch(url)`
2. 성공한 blob을 `JSZip`에 추가 (folder 있으면 폴더 경로)
3. `zip.generateAsync({ type: "blob" })` → 다운로드
4. 진행 콜백: `onProgress({ total, completed, failed })`
5. 파일명 중복 방지: `usedNames` Set, 충돌 시 `_2`, `_3` suffix

## 3. 컴포넌트 구조

### AdCard 변경
- Props 추가: `selected?: boolean`, `onSelect?: (id: string) => void`
- 좌상단 체크박스 (absolute, z-10)
- 다운로드 버튼: `<a href="/api/...">` → `<button onClick={downloadFile(...)}>`

### AdCardList 변경
- Props 추가: `selectedAds: Set<string>`, `onSelectAd: (id: string) => void`
- 헤더에 선택 정보 표시: "N개 선택됨" + "선택 다운로드" 버튼
- 전체 다운로드: 서버 API → `downloadFilesAsZip()` 전환
- 다운로드 진행 표시: `downloading` → `downloadProgress` 상태

### AdMediaModal 변경
- `handleDownload`: `window.open(서버API)` → `downloadFile()` 직접 호출

### CompetitorDashboard 변경
- `selectedAds: Set<string>` 상태 추가
- `handleSelectAd(id)`: toggle
- `AdCardList`에 `selectedAds`, `onSelectAd` 전달

## 4. 에러 처리
| 상황 | 처리 |
|------|------|
| fetch 실패 (CORS/네트워크) | toast 에러 메시지 |
| ZIP 생성 중 일부 실패 | 성공한 파일만 포함 + toast 경고 |
| 0건 성공 | toast "다운로드할 수 있는 파일이 없습니다" |

## 5. 구현 순서
1. [x] `src/lib/competitor/client-download.ts` — 유틸 생성
2. [x] `ad-card.tsx` — 체크박스 + 개별 다운로드 전환
3. [x] `ad-media-modal.tsx` — 모달 다운로드 전환
4. [x] `ad-card-list.tsx` — 선택/전체 다운로드 전환
5. [x] `competitor-dashboard.tsx` — selectedAds 상태 관리
6. [x] 빌드 검증
