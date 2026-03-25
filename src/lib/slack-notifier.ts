import { WebClient } from "@slack/web-api";
import type {
  SlackNotification,
  SlackEventType,
  SlackPriority,
  SlackChannelConfig,
  TeamId,
} from "@/types/agent-dashboard";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const CHANNELS: SlackChannelConfig = {
  pm: process.env.SLACK_CHANNEL_PM || "",
  marketing: process.env.SLACK_CHANNEL_MARKETING || "",
  cto: process.env.SLACK_CHANNEL_CTO || "",
  ceoUserId: process.env.SLACK_CEO_USER_ID || "",
};

/** 통합 채널 (설정 시 모든 이벤트가 이 채널로 전송, fallback으로 팀별 채널) */
const UNIFIED_CHANNEL = process.env.SLACK_UNIFIED_CHANNEL || "";

/** 서킷 브레이커 — 5회 연속 실패 시 2분간 전송 차단 */
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_BLOCK_MS = 120_000; // 2분

interface CircuitBreakerState {
  consecutiveFailures: number;
  lastFailureAt: number;
  openUntil: number | null;
  isOpen: boolean;
}

const circuitBreaker: CircuitBreakerState = {
  consecutiveFailures: 0,
  lastFailureAt: 0,
  openUntil: null,
  isOpen: false,
};

const PRIORITY_MAP: Record<SlackEventType, SlackPriority> = {
  "task.started": "normal",
  "task.completed": "normal",
  "chain.handoff": "important",
  "deploy.completed": "important",
  "error.critical": "urgent",
  "approval.needed": "important",
  "pdca.phase_change": "normal",
  "background.completed": "normal",
  "team.idle": "normal",        // 3회 연속 시 important로 동적 변경
  "team.recovered": "normal",
  "session.crashed": "urgent",
};

/** 이벤트별 라우팅 규칙 (CEO DM 여부) */
const CEO_NOTIFY_EVENTS: SlackEventType[] = [
  "chain.handoff",
  "deploy.completed",
  "error.critical",
  "approval.needed",
  "session.crashed",
  // team.idle은 3회 연속 시만 → 호출자가 ceoNotify=true로 설정
];

/** 서킷 브레이커 상태 확인 (half-open 자동 전환 포함) */
function isCircuitOpen(): boolean {
  if (!circuitBreaker.isOpen) return false;
  if (circuitBreaker.openUntil && Date.now() > circuitBreaker.openUntil) {
    // half-open: 차단 시간 경과 → 한 번 시도 허용
    circuitBreaker.isOpen = false;
    circuitBreaker.consecutiveFailures = 0;
    console.log("[slack-notifier] 서킷 브레이커 HALF-OPEN → 전송 재시도 허용");
    return false;
  }
  return true;
}

/** 전송 결과에 따른 서킷 브레이커 상태 갱신 */
function updateCircuitBreaker(success: boolean): void {
  if (success) {
    if (circuitBreaker.consecutiveFailures > 0) {
      console.log("[slack-notifier] 서킷 브레이커 RESET (전송 성공)");
    }
    circuitBreaker.consecutiveFailures = 0;
    circuitBreaker.isOpen = false;
    circuitBreaker.openUntil = null;
    return;
  }

  circuitBreaker.consecutiveFailures++;
  circuitBreaker.lastFailureAt = Date.now();

  if (circuitBreaker.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.isOpen = true;
    circuitBreaker.openUntil = Date.now() + CIRCUIT_BREAKER_BLOCK_MS;
    console.error(
      `[slack-notifier] 서킷 브레이커 OPEN — ${CIRCUIT_BREAKER_THRESHOLD}회 연속 실패, ${CIRCUIT_BREAKER_BLOCK_MS / 1000}초간 전송 차단`
    );
  }
}

/** 팀 표시명 */
const TEAM_DISPLAY: Record<TeamId, { name: string; emoji: string }> = {
  pm: { name: "PM팀", emoji: "📋" },
  cto: { name: "CTO팀", emoji: "⚙️" },
  marketing: { name: "마케팅팀", emoji: "📊" },
};

/** Block Kit 메시지 빌더 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSlackBlocks(notification: SlackNotification): any[] {
  const emojiMap: Record<SlackEventType, string> = {
    "task.started": "🚀",
    "task.completed": "✅",
    "chain.handoff": "🔗",
    "deploy.completed": "🚢",
    "error.critical": "🚨",
    "approval.needed": "🔔",
    "pdca.phase_change": "📊",
    "background.completed": "⏳",
    "team.idle": "⚠️",
    "team.recovered": "✅",
    "session.crashed": "🚨",
  };
  const emoji = emojiMap[notification.event];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} ${notification.title}`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: notification.message },
    },
  ];

  // chain.handoff: 발신팀/수신팀 fields 블록 추가
  if (notification.event === "chain.handoff" && notification.targetTeam) {
    const from = TEAM_DISPLAY[notification.team];
    const to = TEAM_DISPLAY[notification.targetTeam];
    blocks.push({
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*발신 팀:*\n${from.name} (${from.emoji})` },
        { type: "mrkdwn", text: `*수신 팀:*\n${to.name} (${to.emoji})` },
      ],
    });
  }

  // error.critical: 에러 메시지를 코드 블록으로 표시
  if (notification.event === "error.critical" && notification.metadata?.errorMessage) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `\`\`\`\n${notification.metadata.errorMessage}\n\`\`\`` },
    });
  }

  // team.idle: 무활동 시간 및 연속 감지 횟수 표시
  if (notification.event === "team.idle") {
    const mins = notification.metadata?.idleMinutes || 5;
    const count = notification.metadata?.staleCount || 1;
    blocks.push({
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: `⏱ 무활동: *${mins}분* | 연속 감지: *${count}회* | 마지막 활동: ${notification.metadata?.lastActivity || '불명'}`,
      }],
    });
  }

  // team.recovered: 복구 안내
  if (notification.event === "team.recovered") {
    blocks.push({
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: `✅ 이전 상태에서 복구됨`,
      }],
    });
  }

  // session.crashed: 복구 명령 및 checkpoint 안내
  if (notification.event === "session.crashed") {
    const tmux = notification.metadata?.tmuxSession || `sdk-${notification.team}`;
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `복구 명령:\n\`\`\`tmux new-session -s ${tmux}\`\`\`` },
    });
    blocks.push({
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: `💾 Checkpoint: ${notification.metadata?.lastActivity ? '존재 (복구 가능)' : '없음'}`,
      }],
    });
  }

  // context (feature, matchRate)
  if (notification.metadata?.feature) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contextElements: any[] = [
      {
        type: "mrkdwn",
        text: `📋 Feature: *${notification.metadata.feature}*`,
      },
    ];
    if (notification.metadata.matchRate !== undefined) {
      contextElements.push({
        type: "mrkdwn",
        text: `📊 Match Rate: *${notification.metadata.matchRate}%*`,
      });
    }
    blocks.push({ type: "context", elements: contextElements });
  }

  // chain.handoff: divider 추가
  if (notification.event === "chain.handoff") {
    blocks.push({ type: "divider" });
  }

  // actions (대시보드 버튼)
  if (notification.metadata?.dashboardUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "대시보드에서 보기", emoji: true },
          url: notification.metadata.dashboardUrl,
          style: notification.priority === "urgent" ? "danger" : "primary",
        },
      ],
    });
  }

  return blocks;
}

/** 큐 파일 경로 */
const SLACK_QUEUE_PATH = "/tmp/cross-team/slack/queue.jsonl";

/** 큐에 항목 적재 (429 지속 실패 시 fallback) */
async function enqueueNotification(
  channelId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: any[],
  text: string
): Promise<void> {
  try {
    const { promises: fs } = await import("fs");
    const path = await import("path");
    const { randomUUID } = await import("crypto");
    await fs.mkdir(path.dirname(SLACK_QUEUE_PATH), { recursive: true });
    const entry = {
      id: randomUUID(),
      channelId,
      blocks,
      text,
      queuedAt: new Date().toISOString(),
      status: "queued",
      retryCount: 0,
    };
    await fs.appendFile(SLACK_QUEUE_PATH, JSON.stringify(entry) + "\n");
    console.warn(`[slack-notifier] 채널 ${channelId} 큐에 적재 (429 지속)`);
  } catch (queueErr) {
    console.error("[slack-notifier] 큐 적재 실패:", queueErr);
  }
}

/** 재시도 래퍼 (최대 3회, Exponential Backoff, 429 Retry-After 대응) */
async function sendWithRetry(
  channelId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: any[],
  text: string,
  maxRetries = 3
): Promise<{ ok: boolean; error?: string }> {
  let allRateLimit = true; // 모든 실패가 429인지 추적

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await slack.chat.postMessage({ channel: channelId, blocks, text });
      return { ok: true };
    } catch (err: unknown) {
      const isRateLimit = err instanceof Error && "code" in err && (err as { code: string }).code === "slack_webapi_rate_limited";
      const retryAfter = isRateLimit && err instanceof Error && "retryAfter" in err
        ? (err as { retryAfter: number }).retryAfter
        : undefined;

      if (!isRateLimit) allRateLimit = false;

      if (attempt < maxRetries) {
        const delay = retryAfter ? retryAfter * 1000 : Math.pow(2, attempt - 1) * 1000;
        console.warn(`[slack-notifier] 채널 ${channelId} 재시도 ${attempt}/${maxRetries} (${delay}ms 대기)`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[slack-notifier] 채널 ${channelId} 최종 실패:`, errorMsg);

        // 모든 실패가 429(Rate Limit)이면 큐에 적재
        if (allRateLimit && isRateLimit) {
          await enqueueNotification(channelId, blocks, text);
        }

        return { ok: false, error: errorMsg };
      }
    }
  }
  return { ok: false, error: "max retries exceeded" };
}

/** 채널 결정 (통합 채널 우선, fallback 팀별 채널) */
export function resolveChannels(
  event: SlackEventType,
  team: TeamId,
  targetTeam?: TeamId
): string[] {
  // 통합 채널이 설정되어 있으면 우선 사용
  if (UNIFIED_CHANNEL) {
    return [UNIFIED_CHANNEL];
  }

  const channels: string[] = [];
  if (CHANNELS[team]) channels.push(CHANNELS[team]);

  // chain.handoff는 양쪽 팀 채널
  if (event === "chain.handoff" && targetTeam && CHANNELS[targetTeam]) {
    channels.push(CHANNELS[targetTeam]);
  }

  return channels.filter(Boolean);
}

/** 전송 결과 타입 */
export interface SlackSendResult {
  channelsSent: string[];
  failedChannels: string[];
  ceoNotified: boolean;
}

/** 메인 전송 함수 (부분 실패 정보 반환) */
export async function sendSlackNotification(
  notification: SlackNotification
): Promise<SlackSendResult> {
  const result: SlackSendResult = {
    channelsSent: [],
    failedChannels: [],
    ceoNotified: false,
  };

  if (!process.env.SLACK_BOT_TOKEN) {
    console.warn("[slack-notifier] SLACK_BOT_TOKEN 미설정, 알림 건너뜀");
    return result;
  }

  // 서킷 브레이커 체크
  if (isCircuitOpen()) {
    console.warn("[slack-notifier] 서킷 브레이커 OPEN — 전송 차단 중, 큐에 적재");
    const blocks = buildSlackBlocks(notification);
    for (const channelId of notification.channels) {
      if (channelId) {
        await enqueueNotification(channelId, blocks, notification.title);
      }
    }
    return result;
  }

  const blocks = buildSlackBlocks(notification);

  // 1. 팀 채널에 전송 (재시도 포함, 채널 간 1초 간격 — Slack API Rate Limit 1msg/sec 대응)
  for (let i = 0; i < notification.channels.length; i++) {
    const channelId = notification.channels[i];
    if (!channelId) continue;
    // 두 번째 채널부터 1초 간격 (chain.handoff 등 다중 채널 전송 시)
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const sendResult = await sendWithRetry(channelId, blocks, notification.title);
    if (sendResult.ok) {
      result.channelsSent.push(channelId);
      updateCircuitBreaker(true);
    } else {
      result.failedChannels.push(channelId);
      updateCircuitBreaker(false);
    }
  }

  // 2. CEO DM 전송 (중요/긴급만, 재시도 포함)
  if (notification.ceoNotify && CHANNELS.ceoUserId) {
    const ceoResult = await sendWithRetry(
      CHANNELS.ceoUserId,
      blocks,
      `[${notification.priority.toUpperCase()}] ${notification.title}`
    );
    result.ceoNotified = ceoResult.ok;
  }

  return result;
}

export { CHANNELS, PRIORITY_MAP, CEO_NOTIFY_EVENTS };
