#!/usr/bin/env node
// stdout EPIPE 무시 (background 실행 시 파이프 깨짐 방지)
process.stdout.on("error", (e) => { if (e.code !== "EPIPE") throw e; });
process.stderr.on("error", (e) => { if (e.code !== "EPIPE") throw e; });

/**
 * agent-sdk-run.js v5 — 2단계 SDK 실행 + wake
 * 
 * 사용법:
 *   node agent-sdk-run.js plan "지시문"   → Plan/Design만 작성 후 wake
 *   node agent-sdk-run.js dev "지시문"    → 구현 + QA + 빌드 후 wake
 *   node agent-sdk-run.js full "지시문"   → Plan 없이 전부 한 번에 후 wake
 */
const { query } = require("@anthropic-ai/claude-agent-sdk");
const fs = require("fs");

const PROJECT = "/Users/smith/projects/qa-helpdesk";
const SETTINGS = `${PROJECT}/.claude/settings.json`;
const SETTINGS_ORIG = `${SETTINGS}.orig`;
const SETTINGS_LOCAL = `${PROJECT}/.claude/settings.local.json`;
const SETTINGS_LOCAL_ORIG = `${SETTINGS_LOCAL}.orig`;
const LOG_FILE = "/tmp/agent-sdk-progress.log";
const RESULT_FILE = "/tmp/agent-sdk-result.json";

const mode = process.argv[2]; // plan | dev | full
const prompt = process.argv.slice(3).join(" ");

if (!mode || !prompt) {
  console.error("사용법: node agent-sdk-run.js [plan|dev|full] '지시문'");
  process.exit(1);
}

const MODE_PREFIX = {
  plan: "CLAUDE.md를 먼저 읽고 규칙을 따라. docs/ PDCA 아키텍처 문서도 확인.\n\n【중요】 이 실행에서는 Plan/Design 문서만 작성하고 멈춰라.\n- docs/01-plan/features/ 에 Plan 문서 작성\n- docs/02-design/features/ 에 Design 문서 작성\n- 코드 구현은 하지 마. 설계까지만.\n- 완료되면 \"Plan/Design 작성 완료\" 라고 말해.\n\n",
  dev: "CLAUDE.md를 먼저 읽고 규칙을 따라. docs/ PDCA 아키텍처 문서도 확인.\n\n【중요】 Plan/Design은 이미 작성되어 있다. docs/01-plan/, docs/02-design/ 참고.\n- Plan 기반으로 구현해.\n- qa-engineer에게 delegate해서 Gap 분석 + QA도 해.\n- 커밋 전에 tsc + lint + npm run build 필수.\n\n",
  full: "CLAUDE.md를 먼저 읽고 규칙을 따라. docs/ PDCA 아키텍처 문서도 확인.\n\n"
};

if (!MODE_PREFIX[mode]) {
  console.error("모드: plan | dev | full");
  process.exit(1);
}

function log(msg) {
  const line = `[${new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })}] [${mode}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  try { process.stdout.write(line); } catch (_) {}
}

// settings.json + settings.local.json 복구 (동기) - signal 핸들러 + finally에서 공유
function restoreSettings() {
  // settings.json 복구
  try {
    if (fs.existsSync(SETTINGS_ORIG)) {
      fs.copyFileSync(SETTINGS_ORIG, SETTINGS);
      fs.unlinkSync(SETTINGS_ORIG);
      log("settings.json 복구 완료");
    }
  } catch (e) {
    log("settings.json 복구 실패: " + e.message);
  }

  // settings.local.json 복구
  try {
    if (fs.existsSync(SETTINGS_LOCAL_ORIG)) {
      fs.copyFileSync(SETTINGS_LOCAL_ORIG, SETTINGS_LOCAL);
      fs.unlinkSync(SETTINGS_LOCAL_ORIG);
      log("settings.local.json 복구 완료");
    }
  } catch (e) {
    log("settings.local.json 복구 실패: " + e.message);
  }
}

// 전역 에러 핸들러 - 조용한 종료 방지
process.on("uncaughtException", (e) => {
  log("[FATAL uncaughtException] " + e.message);
  restoreSettings();
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log("[FATAL unhandledRejection] " + (reason && reason.message ? reason.message : String(reason)));
  restoreSettings();
  process.exit(1);
});

// SIGTERM/SIGINT: finally 블록 없이 종료되므로 여기서 직접 복구
process.on("SIGTERM", () => {
  log("SIGTERM 수신 - settings 복구 후 종료");
  restoreSettings();
  process.exit(0);
});
process.on("SIGINT", () => {
  log("SIGINT 수신 - settings 복구 후 종료");
  restoreSettings();
  process.exit(0);
});

// Slack DM 전송 (실패해도 wake에 영향 없음)
// dev-lead(텐동) + mozzi(모찌) 양쪽으로 전송
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
  // fallback: 환경변수
  if (targets.length === 0 && process.env.SLACK_BOT_TOKEN) {
    targets.push({ token: process.env.SLACK_BOT_TOKEN, channel: "D0ADQEF21T4", label: "env" });
  }
  if (targets.length === 0) {
    log("SLACK_BOT_TOKEN 없음 - Slack 알림 skip");
    return;
  }
  await Promise.all(targets.map(t => sendSlackMsg(t.token, t.channel, text, t.label)));
}

async function sendSlackMsg(token, channel, text, label) {
  return new Promise((resolve) => {
    try {
      const https = require("https");
      const postData = JSON.stringify({ channel, text });
      const req = https.request({
        hostname: "slack.com",
        path: "/api/chat.postMessage",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          "Authorization": "Bearer " + token
        }
      }, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.ok) {
              log(`Slack DM 전송 완료 (${label})`);
            } else {
              log(`Slack DM 실패 (${label}): ` + parsed.error);
            }
          } catch (_) {
            log(`Slack DM 응답 파싱 실패 (${label})`);
          }
          resolve();
        });
      });
      req.on("error", (e) => {
        log(`Slack DM HTTP 에러 (${label}): ` + e.message);
        resolve();
      });
      req.write(postData);
      req.end();
    } catch (e) {
      log(`Slack DM 예외 (${label}): ` + e.message);
      resolve();
    }
  });
}

async function run() {
  // [FIX] LOG_FILE 먼저 초기화한 뒤 로깅 시작
  fs.writeFileSync(LOG_FILE, "");

  // settings.json 백업: .orig이 없을 때만 원본 보존
  // 이전 크래시로 .orig이 남아있으면 그 원본을 지킴
  if (!fs.existsSync(SETTINGS_ORIG)) {
    fs.copyFileSync(SETTINGS, SETTINGS_ORIG);
    log("settings.json 백업 완료");
  } else {
    log("settings.json.orig 이미 존재 - 이전 크래시 복구 중, 원본 유지");
  }

  // settings.local.json 백업: hooks 제거 목적 (EPIPE/SIGTERM 방지)
  if (fs.existsSync(SETTINGS_LOCAL)) {
    if (!fs.existsSync(SETTINGS_LOCAL_ORIG)) {
      fs.copyFileSync(SETTINGS_LOCAL, SETTINGS_LOCAL_ORIG);
      log("settings.local.json 백업 완료");
    } else {
      log("settings.local.json.orig 이미 존재 - 이전 크래시 복구 중, 원본 유지");
    }
  }

  // SDK용 settings.json 교체
  fs.writeFileSync(SETTINGS, '{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"1"}}');

  // SDK용 settings.local.json 교체: hooks 비활성화 (EPIPE/SIGTERM 방지)
  fs.writeFileSync(SETTINGS_LOCAL, "{}");
  log("settings.local.json → {} (hooks 비활성화)");

  const start = Date.now();
  let turns = 0, lastText = "", toolUses = 0;
  let resultWritten = false;
  let slackMsg = null; // Slack DM 메시지 (완료/에러 시 설정)

  // stage 마커 초기화 (이전 실행 찌꺼기 제거)
  for (const stage of ["REVIEW_DONE", "DEV_DONE", "QA_DONE", "BUILD_PASS"]) {
    try { fs.unlinkSync(`/tmp/agent-stage-${stage}`); } catch {}
  }

  log("시작 [" + mode + "]: " + prompt.substring(0, 100));

  // ── 세션 시작 Slack 알림 ──
  await sendSlackDM(`🏁 [에이전트팀] ${mode} 세션 시작\n📋 ${prompt.substring(0, 200)}`);

  try {
    for await (const msg of query({
      prompt: MODE_PREFIX[mode] + prompt,
      options: {
        cwd: PROJECT,
        pathToClaudeCodeExecutable: "/opt/homebrew/bin/claude",
        permissionMode: "bypassPermissions",
        maxTurns: mode === "plan" ? 30 : 100,
        model: "claude-opus-4-6",
        thinkingBudget: "high"
      }
    })) {
      // system 메시지 로그 (디버깅)
      if (msg.type === "system") {
        log("시스템: subtype=" + (msg.subtype || "?") + " session=" + (msg.session_id || ""));
      }

      if (msg.type === "assistant" && msg.message && msg.message.content) {
        turns++;
        for (const b of msg.message.content) {
          if (b.type === "text") {
            lastText = b.text;
            log("턴" + turns + ": " + b.text.substring(0, 150).replace(/\n/g, " "));
          }
          if (b.type === "tool_use") {
            toolUses++;
            log("도구사용: " + b.name);
          }
        }
      }

      if (msg.type === "result") {
        const mins = ((Date.now() - start) / 1000 / 60).toFixed(1);
        const result = {
          mode,
          status: msg.subtype,
          minutes: parseFloat(mins),
          turns,
          toolUses,
          lastText: lastText.substring(0, 2000),
          timestamp: new Date().toISOString()
        };
        fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
        resultWritten = true;
        log("완료: " + msg.subtype + " (" + mins + "분, " + turns + "턴, " + toolUses + "도구)");
        slackMsg = `[에이전트팀] ${mode} 완료 (${mins}분, ${turns}턴). 모찌에게 보고 요청.`;
      }
    }
  } catch (e) {
    const mins = ((Date.now() - start) / 1000 / 60).toFixed(1);
    const result = {
      mode,
      status: "error",
      minutes: parseFloat(mins),
      turns,
      error: e.message,
      stack: e.stack
    };
    fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
    resultWritten = true;
    log("에러: " + e.message);
    log("스택: " + (e.stack || "").split("\n").slice(0, 5).join(" | "));
    slackMsg = `[에이전트팀] ${mode} 실패: ${e.message}. 확인 필요.`;
  // ── POST-COMPLETION VALIDATION (강제) ──────────────────────
  // SDK가 빌드/린트 안 하고 끝내도 여기서 강제 검증
  if (mode !== "plan") {
    log("=== 강제 Validation 시작 ===");
    const { execSync } = require("child_process");
    const checks = [
      { name: "TypeScript", cmd: "npx tsc --noEmit --quiet" },
      { name: "Lint", cmd: "npx next lint --quiet" },
      { name: "Build", cmd: "npm run build" },
    ];
    let allPassed = true;
    for (const check of checks) {
      try {
        execSync(check.cmd, { cwd: PROJECT, stdio: "pipe", timeout: 120_000 });
        log("✅ " + check.name + " PASS");
      } catch (e) {
        allPassed = false;
        const stderr = (e.stderr || "").toString().slice(0, 500);
        log("❌ " + check.name + " FAIL: " + stderr.replace(/\n/g, " "));
      }
    }

    // 리더 메모리 업데이트 검증
    const LEADER_MEMORY = `${process.env.HOME}/.claude/agent-memory/leader/MEMORY.md`;
    try {
      const stat = fs.statSync(LEADER_MEMORY);
      const ageMinutes = (Date.now() - stat.mtimeMs) / 60000;
      if (ageMinutes > 60) {
        allPassed = false;
        log("❌ 리더 MEMORY.md 미업데이트 (" + Math.round(ageMinutes) + "분 전) — 작업 정리 안 함");
      } else {
        log("✅ 리더 MEMORY.md 업데이트됨 (" + Math.round(ageMinutes) + "분 전)");
      }
    } catch {
      allPassed = false;
      log("❌ 리더 MEMORY.md 파일 없음 — 작업 정리 안 함");
    }

    // report-stage 마커 검증
    const stages = ["REVIEW_DONE", "DEV_DONE", "QA_DONE", "BUILD_PASS"];
    for (const stage of stages) {
      if (fs.existsSync(`/tmp/agent-stage-${stage}`)) {
        log("✅ " + stage + " 보고됨");
      } else {
        allPassed = false;
        log("❌ " + stage + " 보고 누락");
      }
    }

    if (!allPassed) {
      log("⚠️ Validation 실패 — Smith님 확인 필요");
      slackMsg = `[에이전트팀] ${mode} 완료했으나 ❌ Validation 실패. 확인 필요.`;
    } else {
      log("✅ 전체 Validation 통과");
    }
  }

  } finally {
    // [FIX] finally: 정상 완료 또는 에러 시 settings 반드시 복구
    restoreSettings();

    // [FIX] result 미생성 시 fallback 기록
    if (!resultWritten) {
      const mins = ((Date.now() - start) / 1000 / 60).toFixed(1);
      const result = {
        mode,
        status: "incomplete",
        minutes: parseFloat(mins),
        turns,
        toolUses,
        lastText: lastText.substring(0, 2000),
        timestamp: new Date().toISOString(),
        note: "result 이벤트 없이 루프 종료"
      };
      fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
      log("불완전 종료 (" + mins + "분, " + turns + "턴) - result 이벤트 없이 루프 종료됨");
    }
  }

  // ── 세션 종료 Slack 알림 ──
  const mins = resultWritten ? JSON.parse(fs.readFileSync(RESULT_FILE, "utf8")).minutes : "?";
  const endMsg = slackMsg || `🏁 [에이전트팀] ${mode} 완료 (${mins}분, ${turns}턴)\n📄 /tmp/agent-sdk-result.json 확인`;
  try {
    await sendSlackDM(endMsg);
  } catch (e) {
    log("Slack DM 전송 중 예외: " + e.message);
  }

  // openclaw wake (HTTP API)
  const wakeMsg = mode === "plan"
    ? "에이전트팀 Plan/Design 작성 완료. /tmp/agent-sdk-result.json 확인 후 Smith님께 보고"
    : "에이전트팀 SDK 작업 완료. /tmp/agent-sdk-result.json 확인";

  try {
    const http = require("http");
    const postData = JSON.stringify({ text: wakeMsg, mode: "now" });
    const raw = fs.readFileSync("/Users/smith/.openclaw/openclaw.json", "utf8");
    const token = (JSON.parse(raw).hooks || {}).token || "";
    const req = http.request({
      hostname: "localhost", port: 18789, path: "/hooks/wake",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        "Authorization": "Bearer " + token
      }
    }, (res) => { res.resume(); });
    req.on("error", (e) => log("wake HTTP 에러: " + e.message));
    req.write(postData);
    req.end();
    log("openclaw wake 전송 완료");
  } catch (e) {
    log("wake 실패: " + e.message);
  }
}

run().catch(function(e) {
  console.error("FATAL:", e.message);
  console.error(e.stack);
  restoreSettings();
  process.exit(1);
});
