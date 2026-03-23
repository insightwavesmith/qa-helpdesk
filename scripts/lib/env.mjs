/**
 * .env.local 공용 파서 (B11 수정)
 *
 * 기존 수동 정규식 파싱의 문제:
 *   - `export KEY=value` → key가 "export KEY"로 잘못 파싱
 *   - `KEY=value # comment` → 인라인 주석이 값에 포함
 *   - `KEY=val=ue` → 첫 번째 = 이후만 값이어야 하는데 정규식에 따라 동작 불안정
 *
 * 이 모듈은 dotenv 호환 파싱을 제공한다.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");

/**
 * .env.local 파일을 파싱하여 key-value 객체 반환
 * Cloud Run 등 .env.local이 없는 환경에서는 process.env 사용
 * @param {string} [envFileName] - 환경 파일명 (기본: ".env.local")
 * @returns {Record<string, string>}
 */
export function loadEnv(envFileName = ".env.local") {
  const envPath = resolve(PROJECT_ROOT, envFileName);

  // Cloud Run: .env.local 없으면 process.env 사용
  if (!existsSync(envPath)) {
    return { ...process.env };
  }

  const envContent = readFileSync(envPath, "utf-8");
  const env = {};

  for (const rawLine of envContent.split("\n")) {
    const line = rawLine.trim();

    // 빈 줄, 주석 무시
    if (!line || line.startsWith("#")) continue;

    // export 접두어 제거
    const cleaned = line.startsWith("export ") ? line.slice(7) : line;

    // 첫 번째 = 기준 분리
    const eqIdx = cleaned.indexOf("=");
    if (eqIdx === -1) continue;

    const key = cleaned.slice(0, eqIdx).trim();
    let value = cleaned.slice(eqIdx + 1).trim();

    // 따옴표로 감싼 값 처리
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      // 따옴표 없으면 인라인 주석 제거 (# 앞 공백 기준)
      const commentIdx = value.indexOf(" #");
      if (commentIdx !== -1) {
        value = value.slice(0, commentIdx).trim();
      }
    }

    env[key] = value;
  }

  return env;
}

/**
 * Supabase 접속 정보 반환 (SB_URL, SB_KEY, env 전체)
 * 필수 키가 없으면 에러 출력 후 프로세스 종료
 */
export function getSupabaseConfig() {
  const env = loadEnv();
  const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SB_URL || !SB_KEY) {
    console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)");
    process.exit(1);
  }

  return { SB_URL, SB_KEY, env };
}
