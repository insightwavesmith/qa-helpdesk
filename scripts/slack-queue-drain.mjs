#!/usr/bin/env node
/**
 * slack-queue-drain.mjs — 슬랙 큐 재전송 스크립트
 *
 * /tmp/cross-team/slack/queue.jsonl 파일에서 status: "queued" 항목을 읽어
 * Slack API로 재전송 시도한다. 1msg/sec Rate Limit 준수.
 *
 * 성공 → status: "sent"
 * 실패 → retryCount 증가, retryCount >= 5이면 status: "failed"
 *
 * 실행 방법:
 *   node scripts/slack-queue-drain.mjs
 *   크론 등록 예: 0 * * * * node /path/to/scripts/slack-queue-drain.mjs
 *
 * 환경변수:
 *   SLACK_BOT_TOKEN — 슬랙 봇 토큰 (필수)
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// ─── 설정 ────────────────────────────────────────────────────────────────────

const QUEUE_PATH = '/tmp/cross-team/slack/queue.jsonl';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const MAX_RETRY_COUNT = 5;     // 이 횟수 도달 시 "failed"로 최종 처리
const SEND_INTERVAL_MS = 1000; // Slack 1msg/sec Rate Limit 준수

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

/**
 * ms만큼 비동기 대기
 * @param {number} ms - 대기 시간 (밀리초)
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── queue.jsonl 입출력 ───────────────────────────────────────────────────────

/**
 * queue.jsonl 읽기 — 파일이 없으면 빈 배열 반환
 * @returns {object[]}
 */
function readQueue() {
  if (!existsSync(QUEUE_PATH)) {
    return [];
  }

  const raw = readFileSync(QUEUE_PATH, 'utf8');
  const lines = raw.split('\n').filter(line => line.trim() !== '');

  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      entries.push(JSON.parse(lines[i]));
    } catch {
      // 파싱 불가 라인 스킵 (손상된 항목)
      console.warn(`[drain] 라인 ${i + 1} 파싱 실패 — 스킵`);
    }
  }

  return entries;
}

/**
 * queue.jsonl 저장 — 원자적 쓰기 (.tmp → rename 패턴으로 기존 파일 손상 방지)
 * @param {object[]} entries - 저장할 항목 배열
 */
function saveQueue(entries) {
  // 디렉토리 없으면 생성
  const dir = dirname(QUEUE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // 각 항목을 JSONL 형식으로 직렬화
  const content = entries.map(e => JSON.stringify(e)).join('\n') + (entries.length > 0 ? '\n' : '');

  // .tmp 파일에 먼저 쓴 후 rename (기존 파일 손상 방지 패턴)
  const tmpPath = QUEUE_PATH + '.tmp';
  writeFileSync(tmpPath, content, 'utf8');
  renameSync(tmpPath, QUEUE_PATH);
}

// ─── Slack API 전송 ───────────────────────────────────────────────────────────

/**
 * Slack chat.postMessage API 호출 (native fetch 사용 — @slack/web-api 미사용)
 * @param {string} channel - 채널 ID 또는 사용자 ID (DM)
 * @param {string} text - 메시지 텍스트 (폴백)
 * @param {object[]} [blocks] - Block Kit 블록 배열 (선택)
 * @returns {Promise<{ ok: boolean, rateLimited: boolean, errorCode?: string }>}
 */
async function sendToSlack(channel, text, blocks) {
  if (!SLACK_BOT_TOKEN) {
    return { ok: false, rateLimited: false, errorCode: 'NO_TOKEN' };
  }

  try {
    const body = { channel, text };
    if (blocks && blocks.length > 0) {
      body.blocks = blocks;
    }

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    // 429 Rate Limit 응답
    if (res.status === 429) {
      return { ok: false, rateLimited: true, errorCode: 'RATE_LIMITED' };
    }

    const data = await res.json();

    if (!data.ok) {
      return { ok: false, rateLimited: false, errorCode: data.error || 'SLACK_ERROR' };
    }

    return { ok: true, rateLimited: false };
  } catch (err) {
    return { ok: false, rateLimited: false, errorCode: `NETWORK_ERROR: ${err.message}` };
  }
}

// ─── 큐 처리 ─────────────────────────────────────────────────────────────────

/**
 * queue.jsonl에서 "queued" 항목을 찾아 재전송 시도
 * 처리 결과에 따라 status / retryCount / 타임스탬프 갱신 후 저장
 */
async function drainQueue() {
  const entries = readQueue();

  // "queued" 항목 필터
  const pendingCount = entries.filter(e => e.status === 'queued').length;

  if (pendingCount === 0) {
    console.log('[drain] 처리할 큐 항목 없음 — 종료');
    return;
  }

  console.log(`[drain] 큐 항목 ${pendingCount}개 처리 시작`);

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let shouldStop = false; // Rate Limit 발생 시 나머지 항목 중단 플래그

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // "queued" 상태가 아닌 항목은 스킵 (sent, failed 등)
    if (entry.status !== 'queued') continue;

    // Rate Limit으로 중단된 경우 나머지 항목 전부 스킵
    if (shouldStop) {
      skippedCount++;
      continue;
    }

    const currentRetry = entry.retryCount ?? 0;

    // 이미 최대 재시도 횟수 초과된 항목 → "failed" 처리
    if (currentRetry >= MAX_RETRY_COUNT) {
      console.log(`[drain] 항목 ${entry.id} — 최대 재시도 초과 (${currentRetry}회), failed 처리`);
      entries[i] = {
        ...entry,
        status: 'failed',
        lastAttemptAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
      };
      failedCount++;
      continue;
    }

    // 전송할 채널 목록 확인 (SlackNotification 구조: channels 배열)
    const channels = entry.channels ?? [];
    if (channels.length === 0) {
      console.log(`[drain] 항목 ${entry.id} — 채널 정보 없음, failed 처리`);
      entries[i] = {
        ...entry,
        status: 'failed',
        retryCount: currentRetry + 1,
        lastAttemptAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
      };
      failedCount++;
      continue;
    }

    // 채널별 순차 전송 시도
    let atLeastOneSent = false;
    let rateLimitHit = false;

    for (let ci = 0; ci < channels.length; ci++) {
      const channel = channels[ci];

      // 채널 간 1초 간격 (Slack Rate Limit 준수)
      if (ci > 0) {
        await sleep(SEND_INTERVAL_MS);
      }

      const result = await sendToSlack(channel, entry.title ?? entry.message, entry.blocks);

      if (result.ok) {
        atLeastOneSent = true;
        console.log(`[drain] 항목 ${entry.id} 채널 ${channel} 전송 성공`);
      } else if (result.rateLimited) {
        rateLimitHit = true;
        console.warn(`[drain] 항목 ${entry.id} 채널 ${channel} Rate Limit — 처리 중단`);
        break; // Rate Limit 시 이 항목의 나머지 채널 처리 중단
      } else {
        console.warn(`[drain] 항목 ${entry.id} 채널 ${channel} 전송 실패: ${result.errorCode}`);
      }
    }

    // Rate Limit 발생 → 현재 항목 retryCount만 증가, 이후 항목 처리 중단
    if (rateLimitHit) {
      entries[i] = {
        ...entry,
        retryCount: currentRetry + 1,
        lastAttemptAt: new Date().toISOString(),
      };
      shouldStop = true; // 다음 루프 반복부터 스킵
      console.log('[drain] Rate Limit — 남은 항목 다음 실행으로 연기');
      continue;
    }

    const newRetryCount = currentRetry + 1;

    if (atLeastOneSent) {
      // 최소 1개 채널 전송 성공 → "sent" 처리
      entries[i] = {
        ...entry,
        status: 'sent',
        retryCount: newRetryCount,
        lastAttemptAt: new Date().toISOString(),
        sentAt: new Date().toISOString(),
      };
      sentCount++;
      console.log(`[drain] 항목 ${entry.id} 전송 성공 (${newRetryCount}회 시도)`);
    } else if (newRetryCount >= MAX_RETRY_COUNT) {
      // 최대 재시도 횟수 도달 → "failed" 최종 처리
      entries[i] = {
        ...entry,
        status: 'failed',
        retryCount: newRetryCount,
        lastAttemptAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
      };
      failedCount++;
      console.log(`[drain] 항목 ${entry.id} 최대 재시도 도달 (${newRetryCount}회) — failed 처리`);
    } else {
      // 아직 재시도 여지 있음 → retryCount만 증가 후 다음 실행 때 재시도
      entries[i] = {
        ...entry,
        retryCount: newRetryCount,
        lastAttemptAt: new Date().toISOString(),
      };
      console.log(`[drain] 항목 ${entry.id} 전송 실패 — 다음 실행 때 재시도 (retryCount: ${newRetryCount})`);
    }

    // 항목 간 1초 간격 (마지막 항목 제외)
    if (i < entries.length - 1) {
      await sleep(SEND_INTERVAL_MS);
    }
  }

  // 변경된 내용 파일에 저장
  saveQueue(entries);

  console.log(
    `[drain] 완료 — 전송 성공: ${sentCount}개, 실패: ${failedCount}개, 스킵: ${skippedCount}개`
  );
}

// ─── 진입점 ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('[drain] 슬랙 큐 drain 시작');

  if (!SLACK_BOT_TOKEN) {
    console.error('[drain] 오류: SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다');
    process.exit(1);
  }

  await drainQueue();

  console.log('[drain] drain 완료');
}

main().catch(err => {
  console.error('[drain] 치명적 오류:', err);
  process.exit(1);
});
