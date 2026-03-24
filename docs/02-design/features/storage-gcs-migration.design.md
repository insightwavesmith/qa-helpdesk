# Storage → GCS 이관 설계서

## 1. 아키텍처 결정

### 듀얼 라이트 패턴
```
useGcsStorage() === true  → uploadToGcs() / getGcsPublicUrl() / deleteFromGcs()
useGcsStorage() === false → supabase.storage.from().upload() (기존 유지)
```
- 롤백 안전: ENV 변수 하나로 Supabase로 복귀 가능
- Cloud Run: USE_CLOUD_SQL=true → 자동 GCS
- Vercel: USE_CLOUD_SQL 없음 → 기존 Supabase 유지

### 클라이언트 업로드 전략
GCS SDK는 서버 사이드 전용 → API Route 프록시 필수

```
[Client] FormData(file, bucket, path)
    → POST /api/upload
    → [Server] uploadToGcs(bucket, path, buffer, contentType)
    → { publicUrl }
```

## 2. API 설계

### POST /api/upload (신규)

**파일**: `src/app/api/upload/route.ts`

**요청**:
```
Content-Type: multipart/form-data
Authorization: Bearer (Supabase session or CRON_SECRET)

FormData:
  file: File (필수)
  bucket: string (필수) — question-images, qa-images, content-images, review-images, documents, email-attachments
  path: string (필수) — 예: "questions/1711234567-abc123.jpg"
```

**응답**:
```json
{ "publicUrl": "https://storage.googleapis.com/bscamp-storage/{bucket}/{path}" }
```

**에러**:
```json
{ "error": "파일이 필요합니다." }          // 400
{ "error": "인증이 필요합니다." }          // 401
{ "error": "허용되지 않는 버킷입니다." }    // 400
{ "error": "파일 크기 초과 (최대 10MB)" }  // 400
{ "error": "업로드 실패" }                 // 500
```

**보안**:
- 허용 버킷 화이트리스트: `question-images`, `qa-images`, `content-images`, `review-images`, `documents`, `email-attachments`
- 파일 크기 제한: 10MB (기존과 동일)
- 인증: Supabase Auth getUser() 또는 CRON_SECRET

### DELETE /api/upload (신규, content thumbnail 삭제용)

**요청**: `?bucket=content-images&path=thumbnails/xxx.jpg`
**응답**: `{ "success": true }`

## 3. 파일별 수정 상세

### A. 서버 사이드 (4파일)

#### A1: `src/actions/contents.ts` — resolveImagePlaceholders()
```typescript
// Before:
const { error: uploadError } = await supabase.storage
  .from("content-images")
  .upload(fileName, imageBuffer, { contentType: "image/jpeg", upsert: true });
const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(fileName);

// After (듀얼 라이트):
import { useGcsStorage, uploadToGcs, getGcsPublicUrl } from "@/lib/gcs-storage";

if (useGcsStorage()) {
  const { publicUrl, error } = await uploadToGcs("content-images", fileName, imageBuffer, "image/jpeg");
  if (error) { console.warn(...); continue; }
  result = result.replace(fullMatch, `![${alt}](${publicUrl})`);
} else {
  // 기존 Supabase 코드 유지
}
```

#### A2: `src/app/api/admin/email/upload/route.ts`
```typescript
// 동일 패턴: useGcsStorage() 분기
if (useGcsStorage()) {
  const { publicUrl, error } = await uploadToGcs("email-attachments", fileName, buffer, file.type);
  if (error) return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  return NextResponse.json({ url: publicUrl, filename: file.name, size: file.size });
}
// else 기존 코드
```

#### A3: `src/lib/lp-media-downloader.ts` — uploadBufferToStorage()
```typescript
async function uploadBufferToStorage(supabase: any, path: string, buffer: Buffer, contentType: string): Promise<boolean> {
  if (useGcsStorage()) {
    const { error } = await uploadToGcs("creatives", path, buffer, contentType);
    if (error) { console.error(`[lp-media] GCS upload failed (${path}):`, error); return false; }
    return true;
  }
  // 기존 Supabase 코드
}
```

#### A4: `src/app/api/cron/crawl-lps/route.ts` — uploadToStorage() + uploadHtmlToStorage()
```typescript
// 동일 패턴: useGcsStorage() 분기
async function uploadToStorage(supabase: any, path: string, base64Data: string): Promise<boolean> {
  const buffer = Buffer.from(base64Data, "base64");
  if (useGcsStorage()) {
    const { error } = await uploadToGcs("creatives", path, buffer, "image/jpeg");
    return !error;
  }
  // 기존 Supabase 코드
}
```

### B. 클라이언트 사이드 (10파일)

공통 유틸리티 함수 추가:
```typescript
// src/lib/upload-client.ts (신규)
export async function uploadFile(file: File, bucket: string, path: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("bucket", bucket);
  formData.append("path", path);

  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "업로드 실패");
  }
  const data = await res.json();
  return data.publicUrl;
}

export async function deleteFile(bucket: string, path: string): Promise<void> {
  await fetch(`/api/upload?bucket=${bucket}&path=${encodeURIComponent(path)}`, { method: "DELETE" });
}
```

#### B1~B10 공통 교체 패턴:
```typescript
// Before (각 컴포넌트):
const supabase = createClient();
const { error } = await supabase.storage.from("question-images").upload(filePath, img.file, ...);
const { data: { publicUrl } } = supabase.storage.from("question-images").getPublicUrl(filePath);

// After:
import { uploadFile } from "@/lib/upload-client";
const publicUrl = await uploadFile(img.file, "question-images", filePath);
```

### C. 하드코딩 URL (3파일)

#### C1: `src/lib/newsletter-row-templates.ts`
```typescript
// Before:
const BANNER_BASE_URL = "https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners";

// After:
const BANNER_BASE_URL = process.env.USE_CLOUD_SQL === "true"
  ? "https://storage.googleapis.com/bscamp-storage/content-images/newsletter-banners"
  : "https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners";
```

#### C2: `src/lib/email-template-utils.ts` — 동일 패턴
#### C3: `src/lib/email-default-template.ts` — 상수 추출 후 replace_all

## 4. 에러 처리
| 에러 | 처리 |
|------|------|
| GCS 인증 실패 | ADC 미설정 시 Supabase 폴백 (useGcsStorage() false) |
| 업로드 실패 | { publicUrl: null, error: message } → 에러 응답 |
| 파일 크기 초과 | 400 응답 (10MB 기존 제한 유지) |
| 버킷 미허용 | 400 응답 (화이트리스트 검증) |

## 5. 구현 순서 (체크리스트)

### Wave 1: 서버 사이드 + 인프라 (backend-dev)
- [ ] `/api/upload` route 생성
- [ ] `upload-client.ts` 유틸리티 생성
- [ ] A1: contents.ts 수정
- [ ] A2: email upload route 수정
- [ ] A3: lp-media-downloader.ts 수정
- [ ] A4: crawl-lps route 수정

### Wave 2: 클라이언트 사이드 (frontend-dev — Wave 1 완료 후)
- [ ] B1~B6: Q&A 관련 컴포넌트 (6파일)
- [ ] B7~B8: 콘텐츠 관련 컴포넌트 (2파일)
- [ ] B9: 리뷰 폼 (1파일)
- [ ] B10: 회원가입 페이지 (1파일)

### Wave 3: URL 교체 (backend-dev)
- [ ] C1~C3: BANNER_BASE_URL + 하드코딩 URL 교체

### Wave 4: 빌드 + QA
- [ ] tsc --noEmit
- [ ] next lint
- [ ] npm run build
- [ ] Gap 분석
