#!/usr/bin/env node
/**
 * L2 시선 예측 배치 트리거 — Railway /saliency 엔드포인트 호출
 *
 * Usage: node scripts/trigger-saliency-batch.mjs [--limit N] [--account-id xxx] [--wait-deploy] [--repeat]
 *
 * --limit N          : 최대 N건 처리 (기본: 9999)
 * --account-id xxx   : 특정 광고 계정만
 * --wait-deploy      : Railway 배포 완료 대기 후 실행
 * --repeat           : 타임아웃/에러 시 자동 재실행 (analyzed=0이 될 때까지 반복)
 */

const PIPELINE_URL = process.env.CREATIVE_PIPELINE_URL || "https://creative-pipeline-906295665279.asia-northeast3.run.app";
const API_SECRET = process.env.CREATIVE_PIPELINE_SECRET || "creative-pipeline-2026";

const args = process.argv.slice(2);
const limit = parseInt(args.find((_, i, a) => a[i - 1] === "--limit") || "9999");
const accountId = args.find((_, i, a) => a[i - 1] === "--account-id") || null;
const waitDeploy = args.includes("--wait-deploy");
const repeat = args.includes("--repeat");

async function checkHealth() {
  try {
    const res = await fetch(`${PIPELINE_URL}/health`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function waitForNewDeploy(oldVersion, maxWaitMs = 600000) {
  console.log(`⏳ Railway 배포 대기 중... (현재: ${oldVersion})`);
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 15000));
    const health = await checkHealth();
    if (health && health.version !== oldVersion) {
      console.log(`✅ 새 배포 감지: ${health.version} (${Math.round((Date.now() - start) / 1000)}초)`);
      return health;
    }
    process.stdout.write(".");
  }
  throw new Error(`배포 타임아웃 (${maxWaitMs / 1000}초)`);
}

async function triggerSaliency() {
  console.log(`\n🔬 L2 시선 예측 배치 시작 — limit: ${limit}, account: ${accountId || "전체"}`);
  console.log(`📡 ${PIPELINE_URL}/saliency`);
  console.log(`⏰ ${new Date().toLocaleTimeString("ko-KR")}`);

  const res = await fetch(`${PIPELINE_URL}/saliency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": API_SECRET,
    },
    body: JSON.stringify({ limit, accountId }),
    signal: AbortSignal.timeout(1800000), // 30분
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return await res.json();
}

async function main() {
  // 1. 헬스 체크
  const health = await checkHealth();
  if (!health) {
    console.error("❌ Railway 서비스 응답 없음");
    process.exit(1);
  }
  console.log(`✅ Railway 정상 — version: ${health.version}`);

  // 2. 배포 대기 (--wait-deploy 옵션)
  if (waitDeploy) {
    await waitForNewDeploy(health.version);
  }

  // 3. 배치 실행 (--repeat 시 반복)
  let totalAnalyzed = 0;
  let totalErrors = 0;
  let round = 0;

  do {
    round++;
    const t0 = Date.now();

    try {
      const result = await triggerSaliency();
      const elapsed = Math.round((Date.now() - t0) / 1000);

      console.log(`\n━━━ Round ${round} 결과 ━━━`);
      console.log(`분석 완료: ${result.analyzed}건`);
      console.log(`스킵(기존): ${result.skipped}건`);
      console.log(`에러: ${result.errors}건`);
      console.log(`소요 시간: ${elapsed}초`);

      totalAnalyzed += result.analyzed || 0;
      totalErrors += result.errors || 0;

      // 더 이상 분석할 게 없으면 종료
      if ((result.analyzed || 0) === 0 && (result.errors || 0) === 0) {
        console.log("\n✅ 모든 소재 분석 완료!");
        break;
      }
    } catch (e) {
      console.error(`\n⚠️ Round ${round} 에러: ${e.message.slice(0, 200)}`);
      // 서버 타임아웃이나 500 에러는 재시도 (이미 처리된 건은 DB에 저장됨)
      if (!repeat) {
        process.exit(1);
      }
      console.log("10초 후 재시도...");
      await new Promise((r) => setTimeout(r, 10000));
    }
  } while (repeat);

  console.log(`\n━━━ 최종 합계 ━━━`);
  console.log(`총 분석: ${totalAnalyzed}건`);
  console.log(`총 에러: ${totalErrors}건`);
  console.log(`라운드: ${round}회`);
}

main().catch((e) => {
  console.error("❌ 에러:", e.message);
  process.exit(1);
});
