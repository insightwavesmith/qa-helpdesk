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

const PRIORITY_MAP: Record<SlackEventType, SlackPriority> = {
  "task.started": "normal",
  "task.completed": "normal",
  "chain.handoff": "important",
  "deploy.completed": "important",
  "error.critical": "urgent",
  "approval.needed": "important",
  "pdca.phase_change": "normal",
  "background.completed": "normal",
};

/** 이벤트별 라우팅 규칙 (CEO DM 여부) */
const CEO_NOTIFY_EVENTS: SlackEventType[] = [
  "chain.handoff",
  "deploy.completed",
  "error.critical",
  "approval.needed",
];

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

/** 재시도 래퍼 (최대 3회, Exponential Backoff, 429 Retry-After 대응) */
async function sendWithRetry(
  channelId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: any[],
  text: string,
  maxRetries = 3
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await slack.chat.postMessage({ channel: channelId, blocks, text });
      return { ok: true };
    } catch (err: unknown) {
      const isRateLimit = err instanceof Error && "code" in err && (err as { code: string }).code === "slack_webapi_rate_limited";
      const retryAfter = isRateLimit && err instanceof Error && "retryAfter" in err
        ? (err as { retryAfter: number }).retryAfter
        : undefined;

      if (attempt < maxRetries) {
        const delay = retryAfter ? retryAfter * 1000 : Math.pow(2, attempt - 1) * 1000;
        console.warn(`[slack-notifier] 채널 ${channelId} 재시도 ${attempt}/${maxRetries} (${delay}ms 대기)`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[slack-notifier] 채널 ${channelId} 최종 실패:`, errorMsg);
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

  const blocks = buildSlackBlocks(notification);

  // 1. 팀 채널에 전송 (재시도 포함)
  for (const channelId of notification.channels) {
    if (!channelId) continue;
    const sendResult = await sendWithRetry(channelId, blocks, notification.title);
    if (sendResult.ok) {
      result.channelsSent.push(channelId);
    } else {
      result.failedChannels.push(channelId);
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
