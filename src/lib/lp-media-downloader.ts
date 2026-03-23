/**
 * LP 미디어 다운로더
 * LP HTML에서 img/video/gif/css background-image URL을 추출하고
 * 각 미디어를 다운로드하여 Supabase Storage(creatives 버킷)에 저장하는 유틸리티.
 * ADR-001 Storage 경로 규칙: lp/{account_id}/{lp_id}/media/{hash}.{ext}
 */

import { createHash } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

export interface MediaUrl {
  url: string;
  extracted_from: "img" | "video" | "source" | "css-bg";
}

export interface MediaAsset {
  original_url: string;
  storage_path: string;
  type: "image" | "gif" | "video";
  mime_type: string;
  size_bytes: number;
  hash: string;
  extracted_from: "img" | "video" | "source" | "css-bg";
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────

/** 허용 확장자 목록 */
const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "svg", "gif", "mp4", "webm",
]);

/** 제외 패턴: 트래커, favicon, 1x1 픽셀 등 */
const EXCLUDE_PATTERNS = [
  /facebook\.com/i,
  /google-analytics/i,
  /doubleclick/i,
  /fbcdn.*\.tr/i,
  /\.ico(\?|$)/i,
  /tracking/i,
  // 1x1 픽셀 (쿼리스트링 포함 대응)
  /[?&]w=1[&$]/i,
  /[?&]h=1[&$]/i,
  /1x1\.(gif|png|jpg)/i,
  /pixel\.(gif|png)/i,
];

/** MIME → 확장자 매핑 */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** 개별 파일 크기 상한 (50MB) */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** LP당 총 다운로드 상한 (200MB) */
const MAX_TOTAL_SIZE = 200 * 1024 * 1024;

/** 다운로드 타임아웃 (15초) */
const DOWNLOAD_TIMEOUT_MS = 15_000;

/** 모바일 Safari User-Agent */
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

// ─────────────────────────────────────────────────────────────────────────────
// 1. extractMediaUrls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HTML 문자열에서 미디어 URL을 추출한다.
 * - <img src>, <img data-src> (lazy load)
 * - <video src>, <video poster>
 * - <source src>
 * - style="background-image: url(...)"
 * - URL을 baseUrl 기준 절대경로로 변환
 * - 트래커/favicon/1x1 픽셀 제외
 * - 허용 확장자 필터 (확장자 없는 URL은 통과시킴, Content-Type으로 이후 판별)
 * - 중복 제거
 */
export function extractMediaUrls(html: string, baseUrl: string): MediaUrl[] {
  const seen = new Set<string>();
  const results: MediaUrl[] = [];

  /** URL 후보를 절대경로로 변환 후 유효성 검사 → 결과 배열에 추가 */
  function addUrl(raw: string | undefined | null, extractedFrom: MediaUrl["extracted_from"]) {
    if (!raw || raw.trim() === "") return;

    // data: URI 제외
    if (raw.trim().startsWith("data:")) return;

    // 절대경로 변환
    let absolute: string;
    try {
      absolute = new URL(raw.trim(), baseUrl).toString();
    } catch {
      return; // 파싱 불가 → 스킵
    }

    // 중복 제거
    if (seen.has(absolute)) return;

    // 제외 패턴 체크
    if (EXCLUDE_PATTERNS.some((p) => p.test(absolute))) return;

    // 확장자 필터: 확장자가 있는 경우만 검사 (없으면 통과)
    const urlPath = absolute.split("?")[0].split("#")[0];
    const dotIdx = urlPath.lastIndexOf(".");
    if (dotIdx !== -1) {
      const ext = urlPath.slice(dotIdx + 1).toLowerCase();
      // 확장자가 있는데 허용 목록에 없으면 스킵
      if (ext.length > 0 && ext.length <= 5 && !ALLOWED_EXTENSIONS.has(ext)) return;
    }

    seen.add(absolute);
    results.push({ url: absolute, extracted_from: extractedFrom });
  }

  // ── <img src="..."> / <img data-src="...">
  // src 속성
  for (const match of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*/gi)) {
    addUrl(match[1], "img");
  }
  // data-src 속성 (lazy load)
  for (const match of html.matchAll(/<img\b[^>]*\bdata-src=["']([^"']+)["'][^>]*/gi)) {
    addUrl(match[1], "img");
  }

  // ── <video src="..."> / <video poster="...">
  for (const match of html.matchAll(/<video\b[^>]*\bsrc=["']([^"']+)["'][^>]*/gi)) {
    addUrl(match[1], "video");
  }
  for (const match of html.matchAll(/<video\b[^>]*\bposter=["']([^"']+)["'][^>]*/gi)) {
    addUrl(match[1], "img");
  }

  // ── <source src="..."> (video/picture 내부)
  for (const match of html.matchAll(/<source\b[^>]*\bsrc=["']([^"']+)["'][^>]*/gi)) {
    addUrl(match[1], "source");
  }

  // ── style="background-image: url(...)"
  // 인라인 스타일에서 url() 추출 (따옴표 있음/없음 모두 대응)
  for (const match of html.matchAll(/background-image\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    addUrl(match[1], "css-bg");
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. downloadLpMedia
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LP HTML에서 미디어를 추출하고 Supabase Storage에 업로드한다.
 * - extractMediaUrls()로 URL 목록 추출
 * - existingAssets의 hash와 비교하여 중복 스킵
 * - 개별 파일 50MB, LP당 총 200MB 제한
 * - 에러 발생 시 해당 파일만 스킵 (전체 중단 안 함)
 */
export async function downloadLpMedia(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  lp: { id: string; account_id: string; canonical_url: string },
  html: string,
  existingAssets: Array<{ hash: string }>,
): Promise<MediaAsset[]> {
  const mediaUrls = extractMediaUrls(html, lp.canonical_url);

  if (mediaUrls.length === 0) {
    console.log(`[lp-media] ${lp.id} 추출된 미디어 URL 없음`);
    return [];
  }

  // 기존 hash Set 구성 (중복 스킵용)
  const existingHashes = new Set(existingAssets.map((a) => a.hash));

  const assets: MediaAsset[] = [];
  let totalBytes = 0;

  for (const mediaUrl of mediaUrls) {
    // LP당 총 크기 제한 초과 시 중단
    if (totalBytes >= MAX_TOTAL_SIZE) {
      console.log(
        `[lp-media] ${lp.id} 총 다운로드 한도 초과 (${(totalBytes / 1024 / 1024).toFixed(1)}MB), 이후 파일 스킵`,
      );
      break;
    }

    try {
      // 다운로드
      const downloaded = await fetchMediaFile(mediaUrl.url);
      if (!downloaded) continue;

      const { buffer, mimeType, sizeBytes } = downloaded;

      // 개별 파일 크기 제한
      if (sizeBytes > MAX_FILE_SIZE) {
        console.log(
          `[lp-media] ${lp.id} 파일 크기 초과 (${(sizeBytes / 1024 / 1024).toFixed(1)}MB): ${mediaUrl.url}`,
        );
        continue;
      }

      // SHA-256 hash 계산
      const hash = createHash("sha256").update(buffer).digest("hex");

      // 이미 존재하면 스킵
      if (existingHashes.has(hash)) {
        console.log(`[lp-media] ${lp.id} 중복 스킵 (hash=${hash.slice(0, 8)}...): ${mediaUrl.url}`);
        continue;
      }

      // 확장자 결정
      const ext = resolveExtension(mimeType, mediaUrl.url);
      if (!ext) {
        console.log(`[lp-media] ${lp.id} 지원하지 않는 MIME (${mimeType}): ${mediaUrl.url}`);
        continue;
      }

      // Storage 경로: ADR-001 규칙
      const storagePath = `lp/${lp.account_id}/${lp.id}/media/${hash}.${ext}`;

      console.log(`[lp-media] ${lp.id} 다운로드: ${mediaUrl.url} → ${storagePath}`);

      // Storage 업로드
      const uploadOk = await uploadBufferToStorage(supabase, storagePath, buffer, mimeType);
      if (!uploadOk) continue;

      totalBytes += sizeBytes;
      existingHashes.add(hash); // 이번 배치 내 중복 방지

      assets.push({
        original_url: mediaUrl.url,
        storage_path: storagePath,
        type: resolveAssetType(mimeType),
        mime_type: mimeType,
        size_bytes: sizeBytes,
        hash,
        extracted_from: mediaUrl.extracted_from,
      });
    } catch (err) {
      // 개별 파일 에러 → 스킵, 전체 중단 안 함
      console.warn(`[lp-media] ${lp.id} 파일 처리 실패 (${mediaUrl.url}):`, err);
    }
  }

  console.log(
    `[lp-media] ${lp.id} 완료: ${assets.length}개 저장, 총 ${(totalBytes / 1024 / 1024).toFixed(1)}MB`,
  );

  return assets;
}

// ─────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 함수
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 단일 미디어 파일을 fetch로 다운로드한다.
 * 타임아웃 15초, HTTP 에러 시 null 반환.
 */
async function fetchMediaFile(url: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
} | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "image/*,video/*,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[lp-media] HTTP ${res.status} for ${url}`);
      return null;
    }

    const mimeType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sizeBytes = buffer.byteLength;

    return { buffer, mimeType, sizeBytes };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(`[lp-media] 타임아웃 (15s): ${url}`);
    } else {
      console.warn(`[lp-media] fetch 실패 (${url}):`, err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Buffer를 Supabase Storage(creatives 버킷)에 업로드한다.
 * upsert: true (같은 경로면 덮어씀)
 */
async function uploadBufferToStorage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from("creatives")
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      console.error(`[lp-media] Storage 업로드 실패 (${path}):`, error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[lp-media] Storage 업로드 에러 (${path}):`, err);
    return false;
  }
}

/**
 * MIME 타입 및 URL 확장자로부터 저장할 파일 확장자를 결정한다.
 * MIME 우선, 없으면 URL 경로에서 추출.
 * 허용 목록에 없으면 null 반환.
 */
function resolveExtension(mimeType: string, url: string): string | null {
  // MIME에서 먼저 결정
  if (mimeType && MIME_TO_EXT[mimeType]) {
    return MIME_TO_EXT[mimeType];
  }

  // URL 경로에서 확장자 추출
  const urlPath = url.split("?")[0].split("#")[0];
  const dotIdx = urlPath.lastIndexOf(".");
  if (dotIdx !== -1) {
    const ext = urlPath.slice(dotIdx + 1).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      return ext;
    }
  }

  return null;
}

/**
 * MIME 타입으로 MediaAsset type을 결정한다.
 * gif → "gif", video/* → "video", 나머지 → "image"
 */
function resolveAssetType(mimeType: string): MediaAsset["type"] {
  if (mimeType === "image/gif") return "gif";
  if (mimeType.startsWith("video/")) return "video";
  return "image";
}
