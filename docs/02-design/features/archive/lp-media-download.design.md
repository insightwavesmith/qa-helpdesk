# LP 미디어 리소스 전체 다운로드 — Design

## 1. 데이터 모델

### landing_pages 테이블 변경
```sql
ALTER TABLE landing_pages
ADD COLUMN IF NOT EXISTS media_assets jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN landing_pages.media_assets IS '미디어 리소스 매핑 [{original_url, storage_path, type, size_bytes, hash}]';
```

### media_assets JSONB 구조
```typescript
interface MediaAsset {
  original_url: string;      // 원본 URL
  storage_path: string;      // lp/{account_id}/{lp_id}/media/{hash}.{ext}
  type: "image" | "gif" | "video";
  mime_type: string;         // image/jpeg, image/gif, video/mp4 등
  size_bytes: number;
  hash: string;              // SHA-256 (중복 방지)
  extracted_from: "img" | "video" | "source" | "css-bg";
}
```

## 2. API 설계

### 변경 없음 (기존 crawl-lps 확장)
기존 `GET /api/cron/crawl-lps` 플로우에 미디어 단계 추가.

## 3. 컴포넌트 구조

### 신규 파일: `src/lib/lp-media-downloader.ts`

```typescript
// HTML에서 미디어 URL 추출
export function extractMediaUrls(html: string, baseUrl: string): MediaUrl[]

// 미디어 다운로드 + Storage 업로드 + 매핑 반환
export async function downloadLpMedia(
  supabase: SupabaseClient,
  lp: { id: string; account_id: string },
  html: string,
  existingAssets: MediaAsset[]
): Promise<MediaAsset[]>
```

### 미디어 URL 추출 규칙
1. `<img src="...">`, `<img data-src="...">` (lazy load)
2. `<video src="...">`, `<video poster="...">`
3. `<source src="...">` (video/picture 내부)
4. CSS `background-image: url(...)` (인라인 style)
5. **제외**: 1x1 픽셀, favicon, 외부 트래커 (facebook, google-analytics 등)

### 제외 패턴
```typescript
const EXCLUDED_PATTERNS = [
  /1x1/, /pixel/, /favicon/,
  /facebook\.com/, /google-analytics/,
  /doubleclick/, /fbcdn.*tr/,
  /\.ico$/, /tracking/,
];
```

### 허용 확장자
```typescript
const ALLOWED_EXTENSIONS = {
  image: ["jpg", "jpeg", "png", "webp", "svg"],
  gif: ["gif"],
  video: ["mp4", "webm"],
};
```

## 4. 에러 처리

| 에러 | 처리 |
|------|------|
| 다운로드 타임아웃 (15s) | 스킵, 다음 크론에서 재시도 |
| 파일 50MB 초과 | 스킵 + 로그 |
| LP당 200MB 초과 | 나머지 스킵 + 로그 |
| Storage 업로드 실패 | 스킵, 에러 카운트 |
| HTML 파싱 실패 | 미디어 단계 전체 스킵 |
| 이미 존재하는 hash | 스킵 (중복 방지) |

## 5. 구현 순서

- [ ] DB: media_assets 컬럼 추가 (migration)
- [ ] src/lib/lp-media-downloader.ts 신규 작성
  - extractMediaUrls(): HTML 파싱 → URL 목록
  - downloadLpMedia(): 다운로드 + 업로드 + 매핑
- [ ] crawl-lps/route.ts에 미디어 다운로드 단계 추가 (hashChanged 블록 내)
- [ ] tsc + build 확인
