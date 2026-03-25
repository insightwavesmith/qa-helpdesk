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
      text: { type: "plain_text", text: `${emoji} ${notification.title}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: notification.message },
    },
  ];

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

  if (notification.metadata?.dashboardUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "대시보드에서 보기" },
          url: notification.metadata.dashboardUrl,
          style: notification.priority === "urgent" ? "danger" : "primary",
        },
      ],
    });
  }

  return blocks;
}

/** 채널 결정 */
export function resolveChannels(
  event: SlackEventType,
  team: TeamId,
  targetTeam?: TeamId
): string[] {
  const channels: string[] = [];
  if (CHANNELS[team]) channels.push(CHANNELS[team]);

  // chain.handoff는 양쪽 팀 채널
  if (event === "chain.handoff" && targetTeam && CHANNELS[targetTeam]) {
    channels.push(CHANNELS[targetTeam]);
  }

  return channels.filter(Boolean);
}

/** 메인 전송 함수 */
export async function sendSlackNotification(
  notification: SlackNotification
): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.warn("[slack-notifier] SLACK_BOT_TOKEN 미설정, 알림 건너뜀");
    return;
  }

  const blocks = buildSlackBlocks(notification);

  // 1. 팀 채널에 전송
  for (const channelId of notification.channels) {
    if (!channelId) continue;
    try {
      await slack.chat.postMessage({
        channel: channelId,
        blocks,
        text: notification.title,
      });
    } catch (err) {
      console.error(`[slack-notifier] 채널 ${channelId} 전송 실패:`, err);
    }
  }

  // 2. CEO DM 전송 (중요/긴급만)
  if (notification.ceoNotify && CHANNELS.ceoUserId) {
    try {
      await slack.chat.postMessage({
        channel: CHANNELS.ceoUserId,
        blocks,
        text: `[${notification.priority.toUpperCase()}] ${notification.title}`,
      });
    } catch (err) {
      console.error("[slack-notifier] CEO DM 전송 실패:", err);
    }
  }
}

export { CHANNELS, PRIORITY_MAP, CEO_NOTIFY_EVENTS };
