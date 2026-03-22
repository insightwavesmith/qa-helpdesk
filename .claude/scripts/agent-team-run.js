#!/usr/bin/env node
// stdout EPIPE 무시 (background 실행 시 파이프 깨짐 방지)
process.stdout.on("error", (e) => { if (e.code !== "EPIPE") throw e; });
process.stderr.on("error", (e) => { if (e.code !== "EPIPE") throw e; });

/**
 * agent-team-run.js v1 — tmux + CLI 기반 에이전트팀 실행
 *
 * SDK query() API → tmux 세션 안에서 claude CLI 실행으로 전면 교체.
 * SDK에는 Agent Teams 기능이 없어 단일 에이전트로만 돌았음.
 * CLI에만 TeamCreate, SendMessage, TmuxBackend 등 팀 기능이 존재.
 *
 * 사용법:
 *   node agent-team-run.js plan "지시문"   → Plan/Design만 작성 후 wake
 *   node agent-team-run.js dev "지시문"    → 구현 + QA + 빌드 후 wake
 *   node agent-team-run.js full "지시문"   → Plan 없이 전부 한 번에 후 wake
 */
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PROJECT = "/Users/smith/projects/bscamp";
const SETTINGS = `${PROJECT}/.claude/settings.json`;
const SETTINGS_ORIG = `${SETTINGS}.orig`;
const SETTINGS_LOCAL = `${PROJECT}/.claude/settings.local.json`;
const SETTINGS_LOCAL_ORIG = `${SETTINGS_LOCAL}.orig`;
const LOG_FILE = "/tmp/agent-sdk-progress.log";
const RESULT_FILE = "/tmp/agent-sdk-result.json";
const CLAUDE_BIN = "/opt/homebrew/bin/claude";

const mode = process.argv[2]; // plan | dev | full
const prompt = process.argv.slice(3).join(" ");

if (!mode || !prompt) {
  console.error("사용법: node agent-team-run.js [plan|dev|full] '지시문'");
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

// ── settings 복구 ──
function restoreSettings() {
  try {
    if (fs.existsSync(SETTINGS_ORIG)) {
      fs.copyFileSync(SETTINGS_ORIG, SETTINGS);
      fs.unlinkSync(SETTINGS_ORIG);
      log("settings.json 복구 완료");
    }
  } catch (e) {
    log("settings.json 복구 실패: " + e.message);
  }
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

// 전역 에러 핸들러
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

// ── Slack DM ──
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
            if (parsed.ok) log(`Slack DM 전송 완료 (${label})`);
            else log(`Slack DM 실패 (${label}): ` + parsed.error);
          } catch (_) {
            log(`Slack DM 응답 파싱 실패 (${label})`);
          }
          resolve();
        });
      });
      req.on("error", (e) => { log(`Slack DM HTTP 에러 (${label}): ` + e.message); resolve(); });
      req.write(postData);
      req.end();
    } catch (e) {
      log(`Slack DM 예외 (${label}): ` + e.message);
      resolve();
    }
  });
}

// ── tmux 세션 관리 ──
function cleanOldSessions() {
  try {
    const output = execSync("tmux list-sessions -F '#{session_name}' 2>/dev/null", { encoding: "utf8" });
    const sessions = output.trim().split("\n").filter(s => s.startsWith("agent-team-"));
    for (const session of sessions) {
      try {
        execSync(`tmux kill-session -t "${session}" 2>/dev/null`);
        log(`이전 세션 정리: ${session}`);
      } catch (_) {}
    }
  } catch (_) {
    // tmux 서버 없음 — 정상
  }
}

// ── 에이전트팀 활성화 검증 ──
function verifyTeamActivation(logContent) {
  const keywords = ["TeamCreate", "delegate", "teammate", "SendMessage", "SpawnTeam", "team_created", "agent_team"];
  const found = keywords.filter(kw => logContent.toLowerCase().includes(kw.toLowerCase()));
  if (found.length > 0) {
    log(`✅ 에이전트팀 활성화 확인 (키워드: ${found.join(", ")})`);
    return true;
  } else {
    log("⚠️ 에이전트팀 미활성화 — 단일 에이전트로 실행됨");
    return false;
  }
}

// ── 메인 실행 ──
async function run() {
  fs.writeFileSync(LOG_FILE, "");
  const start = Date.now();
  let slackMsg = null;
  let resultWritten = false;

  // T4: 이전 tmux 세션 정리
  cleanOldSessions();

  const sessionName = `agent-team-${Date.now()}`;

  // T2: settings.json 백업 — CLI가 직접 읽으므로 교체 필요
  if (!fs.existsSync(SETTINGS_ORIG)) {
    fs.copyFileSync(SETTINGS, SETTINGS_ORIG);
    log("settings.json 백업 완료");
  } else {
    log("settings.json.orig 이미 존재 - 이전 크래시 복구 중, 원본 유지");
  }

  // T2: settings.local.json 백업
  // CLI에서는 Stop hooks 포함 전체 hooks 보존 (파이프 안 끊김)
  if (fs.existsSync(SETTINGS_LOCAL)) {
    if (!fs.existsSync(SETTINGS_LOCAL_ORIG)) {
      fs.copyFileSync(SETTINGS_LOCAL, SETTINGS_LOCAL_ORIG);
      log("settings.local.json 백업 완료");
    } else {
      log("settings.local.json.orig 이미 존재 - 이전 크래시 복구 중, 원본 유지");
    }
  }

  // T2: settings.json 교체 — 에이전트팀 환경변수 + tmux 표시 모드
  fs.writeFileSync(SETTINGS, JSON.stringify({
    env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
    agentTeamDisplay: "tmux"
  }, null, 2));
  log("settings.json → 에이전트팀 활성화");

  // T2: settings.local.json — CLI 실행이므로 Stop hooks 포함 전체 유지
  // SDK와 달리 파이프 끊김 문제가 없으므로 hooks 제거 불필요
  // 원본 그대로 사용 (이미 백업됨, 복구 시 원본으로 돌아감)
  log("settings.local.json → 전체 hooks 유지 (CLI는 파이프 안 끊김)");

  // stage 마커 초기화
  for (const stage of ["REVIEW_DONE", "DEV_DONE", "QA_DONE", "BUILD_PASS"]) {
    try { fs.unlinkSync(`/tmp/agent-stage-${stage}`); } catch {}
  }

  log("시작 [" + mode + "]: " + prompt.substring(0, 100));
  log("tmux 세션: " + sessionName);

  // 세션 시작 Slack 알림
  await sendSlackDM(`🏁 [에이전트팀 tmux] ${mode} 세션 시작\n📋 ${prompt.substring(0, 200)}\n🖥️ tmux: ${sessionName}`);

  // ── T1: tmux 세션 생성 + claude CLI 실행 ──
  const fullPrompt = MODE_PREFIX[mode] + prompt;

  // 프롬프트를 임시 파일에 저장 (쉘 이스케이프 문제 방지)
  const promptFile = `/tmp/agent-team-prompt-${Date.now()}.txt`;
  fs.writeFileSync(promptFile, fullPrompt);

  // tmux 세션 안에서 claude CLI를 실행하고 출력을 로그 파일에 기록
  const tmuxLogFile = `/tmp/agent-team-output-${Date.now()}.log`;
  const maxTurns = mode === "plan" ? 30 : 100;

  // tmux 세션 생성 + claude 실행 명령
  const tmuxCmd = [
    `export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1;`,
    `cat "${promptFile}" | ${CLAUDE_BIN} -p`,
    `--permission-mode bypassPermissions`,
    `--model claude-opus-4-6`,
    `--max-turns ${maxTurns}`,
    `2>&1 | tee "${tmuxLogFile}";`,
    `echo "__EXIT_CODE__=$?" >> "${tmuxLogFile}";`,
    `echo "__AGENT_DONE__" >> "${tmuxLogFile}"`
  ].join(" ");

  try {
    execSync(`tmux new-session -d -s "${sessionName}" -x 220 -y 50 '${tmuxCmd.replace(/'/g, "'\\''")}'`, {
      cwd: PROJECT,
      env: {
        ...process.env,
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
      }
    });
    log("tmux 세션 생성 완료: " + sessionName);
  } catch (e) {
    log("tmux 세션 생성 실패: " + e.message);
    restoreSettings();
    try { fs.unlinkSync(promptFile); } catch {}
    process.exit(1);
  }

  // ── 완료 대기: tmux 세션 종료 또는 __AGENT_DONE__ 감지 ──
  log("claude CLI 실행 대기 중...");

  const POLL_INTERVAL = 5000; // 5초
  const MAX_WAIT = mode === "plan" ? 60 * 60 * 1000 : 3 * 60 * 60 * 1000; // plan: 1시간, dev/full: 3시간

  let elapsed = 0;
  let lastLogSize = 0;

  while (elapsed < MAX_WAIT) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    elapsed += POLL_INTERVAL;

    // 진행 상황 로그 (1분마다)
    if (elapsed % 60000 === 0) {
      const mins = (elapsed / 60000).toFixed(0);
      log(`대기 중... (${mins}분 경과)`);
    }

    // 로그 파일 크기 변화 체크 + 내용 확인
    try {
      const stat = fs.statSync(tmuxLogFile);
      if (stat.size !== lastLogSize) {
        lastLogSize = stat.size;
        // 새 내용의 마지막 부분만 읽어서 완료 감지
        const content = fs.readFileSync(tmuxLogFile, "utf8");
        if (content.includes("__AGENT_DONE__")) {
          log("claude CLI 실행 완료 감지 (__AGENT_DONE__)");
          break;
        }
      }
    } catch (_) {
      // 로그 파일 아직 없음 — 정상
    }

    // tmux 세션 존재 여부 체크
    try {
      execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`);
    } catch (_) {
      // 세션 종료됨 — 완료로 간주
      log("tmux 세션 종료 감지");
      break;
    }
  }

  if (elapsed >= MAX_WAIT) {
    log("⚠️ 최대 대기 시간 초과 — 강제 종료");
    try { execSync(`tmux kill-session -t "${sessionName}" 2>/dev/null`); } catch {}
  }

  // ── 결과 수집 ──
  const mins = ((Date.now() - start) / 1000 / 60).toFixed(1);
  let logContent = "";
  let exitCode = -1;

  try {
    logContent = fs.readFileSync(tmuxLogFile, "utf8");
    // exit code 추출
    const exitMatch = logContent.match(/__EXIT_CODE__=(\d+)/);
    if (exitMatch) exitCode = parseInt(exitMatch[1]);
  } catch (_) {
    log("로그 파일 읽기 실패");
  }

  // T3: 에이전트팀 활성화 검증
  const teamActivated = verifyTeamActivation(logContent);

  // 결과 파일 작성
  const result = {
    mode,
    status: exitCode === 0 ? "end_turn" : (elapsed >= MAX_WAIT ? "timeout" : "error"),
    exitCode,
    minutes: parseFloat(mins),
    teamActivated,
    sessionName,
    logFile: tmuxLogFile,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
  resultWritten = true;
  log(`완료: exit=${exitCode} (${mins}분, 팀=${teamActivated ? "활성" : "미활성"})`);

  slackMsg = `[에이전트팀 tmux] ${mode} 완료 (${mins}분, exit=${exitCode}, 팀=${teamActivated ? "✅" : "⚠️"})`;

  // ── POST-COMPLETION VALIDATION ──
  if (mode !== "plan") {
    log("=== 강제 Validation 시작 ===");
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
        log("❌ 리더 MEMORY.md 미업데이트 (" + Math.round(ageMinutes) + "분 전)");
      } else {
        log("✅ 리더 MEMORY.md 업데이트됨 (" + Math.round(ageMinutes) + "분 전)");
      }
    } catch {
      allPassed = false;
      log("❌ 리더 MEMORY.md 파일 없음");
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
      slackMsg = `[에이전트팀 tmux] ${mode} 완료했으나 ❌ Validation 실패. 확인 필요.`;
    } else {
      log("✅ 전체 Validation 통과");
    }
  }

  // settings 복구
  restoreSettings();

  // 임시 프롬프트 파일 정리
  try { fs.unlinkSync(promptFile); } catch {}

  // ── Slack 종료 알림 ──
  const teamStatus = teamActivated ? "팀 활성 ✅" : "단일 에이전트 ⚠️";
  const endMsg = slackMsg || `🏁 [에이전트팀 tmux] ${mode} 완료 (${mins}분)\n${teamStatus}\n📄 /tmp/agent-sdk-result.json 확인`;
  try {
    await sendSlackDM(endMsg);
  } catch (e) {
    log("Slack DM 전송 중 예외: " + e.message);
  }

  // ── OpenClaw wake ──
  const wakeMsg = mode === "plan"
    ? "에이전트팀 Plan/Design 작성 완료. /tmp/agent-sdk-result.json 확인 후 Smith님께 보고"
    : `에이전트팀 tmux 작업 완료 (${teamStatus}). /tmp/agent-sdk-result.json 확인`;

  // 방법 1: openclaw message send
  try {
    execSync(
      `/opt/homebrew/bin/openclaw message send --channel slack --account mozzi --target U06BP49UEJD --message "${wakeMsg.replace(/"/g, '\\"')}"`,
      { timeout: 10000, stdio: "pipe" }
    );
    log("openclaw message send 완료");
  } catch (e) {
    log("openclaw message send 실패: " + (e.message || "").substring(0, 100));
  }

  // 방법 2: wake HTTP API (백업)
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
