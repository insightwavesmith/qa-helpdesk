import { useState } from 'react';
import type { Node } from '@xyflow/react';
import type { NotifyChannel, NotifyEvent, NotifyNodeData } from '../nodes/types';
import { CHANNEL_ADAPTERS, NOTIFY_CHANNEL_LIST } from '../../../lib/brick/channel-adapter';

interface NotifyConfigPanelProps {
  node: Node;
  onUpdate?: (data: Partial<NotifyNodeData>) => void;
}

const EVENT_OPTIONS: { value: NotifyEvent; label: string }[] = [
  { value: 'start', label: '시작' },
  { value: 'complete', label: '완료' },
  { value: 'fail', label: '실패' },
];

export function NotifyConfigPanel({ node, onUpdate }: NotifyConfigPanelProps) {
  const data = node.data as NotifyNodeData;
  const [channel, setChannel] = useState<NotifyChannel>(data.channel ?? 'slack');
  const [events, setEvents] = useState<NotifyEvent[]>(data.events ?? []);
  const [target, setTarget] = useState(data.target ?? '');
  const [slackMethod, setSlackMethod] = useState<'webhook' | 'bot'>('webhook');
  const [slackUrl, setSlackUrl] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [discordUrl, setDiscordUrl] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookHeaders, setWebhookHeaders] = useState('');
  const [webhookPayload, setWebhookPayload] = useState('');
  const [testSending, setTestSending] = useState(false);

  const handleChannelChange = (ch: NotifyChannel) => {
    setChannel(ch);
    onUpdate?.({ channel: ch });
  };

  const handleEventToggle = (evt: NotifyEvent) => {
    const next = events.includes(evt)
      ? events.filter((e) => e !== evt)
      : [...events, evt];
    setEvents(next);
    onUpdate?.({ events: next });
  };

  const handleTestSend = async () => {
    setTestSending(true);
    try {
      await fetch('/api/brick/notify/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, target, events }),
      });
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div data-testid="notify-config-panel" className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">알림 설정</h3>

      {/* 채널 선택 */}
      <fieldset data-testid="channel-selection">
        <legend className="text-xs font-medium text-gray-600 mb-2">채널</legend>
        <div className="flex flex-col gap-1.5">
          {NOTIFY_CHANNEL_LIST.map((ch) => {
            const adapter = CHANNEL_ADAPTERS[ch];
            return (
              <label key={ch} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="notify-channel"
                  value={ch}
                  checked={channel === ch}
                  onChange={() => handleChannelChange(ch)}
                  data-testid={`channel-radio-${ch}`}
                />
                <span style={{ color: adapter.color }}>{adapter.name}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* 채널별 설정 */}
      <div data-testid="channel-config">
        {channel === 'slack' && (
          <div data-testid="slack-config" className="space-y-2">
            <div>
              <label className="text-xs text-gray-600">대상 채널</label>
              <input
                type="text"
                data-testid="slack-target"
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="#channel"
                value={target}
                onChange={(e) => { setTarget(e.target.value); onUpdate?.({ target: e.target.value }); }}
              />
            </div>
            <div className="flex gap-3">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  name="slack-method"
                  value="webhook"
                  checked={slackMethod === 'webhook'}
                  onChange={() => setSlackMethod('webhook')}
                  data-testid="slack-method-webhook"
                />
                Webhook
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  name="slack-method"
                  value="bot"
                  checked={slackMethod === 'bot'}
                  onChange={() => setSlackMethod('bot')}
                  data-testid="slack-method-bot"
                />
                Bot
              </label>
            </div>
            <input
              type="text"
              data-testid="slack-url"
              className="w-full border rounded px-2 py-1 text-sm"
              placeholder="Webhook URL 또는 Bot Token"
              value={slackUrl}
              onChange={(e) => setSlackUrl(e.target.value)}
            />
          </div>
        )}

        {channel === 'telegram' && (
          <div data-testid="telegram-config" className="space-y-2">
            <div>
              <label className="text-xs text-gray-600">Bot Token</label>
              <input
                type="text"
                data-testid="telegram-bot-token"
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="123456:ABC-DEF..."
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Chat ID</label>
              <input
                type="text"
                data-testid="telegram-chat-id"
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="-1001234567890"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
              />
            </div>
          </div>
        )}

        {channel === 'discord' && (
          <div data-testid="discord-config" className="space-y-2">
            <div>
              <label className="text-xs text-gray-600">Webhook URL</label>
              <input
                type="text"
                data-testid="discord-webhook-url"
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="https://discord.com/api/webhooks/..."
                value={discordUrl}
                onChange={(e) => setDiscordUrl(e.target.value)}
              />
            </div>
          </div>
        )}

        {channel === 'webhook' && (
          <div data-testid="webhook-config" className="space-y-2">
            <div>
              <label className="text-xs text-gray-600">URL</label>
              <input
                type="text"
                data-testid="webhook-url"
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="https://example.com/webhook"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">헤더 (JSON)</label>
              <input
                type="text"
                data-testid="webhook-headers"
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder='{"Authorization": "Bearer ..."}'
                value={webhookHeaders}
                onChange={(e) => setWebhookHeaders(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">페이로드 템플릿</label>
              <textarea
                data-testid="webhook-payload"
                className="w-full border rounded px-2 py-1 text-sm"
                rows={3}
                placeholder='{"text": "{{event}} - {{message}}"}'
                value={webhookPayload}
                onChange={(e) => setWebhookPayload(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* 이벤트 체크박스 */}
      <fieldset data-testid="event-selection">
        <legend className="text-xs font-medium text-gray-600 mb-2">알림 이벤트</legend>
        <div className="flex gap-3">
          {EVENT_OPTIONS.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={events.includes(value)}
                onChange={() => handleEventToggle(value)}
                data-testid={`event-checkbox-${value}`}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* 테스트 발송 */}
      <button
        data-testid="test-send-button"
        className="w-full bg-sky-500 text-white text-sm py-1.5 rounded hover:bg-sky-600 disabled:opacity-50"
        onClick={handleTestSend}
        disabled={testSending}
      >
        {testSending ? '발송 중...' : '테스트 발송'}
      </button>
    </div>
  );
}
