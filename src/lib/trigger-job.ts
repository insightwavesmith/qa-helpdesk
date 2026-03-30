/**
 * Cloud Run Job 트리거 유틸리티
 * 메타데이터 서버에서 토큰을 획득하여 Cloud Run Jobs API를 호출
 * 로컬 환경(메타데이터 서버 없음)에서는 무시
 */

const PROJECT_ID = process.env.GCP_PROJECT_ID || "modified-shape-477110-h8";
const REGION = "asia-northeast3";

export async function triggerEmbedJob(): Promise<void> {
  const JOB_NAME = "embed-creatives-job";
  const url = `https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run`;

  try {
    // Cloud Run 인스턴스의 메타데이터 서버에서 토큰 획득
    const tokenRes = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-account/default/token",
      { headers: { "Metadata-Flavor": "Google" } },
    );
    const { access_token } = await tokenRes.json();

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!res.ok) {
      console.warn(`[trigger-job] embed-creatives-job 트리거 실패: ${res.status}`);
    } else {
      console.log("[trigger-job] embed-creatives-job 트리거 성공");
    }
  } catch (err) {
    // 로컬 개발 등 메타데이터 서버 없는 환경에서는 무시
    console.warn("[trigger-job] Job 트리거 스킵 (메타데이터 서버 없음):", err);
  }
}
