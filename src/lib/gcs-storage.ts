/**
 * GCS Storage 헬퍼 — Supabase Storage 대체
 *
 * Phase 4: supabase.storage.from('bucket').upload() → GCS 직접 업로드
 * 공개 URL: https://storage.googleapis.com/bscamp-storage/{bucket}/{path}
 *
 * USE_CLOUD_SQL=true 시 활성화
 */

const GCS_BUCKET = "bscamp-storage";
const GCS_PUBLIC_BASE = `https://storage.googleapis.com/${GCS_BUCKET}`;

/**
 * GCS 공개 URL 생성
 * Supabase: getPublicUrl() → { data: { publicUrl } }
 * GCS: https://storage.googleapis.com/bscamp-storage/{bucket}/{path}
 */
export function getGcsPublicUrl(bucket: string, path: string): string {
  return `${GCS_PUBLIC_BASE}/${bucket}/${path}`;
}

/**
 * Supabase Storage URL → GCS URL 변환
 * Input:  https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/creatives/account/media/file.jpg
 * Output: https://storage.googleapis.com/bscamp-storage/creatives/account/media/file.jpg
 */
export function convertSupabaseUrlToGcs(supabaseUrl: string): string {
  const match = supabaseUrl.match(/\/storage\/v1\/object\/public\/(.+)/);
  if (match) {
    return `${GCS_PUBLIC_BASE}/${match[1]}`;
  }
  return supabaseUrl;
}

/**
 * GCS에 파일 업로드 (서버 사이드)
 * Supabase: storage.from(bucket).upload(path, file, { contentType })
 * GCS: Google Cloud Storage JSON API 직접 호출
 *
 * 반환: { publicUrl, error }
 */
export async function uploadToGcs(
  bucket: string,
  path: string,
  fileBuffer: Buffer | Uint8Array,
  contentType: string = "application/octet-stream",
): Promise<{ publicUrl: string | null; error: string | null }> {
  try {
    const gcsPath = `${bucket}/${path}`;

    // Google Cloud Storage JSON API를 사용한 업로드
    // 서비스 계정 인증 필요 (GOOGLE_APPLICATION_CREDENTIALS 또는 gcloud auth)
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=${encodeURIComponent(gcsPath)}`;

    // gcloud CLI를 통한 액세스 토큰 획득
    const { execSync } = await import("child_process");
    let accessToken: string;
    try {
      accessToken = execSync("gcloud auth print-access-token", { encoding: "utf-8" }).trim();
    } catch {
      // gcloud 없는 환경 → 서비스 계정 키 사용 시도
      return { publicUrl: null, error: "GCS auth not available. Set GOOGLE_APPLICATION_CREDENTIALS or run gcloud auth login." };
    }

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: fileBuffer as unknown as BodyInit,
    });

    if (!res.ok) {
      const body = await res.text();
      return { publicUrl: null, error: `GCS upload failed: ${res.status} ${body.slice(0, 200)}` };
    }

    const publicUrl = `${GCS_PUBLIC_BASE}/${gcsPath}`;
    return { publicUrl, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { publicUrl: null, error: message };
  }
}

/**
 * GCS에서 파일 삭제
 */
export async function deleteFromGcs(
  bucket: string,
  path: string,
): Promise<{ error: string | null }> {
  try {
    const gcsPath = `${bucket}/${path}`;
    const deleteUrl = `https://storage.googleapis.com/storage/v1/b/${GCS_BUCKET}/o/${encodeURIComponent(gcsPath)}`;

    const { execSync } = await import("child_process");
    const accessToken = execSync("gcloud auth print-access-token", { encoding: "utf-8" }).trim();

    const res = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${accessToken}` },
    });

    if (!res.ok && res.status !== 404) {
      return { error: `GCS delete failed: ${res.status}` };
    }
    return { error: null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * USE_CLOUD_SQL 환경에서 GCS를 사용할지 판단
 */
export function useGcsStorage(): boolean {
  return process.env.USE_CLOUD_SQL === "true";
}
