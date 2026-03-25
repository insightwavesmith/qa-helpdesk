#!/usr/bin/env node
/**
 * idle-detector.mjs — 팀 무활동 + tmux 세션 상태 감지 데몬
 *
 * 각 팀의 state.json updatedAt과 tmux 세션 alive 여부를 30초 간격으로 폴링.
 * 무활동, 멈춤, 세션 종료 감지 시 슬랙 알림 + CEO DM.
 *
 * 실행 방법:
 *   node scripts/idle-detector.mjs
 *   pm2 start scripts/idle-detector.mjs --name idle-detector
 *
 * 환경변수:
 *   SLACK_BOT_TOKEN — 슬랙 봇 토큰
 *   SLACK_UNIFIED_CHANNEL — 통합 채널 (기본: C0AN7ATS4DD)
 *   SLACK_CEO_USER_ID — CEO DM 전송용
 *   IDLE_THRESHOLD_MINUTES — stale 임계값 (기본: 5)
 *   STUCK_THRESHOLD_MINUTES — stuck 임계값 (기본: 10)
 *   POLL_INTERVAL_SECONDS — 폴링 간격 초 (기본: 30)
 */

import { mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { readJson } from './lib/gcs-agent-ops.mjs';

// ─── 설정 ────────────────────────────────────────────────────────────────────

const CROSS_TEAM_DIR = '/tmp/cross-team';
const TEAMS = ['pm', 'cto', 'marketing'];

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_UNIFIED_CHANNEL = process.env.SLACK_UNIFIED_CHANNEL || 'C0AN7ATS4DD';
const SLACK_CEO_USER_ID = process.env.SLACK_CEO_USER_ID;

const IDLE_THRESHOLD_MS =
  parseInt(process.env.IDLE_THRESHOLD_MINUTES || '5', 10) * 60 * 1000;
const STUCK_THRESHOLD_MS =
  parseInt(process.env.STUCK_THRESHOLD_MINUTES || '10', 10) * 60 * 1000;
const POLL_INTERVAL_MS =
  parseInt(process.env.POLL_INTERVAL_SECONDS || '30', 10) * 1000;

// ─── 팀 표시명 ────────────────────────────────────────────────────────────────

const TEAM_DISPLAY = {
  pm: { name: 'PM팀', emoji: '📋' },
  cto: { name: 'CTO팀', emoji: '⚙️' },
  marketing: { name: '마케팅팀', emoji: '📊' },
};

// ─── 상태 추적 ────────────────────────────────────────────────────────────────

/** @type {Record<string, { lastStatus: string, staleCount: number, lastAlertAt: number | null }>} */
const teamState = {};
for (const team of TEAMS) {
  teamState[team] = { lastStatus: 'unknown', staleCount: 0, lastAlertAt: null };
}

// ─── tmux 세션 확인 ───────────────────────────────────────────────────────────

/**
 * tmux 세션 alive 여부 확인
 * @param {string} team - 팀 ID
 * @returns {boolean}
 */
function checkTmuxSession(team) {
  try {
    execSync(`tmux has-session -t sdk-${team} 2>/dev/null`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ─── state.json 읽기 ──────────────────────────────────────────────────────────

/**
 * 팀 state.json 읽기 (GCS)
 * @param {string} team - 팀 ID
 * @returns {Promise<{ updatedAt: string | null, status: string | null, activeTasks: number } | null>}
 */
async function readTeamState(team) {
  try {
    const data = await readJson(`${team}/state.json`);
    if (!data) return null;

    // activeTasks: tasks 배열에서 status가 active/implementing인 것 카운트
    let activeTasks = 0;
    if (Array.isArray(data.tasks)) {
      activeTasks = data.tasks.filter(
        t => t.status === 'active' || t.status === 'implementing'
      ).length;
    }

    return {
      updatedAt: data.updatedAt || null,
      status: data.status || null,
      activeTasks,
    };
  } catch {
    return null;
  }
}

// ─── 슬랙 전송 ───────────────────────────────────────────────────────────────

/**
 * 슬랙에 메시지 전송
 * @param {string} channel - 채널 ID 또는 사용자 ID
 * @param {object[]} blocks - Block Kit 블록 배열
 * @param {string} text - 폴백 텍스트
 */
async function sendSlack(channel, blocks, text) {
  if (!SLACK_BOT_TOKEN) {
    console.log('[idle-detector] SLACK_BOT_TOKEN 미설정 — 슬랙 전송 스킵');
    return false;
  }
  if (!channel) return false;

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({ channel, blocks, text }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error(`[idle-detector] 슬랙 전송 실패: ${data.error}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[idle-detector] 슬랙 전송 오류: ${err.message}`);
    return false;
  }
}

// ─── 슬랙 메시지 빌더 ────────────────────────────────────────────────────────

/**
 * team.idle 알림 블록
 * @param {string} team - 팀 ID
 * @param {number} minutesAgo - 마지막 활동 이후 분
 * @param {string} updatedAt - 마지막 updatedAt
 * @param {number} staleCount - 연속 감지 횟수
 * @returns {{ blocks: object[], text: string }}
 */
function buildIdleBlocks(team, minutesAgo, updatedAt, staleCount) {
  const display = TEAM_DISPLAY[team] || { name: team, emoji: '🤖' };
  const text = `⚠️ ${display.emoji} ${display.name} 무활동 감지 (${minutesAgo}분 이상)`;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '⚠️ 팀 무활동 감지' },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${display.emoji} ${display.name}*이 *${minutesAgo}분* 이상 활동이 없습니다.\n확인이 필요합니다.`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `마지막 활동: ${updatedAt || '알 수 없음'} | 연속 감지: ${staleCount}회`,
        },
      ],
    },
  ];

  return { blocks, text };
}

/**
 * team.recovered 알림 블록
 * @param {string} team - 팀 ID
 * @returns {{ blocks: object[], text: string }}
 */
function buildRecoveredBlocks(team) {
  const display = TEAM_DISPLAY[team] || { name: team, emoji: '🤖' };
  const text = `✅ ${display.emoji} ${display.name} 활동 재개`;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '✅ 팀 활동 재개' },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${display.emoji} ${display.name}*이 활동을 재개했습니다.`,
      },
    },
  ];

  return { blocks, text };
}

/**
 * session.crashed 알림 블록
 * @param {string} team - 팀 ID
 * @returns {{ blocks: object[], text: string }}
 */
function buildCrashedBlocks(team) {
  const display = TEAM_DISPLAY[team] || { name: team, emoji: '🤖' };
  const text = `🚨 ${display.emoji} ${display.name} tmux 세션 종료 감지`;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🚨 세션 종료 감지' },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${display.emoji} ${display.name}* tmux 세션이 종료되었습니다.\n즉시 복구가 필요합니다.`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `복구 명령: \`tmux new-session -s sdk-${team}\``,
      },
    },
  ];

  return { blocks, text };
}

// ─── 상태 판정 + 알림 ────────────────────────────────────────────────────────

/**
 * 팀 상태 판정 및 필요 시 알림 전송
 * @param {string} team - 팀 ID
 */
async function checkTeam(team) {
  const state = await readTeamState(team);
  const tmuxAlive = checkTmuxSession(team);
  const now = Date.now();
  const current = teamState[team];

  // tmux 세션 종료
  if (!tmuxAlive) {
    if (current.lastStatus !== 'dead') {
      console.log(`[idle-detector] ${team}: 세션 종료 감지`);
      const { blocks, text } = buildCrashedBlocks(team);

      // 통합 채널 + CEO DM
      await sendSlack(SLACK_UNIFIED_CHANNEL, blocks, text);
      if (SLACK_CEO_USER_ID) {
        await sendSlack(SLACK_CEO_USER_ID, blocks, text);
      }

      current.lastStatus = 'dead';
      current.staleCount = 0;
      current.lastAlertAt = now;
    }
    return;
  }

  // state.json 없음 → stale로 처리
  if (!state || !state.updatedAt) {
    // state 파일 없으면 healthy 판정 불가 — stale 처리
    if (current.lastStatus === 'dead') {
      // 세션 복구됨
      const { blocks, text } = buildRecoveredBlocks(team);
      await sendSlack(SLACK_UNIFIED_CHANNEL, blocks, text);
      current.lastStatus = 'unknown';
      current.staleCount = 0;
    }
    return;
  }

  // updatedAt 파싱
  let updatedAtMs;
  try {
    updatedAtMs = new Date(state.updatedAt).getTime();
  } catch {
    return;
  }

  const elapsedMs = now - updatedAtMs;
  const elapsedMin = Math.floor(elapsedMs / 60000);

  // 상태 판정
  let newStatus;

  if (!tmuxAlive) {
    newStatus = 'dead'; // 위에서 처리됨
  } else if (elapsedMs >= STUCK_THRESHOLD_MS && state.activeTasks > 0) {
    newStatus = 'stuck';
  } else if (elapsedMs >= IDLE_THRESHOLD_MS) {
    newStatus = 'stale';
  } else {
    newStatus = 'healthy';
  }

  // 이전이 stale/stuck/dead였다가 healthy로 복귀
  if (
    newStatus === 'healthy' &&
    ['stale', 'stuck', 'dead'].includes(current.lastStatus)
  ) {
    console.log(`[idle-detector] ${team}: 활동 재개 (healthy)`);
    const { blocks, text } = buildRecoveredBlocks(team);
    await sendSlack(SLACK_UNIFIED_CHANNEL, blocks, text);
    current.lastStatus = 'healthy';
    current.staleCount = 0;
    current.lastAlertAt = now;
    return;
  }

  if (newStatus === 'healthy') {
    current.lastStatus = 'healthy';
    current.staleCount = 0;
    return;
  }

  // stale 처리
  if (newStatus === 'stale') {
    // 같은 stale 상태 → 카운트만 증가 (중복 알림 방지)
    if (current.lastStatus === 'stale') {
      current.staleCount++;
      console.log(`[idle-detector] ${team}: stale 지속 (${current.staleCount}회, ${elapsedMin}분 경과)`);

      // 3회 연속이면 CEO DM 긴급 알림
      if (current.staleCount === 3 && SLACK_CEO_USER_ID) {
        console.log(`[idle-detector] ${team}: stale 3회 연속 → CEO DM`);
        const { blocks, text } = buildIdleBlocks(
          team,
          elapsedMin,
          state.updatedAt,
          current.staleCount
        );
        await sendSlack(SLACK_CEO_USER_ID, blocks, text);
        current.lastAlertAt = now;
      }
      return;
    }

    // 처음 stale 감지
    console.log(`[idle-detector] ${team}: stale 감지 (${elapsedMin}분 경과)`);
    const { blocks, text } = buildIdleBlocks(
      team,
      elapsedMin,
      state.updatedAt,
      1
    );
    await sendSlack(SLACK_UNIFIED_CHANNEL, blocks, text);
    current.lastStatus = 'stale';
    current.staleCount = 1;
    current.lastAlertAt = now;
    return;
  }

  // stuck 처리
  if (newStatus === 'stuck') {
    if (current.lastStatus === 'stuck') {
      // 이미 stuck 알림 보냄 — 스킵
      return;
    }

    console.log(`[idle-detector] ${team}: stuck 감지 (활성 TASK ${state.activeTasks}개, ${elapsedMin}분 경과)`);
    const { blocks, text } = buildIdleBlocks(
      team,
      elapsedMin,
      state.updatedAt,
      current.staleCount
    );

    // 통합 채널 + CEO DM
    await sendSlack(SLACK_UNIFIED_CHANNEL, blocks, text);
    if (SLACK_CEO_USER_ID) {
      await sendSlack(SLACK_CEO_USER_ID, blocks, text);
    }

    current.lastStatus = 'stuck';
    current.lastAlertAt = now;
    return;
  }
}

// ─── 폴링 루프 ────────────────────────────────────────────────────────────────

async function processPoll() {
  for (const team of TEAMS) {
    try {
      await checkTeam(team);
    } catch (err) {
      console.error(`[idle-detector] ${team} 처리 오류: ${err.message}`);
    }
  }
}

// ─── 초기화 + 진입점 ──────────────────────────────────────────────────────────

async function main() {
  console.log('[idle-detector] 시작 — 팀 무활동 + tmux 세션 감시 중');
  console.log(`[idle-detector] 감시 팀: ${TEAMS.join(', ')}`);
  console.log(`[idle-detector] 폴링 간격: ${POLL_INTERVAL_MS / 1000}초`);
  console.log(`[idle-detector] stale 임계값: ${IDLE_THRESHOLD_MS / 60000}분`);
  console.log(`[idle-detector] stuck 임계값: ${STUCK_THRESHOLD_MS / 60000}분`);

  // /tmp/cross-team/ 디렉토리 확인
  try {
    mkdirSync(CROSS_TEAM_DIR, { recursive: true });
    for (const team of TEAMS) {
      mkdirSync(join(CROSS_TEAM_DIR, team), { recursive: true });
    }
  } catch (err) {
    console.error(`[idle-detector] 디렉토리 생성 실패: ${err.message}`);
  }

  // 폴링 루프
  while (true) {
    try {
      await processPoll();
    } catch (err) {
      console.error(`[idle-detector] 폴링 오류 (계속 실행): ${err.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch(err => {
  console.error('[idle-detector] 치명적 오류:', err);
  process.exit(1);
});
