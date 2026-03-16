/**
 * T2: Meta Graph API에서 소재 이미지 URL + 카피 + LP URL 수집
 * image_hash → adimages API, 또는 ad creative 엔드포인트에서 직접 조회
 */

const META_API_BASE = "https://graph.facebook.com/v21.0";

interface CreativeDetail {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  adCopy: string | null;
  lpUrl: string | null;
  imageHash: string | null;
}

/**
 * Meta Graph API 재시도 래퍼
 */
async function fetchMetaWithRetry(
  url: string,
  maxRetries = 2,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : (attempt + 1) * 3000;
        console.log(`[creative-fetcher] 429 Rate limited, retry ${attempt + 1} after ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!response.ok && attempt < maxRetries) {
        const waitMs = (attempt + 1) * 3000;
        console.log(`[creative-fetcher] API error ${response.status}, retry ${attempt + 1} after ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      return response;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) {
        const waitMs = (attempt + 1) * 3000;
        console.log(`[creative-fetcher] Network error, retry ${attempt + 1} after ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

/**
 * image_hash 배열 → 이미지 URL 맵 반환
 * Meta Graph API: GET /{account_id}/adimages?hashes={hashes}&fields=url_128,url,hash
 */
export async function fetchImageUrlsByHash(
  accountId: string,
  imageHashes: string[],
): Promise<Map<string, string>> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not set");

  const cleanId = accountId.replace(/^act_/, "");
  const result = new Map<string, string>();

  if (imageHashes.length === 0) return result;

  // 배치: 한 번에 50개씩
  const BATCH_SIZE = 50;
  for (let i = 0; i < imageHashes.length; i += BATCH_SIZE) {
    const batch = imageHashes.slice(i, i + BATCH_SIZE);
    const url = new URL(`${META_API_BASE}/act_${cleanId}/adimages`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("hashes", JSON.stringify(batch));
    url.searchParams.set("fields", "url_128,url,hash");

    try {
      const res = await fetchMetaWithRetry(url.toString());
      const data = await res.json();

      if (data.error) {
        console.error(`[creative-fetcher] adimages API error:`, data.error.message);
        continue;
      }

      // 응답: { data: [{ hash, url, url_128 }] } 또는 { images: { hash: { url, ... } } }
      if (data.data && Array.isArray(data.data)) {
        for (const img of data.data) {
          if (img.hash && (img.url || img.url_128)) {
            result.set(img.hash, img.url || img.url_128);
          }
        }
      } else if (data.images) {
        // 대체 응답 형식: { images: { "hash1": { url, ... }, "hash2": { ... } } }
        for (const [hash, imgData] of Object.entries(data.images)) {
          const img = imgData as Record<string, string>;
          if (img.url || img.url_128) {
            result.set(hash, img.url || img.url_128);
          }
        }
      }
    } catch (e) {
      console.error(`[creative-fetcher] Batch ${i}~${i + batch.length} failed:`, e);
    }

    // Rate limit 대기
    if (i + BATCH_SIZE < imageHashes.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return result;
}

/**
 * 광고 ID 배열에서 크리에이티브 상세 정보 조회
 * GET /{ad_id}?fields=creative{image_url,thumbnail_url,object_story_spec,effective_object_story_spec}
 */
export async function fetchCreativeDetails(
  adIds: string[],
): Promise<Map<string, CreativeDetail>> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not set");

  const result = new Map<string, CreativeDetail>();

  // 배치로 처리 (Batch API 사용)
  const BATCH_SIZE = 50;
  for (let i = 0; i < adIds.length; i += BATCH_SIZE) {
    const batch = adIds.slice(i, i + BATCH_SIZE);

    // 각 광고를 개별 요청으로 (Batch API는 복잡하므로 개별 호출 + 딜레이)
    for (const adId of batch) {
      try {
        const fields = [
          "creative{image_url,thumbnail_url,image_hash,object_story_spec,effective_object_story_spec}",
        ].join(",");

        const url = new URL(`${META_API_BASE}/${adId}`);
        url.searchParams.set("access_token", token);
        url.searchParams.set("fields", fields);

        const res = await fetchMetaWithRetry(url.toString());
        const data = await res.json();

        if (data.error) {
          console.error(`[creative-fetcher] ad ${adId} error:`, data.error.message);
          continue;
        }

        const creative = data.creative || {};
        const storySpec = creative.effective_object_story_spec || creative.object_story_spec || {};
        const linkData = storySpec.link_data || {};
        const videoData = storySpec.video_data || {};

        const detail: CreativeDetail = {
          imageUrl: creative.image_url || creative.thumbnail_url || null,
          thumbnailUrl: creative.thumbnail_url || null,
          adCopy: linkData.message || videoData.message || linkData.name || null,
          lpUrl: linkData.link || linkData.call_to_action?.value?.link || null,
          imageHash: creative.image_hash || null,
        };

        result.set(adId, detail);
      } catch (e) {
        console.error(`[creative-fetcher] ad ${adId} fetch failed:`, e);
      }

      // 개별 호출 간 딜레이
      await new Promise((r) => setTimeout(r, 100));
    }

    // 배치 간 딜레이
    if (i + BATCH_SIZE < adIds.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return result;
}

/**
 * 광고 데이터(fetchAccountAds 결과)에서 image_hash 목록 추출
 */
export function extractImageHashes(
  ads: Record<string, unknown>[],
): string[] {
  const hashes: string[] = [];
  for (const ad of ads) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creative = (ad as any).creative;
    if (creative?.image_hash) {
      hashes.push(creative.image_hash);
    }
  }
  return [...new Set(hashes)];
}
