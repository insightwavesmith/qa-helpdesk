#!/usr/bin/env node
/**
 * chain-watcher.mjs — 팀 간 체인 전달 감지 데몬
 *
 * /tmp/cross-team/ 디렉토리의 마커 파일을 5초 간격으로 폴링하여
 * 체인 규칙에 매칭되는 핸드오프 이벤트를 슬랙으로 자동 알림.
 *
 * 마커 파일명 규칙:
 *   {team}-{event-type}-done[-suffix].md
 *   예: pm-plan-done.md, cto-impl-done.md
 *
 * 실행 방법:
 *   node scripts/chain-watcher.mjs
 *   pm2 start scripts/chain-watcher.mjs --name chain-watcher
 *
 * 환경변수:
 *   SLACK_BOT_TOKEN — 슬랙 봇 토큰
 *   SLACK_UNIFIED_CHANNEL — 통합 채널 (기본: C0AN7ATS4DD)
 *   SLACK_CEO_USER_ID — CEO DM 전송용
 *   CHAIN_POLL_INTERVAL — 폴링 간격 ms (기본: 5000)
 */

import { readdirSync, statSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// ─── 설정 ────────────────────────────────────────────────────────────────────

const CROSS_TEAM_DIR = '/tmp/cross-team';
const COMM_JSONL = '/tmp/cross-team/comm.jsonl';
const POLL_INTERVAL = parseInt(process.env.CHAIN_POLL_INTERVAL || '5000', 10);
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_UNIFIED_CHANNEL = process.env.SLACK_UNIFIED_CHANNEL || 'C0AN7ATS4DD';
const SLACK_CEO_USER_ID = process.env.SLACK_CEO_USER_ID;

// ─── 체인 규칙 (chain-detector.ts 동일 내용 — mjs에서 ts import 불가) ──────

const CHAIN_RULES = [
  { fromTeam: 'pm', fromEvent: 'plan.completed', toTeam: 'cto', toAction: '구현 착수 필요' },
  { fromTeam: 'pm', fromEvent: 'plan.completed', toTeam: 'marketing', toAction: '검증 준비 필요' },
  { fromTeam: 'cto', fromEvent: 'implementation.completed', toTeam: 'marketing', toAction: '마케팅 검증 시작' },
  { fromTeam: 'marketing', fromEvent: 'review.completed', toTeam: 'pm', toAction: '결과 리뷰 필요' },
];

// ─── 마커 파일명 → 이벤트 매핑 ───────────────────────────────────────────────

const MARKER_PATTERNS = {
  'plan-done': 'plan.completed',
  'impl-done': 'implementation.completed',
  'implementation-done': 'implementation.completed',
  'review-done': 'review.completed',
  'design-done': 'design.completed',
};

// ─── 팀 표시명 ────────────────────────────────────────────────────────────────

const TEAM_DISPLAY = {
  pm: { name: 'PM팀', emoji: '📋' },
  cto: { name: 'CTO팀', emoji: '⚙️' },
  marketing: { name: '마케팅팀', emoji: '📊' },
};

// ─── 상태 ─────────────────────────────────────────────────────────────────────

/** 처리 완료된 마커 (경로 + mtime) */
const processedMarkers = new Map(); // filePath -> mtime

// ─── 마커 파싱 ────────────────────────────────────────────────────────────────

/**
 * 마커 파일명에서 팀 + 이벤트 파싱
 * @param {string} filename - 파일명 (예: pm-plan-done.md)
 * @returns {{ team: string, event: string } | null}
 */
function parseMarker(filename) {
  // .md 확장자 제거
  const base = filename.replace(/\.md$/, '');

  for (const [pattern, event] of Object.entries(MARKER_PATTERNS)) {
    // {team}-{pattern} 또는 {team}-{pattern}-{suffix} 형식 매칭
    const regex = new RegExp(`^([a-z]+)-${pattern}(?:-.*)?$`);
    const match = base.match(regex);
    if (match) {
      return { team: match[1], event };
    }
  }
  return null;
}

// ─── 슬랙 전송 ───────────────────────────────────────────────────────────────

/**
 * 슬랙에 Block Kit 메시지 전송
 * @param {string} channel - 채널 ID 또는 사용자 ID (DM)
 * @param {object[]} blocks - Block Kit 블록 배열
 * @param {string} text - 폴백 텍스트
 */
async function sendSlack(channel, blocks, text) {
  if (!SLACK_BOT_TOKEN) {
    console.log('[chain-watcher] SLACK_BOT_TOKEN 미설정 — 슬랙 전송 스킵');
    return false;
  }

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
      console.error(`[chain-watcher] 슬랙 전송 실패: ${data.error}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[chain-watcher] 슬랙 전송 오류: ${err.message}`);
    return false;
  }
}

/**
 * chain.handoff 이벤트 슬랙 알림 전송
 * @param {string} fromTeam - 출발 팀
 * @param {string} toTeam - 도착 팀
 * @param {string} event - 이벤트 타입
 * @param {string} toAction - 액션 설명
 */
async function sendHandoffNotification(fromTeam, toTeam, event, toAction) {
  const from = TEAM_DISPLAY[fromTeam] || { name: fromTeam, emoji: '🤖' };
  const to = TEAM_DISPLAY[toTeam] || { name: toTeam, emoji: '🤖' };

  const text = `🔗 체인 전달: ${from.emoji} ${from.name} → ${to.emoji} ${to.name} | ${toAction}`;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🔗 팀 간 체인 전달',
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*출발:* ${from.emoji} ${from.name}`,
        },
        {
          type: 'mrkdwn',
          text: `*도착:* ${to.emoji} ${to.name}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*이벤트:* \`${event}\`\n*필요 액션:* ${toAction}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `chain.handoff | ${new Date().toISOString()}`,
        },
      ],
    },
  ];

  console.log(`[chain-watcher] 슬랙 알림 전송: chain.handoff (${from.name}→${to.name})`);

  // 통합 채널 전송
  await sendSlack(SLACK_UNIFIED_CHANNEL, blocks, text);

  // CEO DM 전송 (chain.handoff는 CEO 알림 대상)
  if (SLACK_CEO_USER_ID) {
    await sendSlack(SLACK_CEO_USER_ID, blocks, text);
  }
}

// ─── comm.jsonl 기록 ──────────────────────────────────────────────────────────

/**
 * 핸드오프 이벤트를 comm.jsonl에 append
 * @param {string} fromTeam - 출발 팀
 * @param {string} toTeam - 도착 팀
 * @param {string} toAction - 액션 설명
 */
function appendCommLog(fromTeam, toTeam, toAction) {
  const from = TEAM_DISPLAY[fromTeam] || { name: fromTeam, emoji: '🤖' };

  const entry = {
    time: new Date().toISOString(),
    from: 'chain-watcher',
    to: toTeam,
    msg: `${from.name} ${from.emoji} ${toAction}`,
    team: fromTeam,
    type: 'handoff',
  };

  try {
    appendFileSync(COMM_JSONL, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    console.error(`[chain-watcher] comm.jsonl 기록 실패: ${err.message}`);
  }
}

// ─── 마커 스캔 ────────────────────────────────────────────────────────────────

/**
 * /tmp/cross-team/ 디렉토리에서 *-done*.md 파일 스캔
 * @returns {{ filePath: string, filename: string, mtime: number }[]}
 */
function scanMarkers() {
  const markers = [];

  try {
    const entries = readdirSync(CROSS_TEAM_DIR);

    for (const entry of entries) {
      // {team}-{event-type}-done[-suffix].md 패턴 매칭
      if (!entry.match(/^[a-z]+-.*-done.*\.md$/)) continue;

      const filePath = join(CROSS_TEAM_DIR, entry);

      try {
        const stat = statSync(filePath);
        markers.push({
          filePath,
          filename: entry,
          mtime: stat.mtimeMs,
        });
      } catch {
        // 파일 읽기 실패 무시
      }
    }
  } catch (err) {
    console.error(`[chain-watcher] 디렉토리 스캔 실패: ${err.message}`);
  }

  return markers;
}

// ─── 폴링 루프 ────────────────────────────────────────────────────────────────

/**
 * 새 마커 처리
 */
async function processPoll() {
  const markers = scanMarkers();

  for (const { filePath, filename, mtime } of markers) {
    // 중복 처리 방지: 같은 파일이 동일 mtime이면 스킵
    const prev = processedMarkers.get(filePath);
    if (prev === mtime) continue;

    // 마커 파싱
    const parsed = parseMarker(filename);
    if (!parsed) continue;

    const { team, event } = parsed;
    console.log(`[chain-watcher] 마커 감지: ${filename} → ${event}`);

    // 체인 규칙 매칭
    const matchedRules = CHAIN_RULES.filter(
      r => r.fromTeam === team && r.fromEvent === event
    );

    if (matchedRules.length === 0) {
      console.log(`[chain-watcher] 매칭 규칙 없음: team=${team}, event=${event}`);
    }

    for (const rule of matchedRules) {
      try {
        // 슬랙 알림 전송
        await sendHandoffNotification(rule.fromTeam, rule.toTeam, rule.fromEvent, rule.toAction);

        // comm.jsonl 기록
        appendCommLog(rule.fromTeam, rule.toTeam, rule.toAction);
      } catch (err) {
        console.error(`[chain-watcher] 핸드오프 처리 오류: ${err.message}`);
      }
    }

    // 처리 완료 스냅샷 갱신
    processedMarkers.set(filePath, mtime);
  }
}

// ─── 초기화 + 진입점 ──────────────────────────────────────────────────────────

async function main() {
  console.log('[chain-watcher] 시작 — /tmp/cross-team/ 감시 중');
  console.log(`[chain-watcher] 폴링 간격: ${POLL_INTERVAL}ms`);

  // /tmp/cross-team/ 디렉토리 확인 (mkdir -p)
  try {
    mkdirSync(CROSS_TEAM_DIR, { recursive: true });
    mkdirSync(join(CROSS_TEAM_DIR, 'slack'), { recursive: true });
  } catch (err) {
    console.error(`[chain-watcher] 디렉토리 생성 실패: ${err.message}`);
  }

  // 기존 마커 스냅샷 저장 (시작 시점 이전 파일 중복 처리 방지)
  const existing = scanMarkers();
  for (const { filePath, mtime } of existing) {
    processedMarkers.set(filePath, mtime);
  }
  console.log(`[chain-watcher] 기존 마커 ${existing.length}개 스냅샷 저장`);

  // 폴링 루프
  while (true) {
    try {
      await processPoll();
    } catch (err) {
      console.error(`[chain-watcher] 폴링 오류 (계속 실행): ${err.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

main().catch(err => {
  console.error('[chain-watcher] 치명적 오류:', err);
  process.exit(1);
});
