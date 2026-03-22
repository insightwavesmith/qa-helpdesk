/**
 * 경쟁사 소재 이미지 → Supabase Storage 업로드
 * 경로 패턴: competitor/{page_id}/media/{ad_archive_id}.{ext} (ADR-001)
 *
 * best-effort: 실패해도 상위 흐름을 중단하지 않음
 */

import { createServiceClient } from "@/lib/supabase/server";

/**
 * 경쟁사 소재 이미지를 Storage에 업로드
 * @param imageUrl - 원본 이미지 URL (Meta Ad Library CDN 등)
 * @param pageId - 경쟁사 페이지 ID (폴더 분리용)
 * @param adArchiveId - 광고 아카이브 ID (파일명)
 * @returns 업로드된 Storage 경로 또는 null
 */
export async function uploadCompetitorMedia(
  imageUrl: string,
  pageId: string,
  adArchiveId: string,
): Promise<string | null> {
  // 이미지 다운로드
  let imgRes: Response;
  try {
    imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  } catch {
    console.warn(
      `[competitor-storage] 이미지 다운로드 타임아웃: ${adArchiveId}`,
    );
    return null;
  }

  if (!imgRes.ok) {
    console.warn(
      `[competitor-storage] 이미지 다운로드 실패: ${imgRes.status} (${adArchiveId})`,
    );
    return null;
  }

  const ct = imgRes.headers.get("content-type") || "image/jpeg";
  const ext = ct.includes("png") ? "png" : "jpg";
  const buffer = Buffer.from(await imgRes.arrayBuffer());

  // Storage 경로: competitor/{page_id}/media/{ad_archive_id}.{ext}
  const storagePath = `competitor/${pageId}/media/${adArchiveId}.${ext}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { error: uploadErr } = await svc.storage
    .from("creatives")
    .upload(storagePath, buffer, {
      contentType: ct.startsWith("image/") ? ct.split(";")[0] : "image/jpeg",
      upsert: true,
    });

  if (uploadErr) {
    console.warn(
      `[competitor-storage] 업로드 실패: ${storagePath}`,
      uploadErr.message,
    );
    return null;
  }

  return storagePath;
}
