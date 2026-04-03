import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

// ── React Flow 모킹 ──
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return {
    ...actual,
    Handle: () => null,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

import { NotifyNode } from '../../src/components/brick/nodes/NotifyNode';
import { NotifyConfigPanel } from '../../src/components/brick/panels/NotifyConfigPanel';
import { CHANNEL_ADAPTERS } from '../../src/lib/brick/channel-adapter';
import {
  autoLayout,
  NODE_HEIGHT,
  NOTIFY_NODE_HEIGHT,
} from '../../src/lib/brick/layout';
import type { NotifyNodeData, NotifyChannel } from '../../src/components/brick/nodes/types';

// ── 헬퍼 ──
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function expectBorderColor(el: HTMLElement, hexColor: string) {
  const style = el.style.border || el.style.borderColor;
  const expected = [hexColor.toLowerCase(), hexToRgb(hexColor)];
  const match = expected.some((v) => style.includes(v));
  expect(match).toBe(true);
}

function makeNotifyProps(overrides: Partial<NotifyNodeData> = {}) {
  const data: NotifyNodeData = {
    blockType: 'notify',
    label: '테스트 알림',
    status: 'idle',
    channel: 'slack',
    target: '#general',
    events: ['start', 'complete'],
    ...overrides,
  };
  return {
    id: 'notify-1',
    type: 'notify' as const,
    data,
    selected: false,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    deletable: true,
    selectable: true,
    parentId: undefined,
    sourcePosition: undefined,
    targetPosition: undefined,
    width: 240,
    height: 130,
  } as any;
}

function makeNotifyNode(id: string, overrides: Partial<NotifyNodeData> = {}) {
  return {
    id,
    type: 'notify' as const,
    position: { x: 0, y: 0 },
    data: {
      blockType: 'notify' as const,
      label: '알림',
      status: 'idle' as const,
      channel: 'slack' as const,
      target: '#test',
      events: ['complete' as const],
      ...overrides,
    },
  };
}

function renderWithFlow(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

// ── fetch 모킹 ──
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  });
  global.fetch = fetchMock;
});

describe('Phase 6: Notify Block (BF-121 ~ BF-135)', () => {
  // ── BF-121: NotifyNode 남색 테두리 #0EA5E9 렌더링 ──
  it('bf121_notify_node_cyan_border', () => {
    renderWithFlow(<NotifyNode {...makeNotifyProps({ status: 'idle' })} />);
    const node = screen.getByTestId('notify-node');
    expectBorderColor(node, '#0EA5E9');
  });

  // ── BF-122: NotifyNode 채널 아이콘 표시 (Slack/Telegram/Discord/Webhook) ──
  it('bf122_notify_node_channel_icons', () => {
    const channels: NotifyChannel[] = ['slack', 'telegram', 'discord', 'webhook'];
    for (const ch of channels) {
      const { unmount } = renderWithFlow(
        <NotifyNode {...makeNotifyProps({ channel: ch })} />,
      );
      expect(screen.getByTestId(`channel-icon-${ch}`)).toBeDefined();
      unmount();
    }
  });

  // ── BF-123: NotifyNode 이벤트 체크마크 표시 (시작/완료/실패) ──
  it('bf123_notify_node_event_checkmarks', () => {
    renderWithFlow(
      <NotifyNode
        {...makeNotifyProps({ events: ['start', 'complete'] })}
      />,
    );
    const eventsEl = screen.getByTestId('notify-events');
    // start과 complete은 ✓, fail은 ✗
    const startEl = screen.getByTestId('event-start');
    expect(startEl.textContent).toContain('✓');
    expect(startEl.textContent).toContain('시작');

    const completeEl = screen.getByTestId('event-complete');
    expect(completeEl.textContent).toContain('✓');

    const failEl = screen.getByTestId('event-fail');
    expect(failEl.textContent).toContain('✗');
    expect(failEl.textContent).toContain('실패');
  });

  // ── BF-124: NotifyNode 발송 성공 시 초록 테두리 전환 (#10B981) ──
  it('bf124_notify_node_success_green_border', () => {
    renderWithFlow(
      <NotifyNode
        {...makeNotifyProps({ status: 'completed', lastResult: 'success' })}
      />,
    );
    const node = screen.getByTestId('notify-node');
    expectBorderColor(node, '#10B981');
  });

  // ── BF-125: NotifyNode 발송 실패 시 빨간 테두리 + 재시도 버튼 ──
  it('bf125_notify_node_failed_red_border_retry', () => {
    renderWithFlow(
      <NotifyNode
        {...makeNotifyProps({ status: 'failed', lastResult: 'failed' })}
      />,
    );
    const node = screen.getByTestId('notify-node');
    expectBorderColor(node, '#EF4444');
    expect(screen.getByTestId('notify-retry-button')).toBeDefined();
    expect(screen.getByTestId('notify-retry-button').textContent).toBe('재시도');
  });

  // ── BF-126: NotifyNode running 상태 시 pulse 애니메이션 ──
  it('bf126_notify_node_running_pulse', () => {
    renderWithFlow(
      <NotifyNode {...makeNotifyProps({ status: 'running' })} />,
    );
    const node = screen.getByTestId('notify-node');
    expect(node.className).toContain('animate-pulse');
  });

  // ── BF-127: CHANNEL_ADAPTERS 4종 레지스트리 ──
  it('bf127_channel_adapters_registry', () => {
    expect(Object.keys(CHANNEL_ADAPTERS)).toHaveLength(4);
    expect(CHANNEL_ADAPTERS.slack.name).toBe('Slack');
    expect(CHANNEL_ADAPTERS.slack.color).toBe('#4A154B');
    expect(CHANNEL_ADAPTERS.telegram.name).toBe('Telegram');
    expect(CHANNEL_ADAPTERS.telegram.color).toBe('#0088CC');
    expect(CHANNEL_ADAPTERS.discord.name).toBe('Discord');
    expect(CHANNEL_ADAPTERS.discord.color).toBe('#5865F2');
    expect(CHANNEL_ADAPTERS.webhook.name).toBe('Webhook');
    expect(CHANNEL_ADAPTERS.webhook.color).toBe('#6B7280');
  });

  // ── BF-128: NotifyConfigPanel 채널 선택 라디오 4종 ──
  it('bf128_config_panel_channel_radios', () => {
    const node = {
      id: 'n1',
      type: 'notify',
      position: { x: 0, y: 0 },
      data: { blockType: 'notify', label: '알림', channel: 'slack', events: [], target: '' },
    };
    render(<NotifyConfigPanel node={node as any} />);
    expect(screen.getByTestId('channel-radio-slack')).toBeDefined();
    expect(screen.getByTestId('channel-radio-telegram')).toBeDefined();
    expect(screen.getByTestId('channel-radio-discord')).toBeDefined();
    expect(screen.getByTestId('channel-radio-webhook')).toBeDefined();
    // slack이 기본 선택
    expect((screen.getByTestId('channel-radio-slack') as HTMLInputElement).checked).toBe(true);
  });

  // ── BF-129: NotifyConfigPanel Slack 설정 ──
  it('bf129_config_panel_slack_settings', () => {
    const node = {
      id: 'n1',
      type: 'notify',
      position: { x: 0, y: 0 },
      data: { blockType: 'notify', label: '알림', channel: 'slack', events: [], target: '' },
    };
    render(<NotifyConfigPanel node={node as any} />);
    // Slack 선택 상태 → Slack 설정 필드 보임
    expect(screen.getByTestId('slack-config')).toBeDefined();
    expect(screen.getByTestId('slack-target')).toBeDefined();
    expect(screen.getByTestId('slack-method-webhook')).toBeDefined();
    expect(screen.getByTestId('slack-method-bot')).toBeDefined();
    expect(screen.getByTestId('slack-url')).toBeDefined();
  });

  // ── BF-130: NotifyConfigPanel Telegram 설정 ──
  it('bf130_config_panel_telegram_settings', () => {
    const node = {
      id: 'n1',
      type: 'notify',
      position: { x: 0, y: 0 },
      data: { blockType: 'notify', label: '알림', channel: 'telegram', events: [], target: '' },
    };
    render(<NotifyConfigPanel node={node as any} />);
    // Telegram이 기본 → Telegram 설정 보임
    expect(screen.getByTestId('telegram-config')).toBeDefined();
    expect(screen.getByTestId('telegram-bot-token')).toBeDefined();
    expect(screen.getByTestId('telegram-chat-id')).toBeDefined();
  });

  // ── BF-131: NotifyConfigPanel Discord 설정 ──
  it('bf131_config_panel_discord_settings', () => {
    const node = {
      id: 'n1',
      type: 'notify',
      position: { x: 0, y: 0 },
      data: { blockType: 'notify', label: '알림', channel: 'discord', events: [], target: '' },
    };
    render(<NotifyConfigPanel node={node as any} />);
    expect(screen.getByTestId('discord-config')).toBeDefined();
    expect(screen.getByTestId('discord-webhook-url')).toBeDefined();
  });

  // ── BF-132: NotifyConfigPanel Webhook 설정 ──
  it('bf132_config_panel_webhook_settings', () => {
    const node = {
      id: 'n1',
      type: 'notify',
      position: { x: 0, y: 0 },
      data: { blockType: 'notify', label: '알림', channel: 'webhook', events: [], target: '' },
    };
    render(<NotifyConfigPanel node={node as any} />);
    expect(screen.getByTestId('webhook-config')).toBeDefined();
    expect(screen.getByTestId('webhook-url')).toBeDefined();
    expect(screen.getByTestId('webhook-headers')).toBeDefined();
    expect(screen.getByTestId('webhook-payload')).toBeDefined();
  });

  // ── BF-133: NotifyConfigPanel 이벤트 체크박스 (시작/완료/실패) ──
  it('bf133_config_panel_event_checkboxes', () => {
    const node = {
      id: 'n1',
      type: 'notify',
      position: { x: 0, y: 0 },
      data: { blockType: 'notify', label: '알림', channel: 'slack', events: ['start'], target: '' },
    };
    render(<NotifyConfigPanel node={node as any} />);
    const startCb = screen.getByTestId('event-checkbox-start') as HTMLInputElement;
    const completeCb = screen.getByTestId('event-checkbox-complete') as HTMLInputElement;
    const failCb = screen.getByTestId('event-checkbox-fail') as HTMLInputElement;

    expect(startCb.checked).toBe(true);
    expect(completeCb.checked).toBe(false);
    expect(failCb.checked).toBe(false);

    // 체크박스 토글
    fireEvent.click(completeCb);
    expect(completeCb.checked).toBe(true);
  });

  // ── BF-134: NotifyConfigPanel 테스트 발송 버튼 → API 호출 ──
  it('bf134_config_panel_test_send_button', async () => {
    const node = {
      id: 'n1',
      type: 'notify',
      position: { x: 0, y: 0 },
      data: { blockType: 'notify', label: '알림', channel: 'slack', events: ['complete'], target: '#test' },
    };
    render(<NotifyConfigPanel node={node as any} />);
    const btn = screen.getByTestId('test-send-button');
    expect(btn.textContent).toBe('테스트 발송');

    fireEvent.click(btn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/brick/notify/test', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  // ── BF-135: autoLayout NotifyNode 높이 130px 반영 ──
  it('bf135_auto_layout_notify_height', () => {
    expect(NOTIFY_NODE_HEIGHT).toBe(130);

    const nodes = [
      { id: 'block-1', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'implement', label: '구현', status: 'idle' } },
      { id: 'notify-1', type: 'notify', position: { x: 0, y: 0 }, data: { blockType: 'notify', label: '알림', status: 'idle', channel: 'slack', target: '', events: [] } },
    ];
    const edges = [{ id: 'e1', source: 'block-1', target: 'notify-1' }];

    const result = autoLayout(nodes as any, edges);
    const blockNode = result.find((n) => n.id === 'block-1')!;
    const notifyNode = result.find((n) => n.id === 'notify-1')!;

    // notify 노드가 block 노드보다 아래에 위치해야 함 (TB 방향)
    expect(notifyNode.position.y).toBeGreaterThan(blockNode.position.y);
    // 서로 다른 높이가 적용되었는지 확인 (100 vs 130)
    expect(NODE_HEIGHT).toBe(100);
    expect(NOTIFY_NODE_HEIGHT).toBe(130);
  });
});
