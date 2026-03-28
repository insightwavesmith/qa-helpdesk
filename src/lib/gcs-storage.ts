/**
 * GCS Storage 헬퍼 — Supabase Storage 대체
 *
 * Phase 4: supabase.storage.from('bucket').upload() → GCS 직접 업로드
 * 공개 URL: https://storage.googleapis.com/bscamp-storage/{bucket}/{path}
 *
 * ADC(Application Default Credentials) 기반 인증 — Cloud Run 서비스 계정 자동 적용
 */

import { Storage } from "@google-cloud/storage";

const GCS_BUCKET = "bscamp-storage";
const GCS_PUBLIC_BASE = `https://storage.googleapis.com/${GCS_BUCKET}`;

let storage: Storage | null = null;

function getStorage(): Storage {
  if (!storage) {
    // Vercel 서버리스: JSON 문자열 환경변수에서 credentials 로드
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      const credentials = JSON.parse(serviceAccountJson);
      storage = new Storage({
        projectId: credentials.project_id,
        credentials,
      });
    } else {
      // 로컬/Cloud Run: ADC 자동 인증
      storage = new Storage();
    }
  }
  return storage;
}

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
 * Input:  (구) /storage/v1/object/public/{bucket}/{path}
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
 * GCS: @google-cloud/storage SDK (ADC 자동 인증)
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
    const file = getStorage().bucket(GCS_BUCKET).file(gcsPath);

    await file.save(Buffer.from(fileBuffer), {
      contentType,
      resumable: false,
    });

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
    await getStorage().bucket(GCS_BUCKET).file(gcsPath).delete({ ignoreNotFound: true });
    return { error: null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

