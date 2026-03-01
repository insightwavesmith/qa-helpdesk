#!/usr/bin/env node
const { query } = require("@anthropic-ai/claude-agent-sdk");
const https = require("https");

const SLACK_TOKEN = process.env.SLACK_TOKEN || "";
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || "D09V1NX98SK";
const PROJECT = "/Users/smith/projects/qa-helpdesk";

const args = process.argv.slice(2);
const slackMode = args.includes("--slack");
const prompt = args.filter(a => a !== "--slack").join(" ");

if (!prompt) {
  console.error("사용법: agent-sdk-run.sh \"지시문\" [--slack]");
  process.exit(1);
}

function sendSlack(text) {
  if (!slackMode || !SLACK_TOKEN) return;
  const data = JSON.stringify({ channel: SLACK_CHANNEL, text });
  const req = https.request({
    hostname: "slack.com", path: "/api/chat.postMessage", method: "POST",
    headers: { "Authorization": "Bearer " + SLACK_TOKEN, "Content-Type": "application/json" }
  });
  req.write(data); req.end();
}

async function run() {
  const start = Date.now();
  let lastText = "", turns = 0;
  console.log("[시작]", new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }));
  console.log("[지시]", prompt.substring(0, 200));
  console.log("─".repeat(60));

  try {
    for await (const msg of query({
      prompt: "CLAUDE.md를 먼저 읽고 규칙을 따라. docs/ PDCA 아키텍처 문서도 확인.\n\n" + prompt,
      options: {
        pathToClaudeCodeExecutable: "/opt/homebrew/bin/claude",
        cwd: PROJECT,
        permissionMode: "bypassPermissions",
        env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" }
      }
    })) {
      if (msg.type === "assistant" && msg.message?.content) {
        turns++;
        for (const b of msg.message.content) {
          if (b.type === "text") {
            lastText = b.text;
            console.log("[턴 " + turns + "]", b.text.substring(0, 300).replace(/\n/g, " "));
          }
        }
      } else if (msg.type === "result") {
        const mins = ((Date.now() - start) / 1000 / 60).toFixed(1);
        console.log("─".repeat(60));
        console.log("[" + msg.subtype + "] " + mins + "분, " + turns + "턴");
        sendSlack("에이전트팀 " + msg.subtype + " (" + mins + "분, " + turns + "턴): " + lastText.substring(0, 200));
      }
    }
  } catch (e) {
    const mins = ((Date.now() - start) / 1000 / 60).toFixed(1);
    console.error("[에러] " + mins + "분 — " + e.message);
    sendSlack("에이전트팀 에러 (" + mins + "분): " + e.message);
  }
}
run();
