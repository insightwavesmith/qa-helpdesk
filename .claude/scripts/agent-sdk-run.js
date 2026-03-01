#!/usr/bin/env node
/**
 * agent-sdk-run.js v4 — 2단계 SDK 실행 + wake
 * 
 * 사용법:
 *   node agent-sdk-run.js plan "지시문"   → Plan/Design만 작성 후 wake
 *   node agent-sdk-run.js dev "지시문"    → 구현 + QA + 빌드 후 wake
 *   node agent-sdk-run.js full "지시문"   → Plan 없이 전부 한 번에 후 wake
 */
const { query } = require("@anthropic-ai/claude-agent-sdk");
const fs = require("fs");
const { execSync } = require("child_process");

const PROJECT = "/Users/smith/projects/qa-helpdesk";
const SETTINGS = `${PROJECT}/.claude/settings.json`;
const LOG_FILE = "/tmp/agent-sdk-progress.log";
const RESULT_FILE = "/tmp/agent-sdk-result.json";

const mode = process.argv[2]; // plan | dev | full
const prompt = process.argv.slice(3).join(" ");

if (!mode || !prompt) {
  console.error("사용법: node agent-sdk-run.js [plan|dev|full] '지시문'");
  process.exit(1);
}

const MODE_PREFIX = {
  plan: `CLAUDE.md를 먼저 읽고 규칙을 따라. docs/ PDCA 아키텍처 문서도 확인.

【중요】 이 실행에서는 Plan/Design 문서만 작성하고 멈춰라.
- docs/01-plan/features/ 에 Plan 문서 작성
- docs/02-design/features/ 에 Design 문서 작성
- 코드 구현은 하지 마. 설계까지만.
- 완료되면 "Plan/Design 작성 완료" 라고 말해.

`,
  dev: `CLAUDE.md를 먼저 읽고 규칙을 따라. docs/ PDCA 아키텍처 문서도 확인.

【중요】 Plan/Design은 이미 작성되어 있다. docs/01-plan/, docs/02-design/ 참고.
- Plan 기반으로 구현해.
- qa-engineer에게 delegate해서 Gap 분석 + QA도 해.
- 커밋 전에 tsc + lint + npm run build 필수.

`,
  full: `CLAUDE.md를 먼저 읽고 규칙을 따라. docs/ PDCA 아키텍처 문서도 확인.

`
};

if (!MODE_PREFIX[mode]) {
  console.error("모드: plan | dev | full");
  process.exit(1);
}

function log(msg) {
  const line = `[${new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })}] [${mode}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  process.stdout.write(line);
}

async function run() {
  // settings 백업 → SDK용 교체
  fs.copyFileSync(SETTINGS, `${SETTINGS}.orig`);
  fs.writeFileSync(SETTINGS, '{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"1"}}');

  fs.writeFileSync(LOG_FILE, "");
  const start = Date.now();
  let turns = 0, lastText = "", toolUses = 0;

  log(`시작 [${mode}]: ${prompt.substring(0, 100)}`);

  try {
    for await (const msg of query({
      prompt: MODE_PREFIX[mode] + prompt,
      options: {
        pathToClaudeCodeExecutable: "/opt/homebrew/bin/claude",
        permissionMode: "bypassPermissions",
        maxTurns: mode === "plan" ? 30 : 100
      }
    })) {
      if (msg.type === "assistant" && msg.message?.content) {
        turns++;
        for (const b of msg.message.content) {
          if (b.type === "text") {
            lastText = b.text;
            log(`턴${turns}: ${b.text.substring(0, 150).replace(/\n/g, " ")}`);
          }
          if (b.type === "tool_use") toolUses++;
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
        log(`완료: ${msg.subtype} (${mins}분, ${turns}턴, ${toolUses}도구)`);
      }
    }
  } catch (e) {
    const mins = ((Date.now() - start) / 1000 / 60).toFixed(1);
    const result = { mode, status: "error", minutes: parseFloat(mins), turns, error: e.message };
    fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
    log(`에러: ${e.message}`);
  }

  // settings 복구
  fs.copyFileSync(`${SETTINGS}.orig`, SETTINGS);
  fs.unlinkSync(`${SETTINGS}.orig`);
  log("settings 복구 완료");

  // openclaw wake
  const wakeMsg = mode === "plan"
    ? "에이전트팀 Plan/Design 작성 완료. /tmp/agent-sdk-result.json 확인 후 Smith님께 보고"
    : "에이전트팀 SDK 작업 완료. /tmp/agent-sdk-result.json 확인";
  
  try {
    execSync(`openclaw gateway wake --text "${wakeMsg}" --mode now`, { timeout: 10000 });
    log("openclaw wake 전송 완료");
  } catch (e) {
    log("wake 실패: " + e.message);
  }
}

run();
