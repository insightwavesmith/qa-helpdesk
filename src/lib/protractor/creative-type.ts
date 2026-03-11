/**
 * creative-type.ts — 소재 유형 분류 공용 모듈
 * collect-daily, collect-benchmarks 양쪽에서 import하여 사용
 */

/**
 * Meta 광고 creative 필드 기반 소재 유형 분류
 * - 최우선: object_type SHARE → VIDEO (카탈로그+수동업로드 영상)
 * - 1순위: video_id 또는 asset_feed_spec.videos → VIDEO
 * - 2순위: image_hash(+no product_set) → IMAGE
 * - 3순위: product_set_id → CATALOG
 * - fallback: object_type 기반
 */
export function getCreativeType(ad: Record<string, unknown>): string {
  const creative = ad.creative as
    | {
        object_type?: string;
        product_set_id?: string;
        video_id?: string;
        image_hash?: string;
        asset_feed_spec?: {
          videos?: { video_id?: string }[];
        };
      }
    | undefined;

  const videoId = creative?.video_id;
  const imageHash = creative?.image_hash;
  const productSetId = creative?.product_set_id;
  const objectType = creative?.object_type ?? "UNKNOWN";
  const afsVideos = creative?.asset_feed_spec?.videos;

  // 최우선: object_type SHARE → VIDEO (카탈로그+수동업로드 영상)
  if (objectType === "SHARE") return "VIDEO";

  // 1순위: video_id 존재 → VIDEO (직접 업로드 영상)
  if (videoId) return "VIDEO";
  // 1-b: asset_feed_spec.videos 존재 → VIDEO (Advantage+ 크리에이티브 영상)
  if (afsVideos && afsVideos.length > 0) return "VIDEO";
  // 2순위: image_hash 존재 + product_set_id 없음 → IMAGE
  if (imageHash && !productSetId) return "IMAGE";
  // 3순위: product_set_id 존재 → CATALOG
  if (productSetId) return "CATALOG";

  // fallback: object_type 기반
  if (objectType === "VIDEO" || objectType === "PRIVACY_CHECK_FAIL") return "VIDEO";
  return "IMAGE";
}
