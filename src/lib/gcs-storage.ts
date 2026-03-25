/**
 * GCS Storage 헬퍼 — Supabase Storage 대체
 *
 * Phase 4: supabase.storage.from('bucket').upload() → GCS 직접 업로드
 * 공개 URL: https://storage.googleapis.com/bscamp-storage/{bucket}/{path}
 *
 * USE_CLOUD_SQL=true 시 활성화
 * ADC(Application Default Credentials) 기반 인증 — Cloud Run 서비스 계정 자동 적용
 */

import { Storage } from "@google-cloud/storage";

const GCS_BUCKET = "bscamp-storage";
const GCS_PUBLIC_BASE = `https://storage.googleapis.com/${GCS_BUCKET}`;

let storage: Storage | null = null;

function getStorage(): Storage {
  if (!storage) {
    storage = new Storage();
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

/**
 * USE_CLOUD_SQL 환경에서 GCS를 사용할지 판단
 */
export function useGcsStorage(): boolean {
  return process.env.USE_CLOUD_SQL === "true";
}

// ─── Agent Ops GCS 헬퍼 (agent-ops/ prefix) ─────────────────────────

const AGENT_OPS_PREFIX = "agent-ops";

/**
 * GCS에서 JSON 파일 읽기
 * @returns 파싱된 객체 또는 null (파일 없음/에러)
 */
export async function readGcsJson<T>(path: string): Promise<T | null> {
  try {
    const file = getStorage().bucket(GCS_BUCKET).file(`${AGENT_OPS_PREFIX}/${path}`);
    const [content] = await file.download();
    return JSON.parse(content.toString("utf-8")) as T;
  } catch {
    return null;
  }
}

/**
 * GCS에 JSON 파일 쓰기
 */
export async function writeGcsJson(path: string, data: unknown): Promise<void> {
  const file = getStorage().bucket(GCS_BUCKET).file(`${AGENT_OPS_PREFIX}/${path}`);
  await file.save(JSON.stringify(data, null, 2), {
    contentType: "application/json",
    resumable: false,
  });
}

/**
 * GCS에서 JSONL 파일 읽기 (최근 N줄)
 */
export async function readGcsJsonl<T>(path: string, maxLines: number): Promise<T[]> {
  try {
    const file = getStorage().bucket(GCS_BUCKET).file(`${AGENT_OPS_PREFIX}/${path}`);
    const [content] = await file.download();
    const lines = content.toString("utf-8").trim().split("\n").filter(Boolean);
    const recent = lines.slice(-maxLines);
    return recent
      .map((line) => {
        try { return JSON.parse(line) as T; } catch { return null; }
      })
      .filter((item): item is T => item !== null);
  } catch {
    return [];
  }
}

/**
 * GCS JSONL 파일에 1줄 append
 */
export async function appendGcsJsonl(path: string, entry: unknown): Promise<void> {
  const filePath = `${AGENT_OPS_PREFIX}/${path}`;
  const file = getStorage().bucket(GCS_BUCKET).file(filePath);

  let existing = "";
  try {
    const [content] = await file.download();
    existing = content.toString("utf-8");
    if (existing && !existing.endsWith("\n")) existing += "\n";
  } catch {
    // 파일 없으면 빈 문자열
  }

  existing += JSON.stringify(entry) + "\n";
  await file.save(existing, {
    contentType: "application/x-ndjson",
    resumable: false,
  });
}
