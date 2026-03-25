import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/firebase/auth';
import { sendSlackNotification, resolveChannels, PRIORITY_MAP, CEO_NOTIFY_EVENTS } from '@/lib/slack-notifier';
import { detectChainHandoff } from '@/lib/chain-detector';
import type { SlackNotification, SlackEventType, TeamId } from '@/types/agent-dashboard';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const SLACK_QUEUE_PATH = '/tmp/cross-team/slack/queue.jsonl';

const VALID_EVENTS: SlackEventType[] = [
  'task.started', 'task.completed', 'chain.handoff', 'deploy.completed',
  'error.critical', 'approval.needed', 'pdca.phase_change', 'background.completed',
];
const VALID_TEAMS: TeamId[] = ['pm', 'marketing', 'cto'];

export async function POST(request: NextRequest) {
  // 인증 체크
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'UNAUTHORIZED', message: 'admin 권한이 필요합니다' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { event, team, targetTeam, title, message, metadata } = body;

    // ── 필드별 개별 검증 ──
    if (!event || !VALID_EVENTS.includes(event as SlackEventType)) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_EVENT_TYPE', message: `event 필드가 유효하지 않습니다: '${event}'` },
        { status: 400 }
      );
    }
    if (!team || !VALID_TEAMS.includes(team as TeamId)) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_TEAM', message: `team 필드가 유효하지 않습니다: '${team}'` },
        { status: 400 }
      );
    }
    if (!title || typeof title !== 'string' || title.length > 200) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_TITLE', message: 'title은 1~200자 문자열이어야 합니다' },
        { status: 400 }
      );
    }
    if (!message || typeof message !== 'string' || message.length > 3000) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_MESSAGE', message: 'message는 1~3000자 문자열이어야 합니다' },
        { status: 400 }
      );
    }
    if (event === 'chain.handoff') {
      if (!targetTeam || !VALID_TEAMS.includes(targetTeam as TeamId)) {
        return NextResponse.json(
          { ok: false, error: 'MISSING_TARGET_TEAM', message: 'chain.handoff 이벤트는 targetTeam이 필수입니다' },
          { status: 400 }
        );
      }
      if (targetTeam === team) {
        return NextResponse.json(
          { ok: false, error: 'MISSING_TARGET_TEAM', message: 'targetTeam은 team과 달라야 합니다' },
          { status: 400 }
        );
      }
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

    // 슬랙 전송 (부분 실패 정보 포함)
    const sendResult = await sendSlackNotification(notification);
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

    // 부분 실패 시 207 반환
    if (sendResult.failedChannels.length > 0 && sendResult.channelsSent.length > 0) {
      return NextResponse.json({
        ok: true,
        notificationId: notification.id,
        channelsSent: sendResult.channelsSent,
        failedChannels: sendResult.failedChannels,
        ceoNotified: sendResult.ceoNotified,
        sentAt: notification.sentAt,
      }, { status: 207 });
    }

    // 전체 실패
    if (sendResult.failedChannels.length > 0 && sendResult.channelsSent.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'SLACK_SEND_FAILED',
        message: '모든 채널 전송에 실패했습니다',
        failedChannels: sendResult.failedChannels,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      notificationId: notification.id,
      channelsSent: sendResult.channelsSent,
      ceoNotified: sendResult.ceoNotified,
      sentAt: notification.sentAt,
    });
  } catch (err) {
    console.error('[slack/notify] 전송 실패:', err);
    return NextResponse.json(
      { ok: false, error: 'SLACK_SEND_FAILED', message: '슬랙 알림 전송 실패' },
      { status: 500 }
    );
  }
}
