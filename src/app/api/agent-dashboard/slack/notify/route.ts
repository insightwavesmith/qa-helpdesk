import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/firebase/auth';
import { sendSlackNotification, resolveChannels, PRIORITY_MAP, CEO_NOTIFY_EVENTS } from '@/lib/slack-notifier';
import { detectChainHandoff } from '@/lib/chain-detector';
import type { SlackNotification, SlackEventType, TeamId } from '@/types/agent-dashboard';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const SLACK_QUEUE_PATH = '/tmp/cross-team/slack/queue.jsonl';

export async function POST(request: NextRequest) {
  // 인증 체크
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { event, team, targetTeam, title, message, metadata } = body;

    // 입력 검증
    if (!event || !team || !title || !message) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'event, team, title, message 필수' },
        { status: 400 }
      );
    }

    const eventType = event as SlackEventType;
    const teamId = team as TeamId;

    // 채널 결정
    const channels = resolveChannels(eventType, teamId, targetTeam);

    // CEO DM 여부
    const ceoNotify = CEO_NOTIFY_EVENTS.includes(eventType);

    // 알림 객체 생성
    const notification: SlackNotification = {
      id: randomUUID(),
      event: eventType,
      priority: PRIORITY_MAP[eventType] || 'normal',
      team: teamId,
      targetTeam,
      title,
      message,
      metadata,
      channels,
      ceoNotify,
      status: 'pending',
    };

    // 슬랙 전송
    await sendSlackNotification(notification);
    notification.status = 'sent';
    notification.sentAt = new Date().toISOString();

    // 큐에 로깅
    try {
      await fs.mkdir(path.dirname(SLACK_QUEUE_PATH), { recursive: true });
      await fs.appendFile(SLACK_QUEUE_PATH, JSON.stringify(notification) + '\n');
    } catch {
      // 로깅 실패는 무시 (알림 자체는 전송됨)
    }

    // 체인 전달 감지 — chain.handoff 이벤트 시 추가 체인 처리
    if (event === 'chain.handoff') {
      const chains = detectChainHandoff(teamId, 'implementation.completed');
      // 체인 규칙이 있으면 이미 요청에서 처리됨
      // 추가 체인이 필요한 경우만 처리
      for (const chain of chains) {
        if (chain.toTeam !== targetTeam) {
          const chainNotification: SlackNotification = {
            id: randomUUID(),
            event: 'chain.handoff',
            priority: 'important',
            team: teamId,
            targetTeam: chain.toTeam,
            title: `체인 전달: ${team}팀 → ${chain.toTeam}팀`,
            message: chain.toAction,
            metadata,
            channels: resolveChannels('chain.handoff', teamId, chain.toTeam),
            ceoNotify: true,
            status: 'pending',
          };
          await sendSlackNotification(chainNotification);
        }
      }
    }

    return NextResponse.json({ ok: true, id: notification.id });
  } catch (err) {
    console.error('[slack/notify] 전송 실패:', err);
    return NextResponse.json(
      { error: 'SEND_FAILED', message: '슬랙 알림 전송 실패' },
      { status: 500 }
    );
  }
}
