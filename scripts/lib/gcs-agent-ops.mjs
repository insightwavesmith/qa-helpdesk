/**
 * GCS Agent Ops 헬퍼 (스크립트용 ESM)
 *
 * gs://bscamp-storage/agent-ops/ 하위 JSON/JSONL 읽기/쓰기
 * ADC(Application Default Credentials) 기반 인증
 */

import { Storage } from "@google-cloud/storage";

const GCS_BUCKET = "bscamp-storage";
const PREFIX = "agent-ops";

let storage = null;
function getStorage() {
  if (!storage) storage = new Storage();
  return storage;
}

function file(path) {
  return getStorage().bucket(GCS_BUCKET).file(`${PREFIX}/${path}`);
}

/**
 * GCS에서 JSON 읽기
 * @param {string} path - agent-ops/ 이후 경로
 * @returns {Promise<object|null>}
 */
export async function readJson(path) {
  try {
    const [content] = await file(path).download();
    return JSON.parse(content.toString("utf-8"));
  } catch {
    return null;
  }
}

/**
 * GCS에 JSON 쓰기
 * @param {string} path
 * @param {object} data
 */
export async function writeJson(path, data) {
  await file(path).save(JSON.stringify(data, null, 2), {
    contentType: "application/json",
    resumable: false,
  });
}

/**
 * GCS JSONL에 1줄 append
 * @param {string} path
 * @param {object} entry
 */
export async function appendJsonl(path, entry) {
  const f = file(path);
  let existing = "";
  try {
    const [content] = await f.download();
    existing = content.toString("utf-8");
    if (existing && !existing.endsWith("\n")) existing += "\n";
  } catch {
    // 파일 없음
  }
  existing += JSON.stringify(entry) + "\n";
  await f.save(existing, {
    contentType: "application/x-ndjson",
    resumable: false,
  });
}
