#!/usr/bin/env node
/**
 * agent-sdk-run.js v3 — SDK 에이전트팀 실행 + 자동 wake
 * 
 * 사용법: node agent-sdk-run.js "지시문"
 * 
 * 동작:
 * 1. settings.json 백업 → SDK용으로 교체
 * 2. SDK query() 실행 — 매 턴 로그 파일에 기록
 * 3. 완료 시 결과 파일 작성 + openclaw wake
 * 4. settings.json 복구
 */
const { query } = require("@anthropic-ai/claude-agent-sdk");
const fs = require("fs");
const { execSync } = require("child_process");

const PROJECT = "/Users/smith/projects/qa-helpdesk";
const SETTINGS = `${PROJECT}/.claude/settings.json`;
const LOG_FILE = "/tmp/agent-sdk-progress.log";
const RESULT_FILE = "/tmp/agent-sdk-result.json";

const prompt = process.argv.slice(2).join(" ");
if (!prompt) { console.error("사용법: node agent-sdk-run.js '지시문'"); process.exit(1); }

function log(msg) {
  const line = `[${new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  process.stdout.write(line);
}

async function run() {
  // settings 백업 → SDK용 교체
  fs.copyFileSync(SETTINGS, `${SETTINGS}.orig`);
  fs.writeFileSync(SETTINGS, '{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"1"}}');

  fs.writeFileSync(LOG_FILE, "");  // 초기화
  const start = Date.now();
  let turns = 0, lastText = "", toolUses = 0;

  log(`시작: ${prompt.substring(0, 100)}`);

  try {
    for await (const msg of query({
      prompt: `CLAUDE.md를 먼저 읽고 규칙을 따라. docs/ PDCA 아키텍처 문서도 확인.\n\n${prompt}`,
      options: {
        pathToClaudeCodeExecutable: "/opt/homebrew/bin/claude",
        permissionMode: "bypassPermissions",
        maxTurns: 100
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
    const result = { status: "error", minutes: parseFloat(mins), turns, error: e.message };
    fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
    log(`에러: ${e.message}`);
  }

  // settings 복구
  fs.copyFileSync(`${SETTINGS}.orig`, SETTINGS);
  fs.unlinkSync(`${SETTINGS}.orig`);
  log("settings 복구 완료");

  // openclaw wake → 모찌한테 알림
  try {
    execSync('openclaw gateway wake --text "에이전트팀 SDK 작업 완료. /tmp/agent-sdk-result.json 확인" --mode now', { timeout: 10000 });
    log("openclaw wake 전송 완료");
  } catch (e) {
    log("wake 실패: " + e.message);
  }
}

run();
