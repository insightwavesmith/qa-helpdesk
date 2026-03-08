#!/usr/bin/env node
// stdout EPIPE 무시
process.stdout.on("error", (e) => { if (e.code !== "EPIPE") throw e; });
process.stderr.on("error", (e) => { if (e.code !== "EPIPE") throw e; });

/**
 * agent-sdk-chain.js — 체인 모드: TASK 파일 순차 실행 + 자동 커밋
 *
 * 사용법:
 *   node agent-sdk-chain.js TASK-v2-T3.md TASK-v2-T4.md TASK-v2-T5.md
 *
 * 각 TASK:
 *   1. dev 모드로 SDK 실행
 *   2. 빌드 검증 (tsc + lint + build)
 *   3. 자동 git add + commit + push
 *   4. 다음 TASK로 이동
 *   5. 실패 시 체인 중단 + 알림
 *   6. 전부 완료 시 최종 알림
 */
const { query } = require("@anthropic-ai/claude-agent-sdk");
const fs = require("fs");
const { execSync } = require("child_process");

const PROJECT = "/Users/smith/projects/qa-helpdesk";
const SETTINGS = `${PROJECT}/.claude/settings.json`;
const SETTINGS_ORIG = `${SETTINGS}.orig`;
const SETTINGS_LOCAL = `${PROJECT}/.claude/settings.local.json`;
const SETTINGS_LOCAL_ORIG = `${SETTINGS_LOCAL}.orig`;
const LOG_FILE = "/tmp/agent-sdk-chain.log";
const RESULT_FILE = "/tmp/agent-sdk-result.json";

const taskFiles = process.argv.slice(2);
if (taskFiles.length === 0) {
  console.error("사용법: node agent-sdk-chain.js TASK-1.md TASK-2.md ...");
  process.exit(1);
}

// 로깅
function log(msg) {
  const line = `[${new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })}] [chain] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  try { process.stdout.write(line); } catch (_) {}
}

// settings 복구
function restoreSettings() {
  try {
    if (fs.existsSync(SETTINGS_ORIG)) {
      fs.copyFileSync(SETTINGS_ORIG, SETTINGS);
      fs.unlinkSync(SETTINGS_ORIG);
    }
  } catch (e) { log("settings.json 복구 실패: " + e.message); }
  try {
    if (fs.existsSync(SETTINGS_LOCAL_ORIG)) {
      fs.copyFileSync(SETTINGS_LOCAL_ORIG, SETTINGS_LOCAL);
      fs.unlinkSync(SETTINGS_LOCAL_ORIG);
    }
  } catch (e) { log("settings.local.json 복구 실패: " + e.message); }
}

// signal handlers
process.on("uncaughtException", (e) => { log("[FATAL] " + e.message); restoreSettings(); process.exit(1); });
process.on("unhandledRejection", (r) => { log("[FATAL] " + String(r)); restoreSettings(); process.exit(1); });
process.on("SIGTERM", () => { log("SIGTERM"); restoreSettings(); process.exit(0); });
process.on("SIGINT", () => { log("SIGINT"); restoreSettings(); process.exit(0); });

// Slack DM
async function sendSlackDM(text) {
  const targets = [];
  try {
    const raw = fs.readFileSync("/Users/smith/.openclaw/openclaw.json", "utf8");
    const config = JSON.parse(raw);
    const devLeadToken = config.channels?.slack?.accounts?.["dev-lead"]?.botToken;
    const mozziToken = config.channels?.slack?.accounts?.mozzi?.botToken;
    if (devLeadToken) targets.push({ token: devLeadToken, channel: "D0ADQEF21T4", label: "dev-lead" });
    if (mozziToken) targets.push({ token: mozziToken, channel: "D09V1NX98SK", label: "mozzi" });
  } catch (_) {}
  if (targets.length === 0) return;
  await Promise.all(targets.map(t => sendSlackMsg(t.token, t.channel, text, t.label)));
}

async function sendSlackMsg(token, channel, text, label) {
  return new Promise((resolve) => {
    try {
      const https = require("https");
      const postData = JSON.stringify({ channel, text });
      const req = https.request({
        hostname: "slack.com", path: "/api/chat.postMessage", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postData), "Authorization": "Bearer " + token }
      }, (res) => { let b = ""; res.on("data", c => b += c); res.on("end", () => { log(`Slack DM (${label})`); resolve(); }); });
      req.on("error", () => resolve());
      req.write(postData); req.end();
    } catch (_) { resolve(); }
  });
}

// 빌드 검증
function validate() {
  const checks = [
    { name: "tsc", cmd: "npx tsc --noEmit --quiet" },
    { name: "lint", cmd: "npx next lint --quiet" },
    { name: "build", cmd: "npm run build" },
  ];
  for (const check of checks) {
    try {
      execSync(check.cmd, { cwd: PROJECT, stdio: "pipe", timeout: 120_000 });
      log(`✅ ${check.name} PASS`);
    } catch (e) {
      const stderr = (e.stderr || "").toString().slice(0, 300);
      log(`❌ ${check.name} FAIL: ${stderr.replace(/\n/g, " ")}`);
      return false;
    }
  }
  return true;
}

// 자동 커밋 + 푸시
function commitAndPush(taskFile) {
  try {
    execSync("git add -A", { cwd: PROJECT, stdio: "pipe" });
    const taskName = taskFile.replace(/^TASK-/, "").replace(/\.md$/, "");
    execSync(`git commit -m "feat: ${taskName} (체인 자동 커밋)"`, { cwd: PROJECT, stdio: "pipe" });
    execSync("git push origin main", { cwd: PROJECT, stdio: "pipe", timeout: 30_000 });
    const hash = execSync("git log --oneline -1", { cwd: PROJECT, encoding: "utf8" }).trim();
    log(`📦 커밋+푸시: ${hash}`);
    return hash;
  } catch (e) {
    log(`커밋/푸시 실패: ${e.message}`);
    return null;
  }
}

// SDK 실행 (1개 TASK)
async function runTask(taskFile, index, total) {
  const taskContent = fs.readFileSync(`${PROJECT}/${taskFile}`, "utf8").substring(0, 500);
  const taskTitle = taskContent.split("\n").find(l => l.startsWith("# ")) || taskFile;

  log(`\n${"=".repeat(60)}`);
  log(`🔗 체인 ${index + 1}/${total}: ${taskFile}`);
  log(`${"=".repeat(60)}`);

  await sendSlackDM(`🔗 체인 ${index + 1}/${total} 시작: ${taskFile}`);

  // settings 준비
  if (!fs.existsSync(SETTINGS_ORIG)) {
    fs.copyFileSync(SETTINGS, SETTINGS_ORIG);
  }
  if (fs.existsSync(SETTINGS_LOCAL) && !fs.existsSync(SETTINGS_LOCAL_ORIG)) {
    fs.copyFileSync(SETTINGS_LOCAL, SETTINGS_LOCAL_ORIG);
  }

  fs.writeFileSync(SETTINGS, JSON.stringify({
    env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
    agentTeamDisplay: "tmux"
  }));

  // Stop hooks만 제거
  try {
    const localRaw = fs.existsSync(SETTINGS_LOCAL_ORIG)
      ? fs.readFileSync(SETTINGS_LOCAL_ORIG, "utf8")
      : fs.readFileSync(SETTINGS_LOCAL, "utf8");
    const localConfig = JSON.parse(localRaw);
    if (localConfig.hooks) delete localConfig.hooks.Stop;
    fs.writeFileSync(SETTINGS_LOCAL, JSON.stringify(localConfig, null, 2));
  } catch (_) {
    fs.writeFileSync(SETTINGS_LOCAL, "{}");
  }

  // stage 마커 초기화
  for (const stage of ["REVIEW_DONE", "DEV_DONE", "QA_DONE", "BUILD_PASS"]) {
    try { fs.unlinkSync(`/tmp/agent-stage-${stage}`); } catch {}
  }

  const prompt = `CLAUDE.md를 먼저 읽고 규칙을 따라. docs/ PDCA 아키텍처 문서도 확인.\n\n【중요】 이전 TASK(${index > 0 ? taskFiles.slice(0, index).join(", ") : "없음"})가 이미 완료되었다. git log --oneline -5로 직전 작업을 확인해.\n\n${taskFile}를 읽고 dev 수행. Plan 기반으로 구현해. 커밋은 하지 마 (체인이 자동 커밋한다).`;

  const start = Date.now();
  let turns = 0, lastText = "", toolUses = 0, status = "unknown";

  try {
    for await (const msg of query({
      prompt,
      options: {
        cwd: PROJECT,
        pathToClaudeCodeExecutable: "/opt/homebrew/bin/claude",
        permissionMode: "bypassPermissions",
        maxTurns: 100,
        model: "claude-opus-4-6",
        thinkingBudget: "high"
      }
    })) {
      if (msg.type === "assistant" && msg.message?.content) {
        turns++;
        for (const b of msg.message.content) {
          if (b.type === "text") {
            lastText = b.text;
            log(`턴${turns}: ${b.text.substring(0, 120).replace(/\n/g, " ")}`);
          }
          if (b.type === "tool_use") {
            toolUses++;
            log(`도구: ${b.name}`);
          }
        }
      }
      if (msg.type === "result") {
        status = msg.subtype;
      }
    }
  } catch (e) {
    status = "error";
    log(`SDK 에러: ${e.message}`);
  }

  const mins = ((Date.now() - start) / 1000 / 60).toFixed(1);
  log(`SDK 완료: ${status} (${mins}분, ${turns}턴, ${toolUses}도구)`);

  // settings 복구
  restoreSettings();

  // 결과 저장
  const result = { mode: "chain", taskFile, status, minutes: parseFloat(mins), turns, toolUses, lastText: lastText.substring(0, 2000), timestamp: new Date().toISOString() };
  fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));

  return { taskFile, status, mins, turns, toolUses, lastText };
}

// 메인 체인 실행
async function chain() {
  fs.writeFileSync(LOG_FILE, "");
  log(`🔗 체인 모드 시작: ${taskFiles.length}개 TASK`);
  log(`📋 ${taskFiles.join(" → ")}`);

  await sendSlackDM(`🔗 체인 모드 시작: ${taskFiles.length}개 TASK\n${taskFiles.map((f, i) => `${i + 1}. ${f}`).join("\n")}`);

  const results = [];

  for (let i = 0; i < taskFiles.length; i++) {
    const taskFile = taskFiles[i];

    // TASK 파일 존재 확인
    if (!fs.existsSync(`${PROJECT}/${taskFile}`)) {
      log(`❌ ${taskFile} 파일 없음 — 체인 중단`);
      await sendSlackDM(`❌ 체인 중단: ${taskFile} 파일 없음`);
      break;
    }

    // SDK 실행
    const result = await runTask(taskFile, i, taskFiles.length);
    results.push(result);

    // 실패 시 체인 중단
    if (result.status === "error") {
      log(`❌ ${taskFile} 에러 — 체인 중단`);
      await sendSlackDM(`❌ 체인 중단: ${taskFile} 에러\n${result.lastText?.substring(0, 200)}`);
      break;
    }

    // 빌드 검증
    log(`🔍 빌드 검증 중...`);
    const buildOk = validate();
    if (!buildOk) {
      log(`❌ ${taskFile} 빌드 실패 — 체인 중단`);
      await sendSlackDM(`❌ 체인 중단: ${taskFile} 빌드 실패`);
      break;
    }

    // 자동 커밋 + 푸시
    const commitHash = commitAndPush(taskFile);
    if (!commitHash) {
      log(`⚠️ ${taskFile} 커밋 실패 (변경 없음?) — 다음 TASK 진행`);
    }

    log(`✅ ${taskFile} 완료 (${result.mins}분)`);
    await sendSlackDM(`✅ 체인 ${i + 1}/${taskFiles.length} 완료: ${taskFile} (${result.mins}분)\n${commitHash || "변경 없음"}`);
  }

  // 최종 결과
  log(`\n${"=".repeat(60)}`);
  log(`🏁 체인 완료: ${results.length}/${taskFiles.length} TASK`);
  log(`${"=".repeat(60)}`);

  const summary = results.map((r, i) => {
    const icon = r.status === "success" ? "✅" : "❌";
    return `${icon} ${i + 1}. ${r.taskFile} (${r.mins}분, ${r.turns}턴)`;
  }).join("\n");

  log(summary);

  const totalMins = results.reduce((sum, r) => sum + parseFloat(r.mins), 0).toFixed(1);
  const totalTurns = results.reduce((sum, r) => sum + r.turns, 0);
  const passed = results.filter(r => r.status === "success").length;

  const finalMsg = `🏁 체인 완료: ${passed}/${taskFiles.length} TASK (총 ${totalMins}분, ${totalTurns}턴)\n${summary}`;
  await sendSlackDM(finalMsg);

  // 최종 결과 파일
  fs.writeFileSync(RESULT_FILE, JSON.stringify({
    mode: "chain",
    status: passed === taskFiles.length ? "success" : "partial",
    totalMinutes: parseFloat(totalMins),
    totalTurns,
    tasks: results,
    timestamp: new Date().toISOString()
  }, null, 2));

  // openclaw wake
  try {
    execSync(
      `/opt/homebrew/bin/openclaw message send --channel slack --account mozzi --target U06BP49UEJD --message "🔗 체인 완료: ${passed}/${taskFiles.length} TASK (${totalMins}분). /tmp/agent-sdk-result.json 확인"`,
      { timeout: 10000, stdio: "pipe" }
    );
    log("openclaw wake 전송");
  } catch (_) {}
}

chain().catch((e) => {
  console.error("FATAL:", e.message);
  restoreSettings();
  process.exit(1);
});
