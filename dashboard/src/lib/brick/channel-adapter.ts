import type { NotifyChannel } from '../../components/brick/nodes/types';

export interface ChannelAdapterConfig {
  type: NotifyChannel;
  name: string;
  icon: string;
  color: string;
}

export const CHANNEL_ADAPTERS: Record<NotifyChannel, ChannelAdapterConfig> = {
  slack: { type: 'slack', name: 'Slack', icon: 'slack', color: '#4A154B' },
  telegram: { type: 'telegram', name: 'Telegram', icon: 'send', color: '#0088CC' },
  discord: { type: 'discord', name: 'Discord', icon: 'message-circle', color: '#5865F2' },
  webhook: { type: 'webhook', name: 'Webhook', icon: 'globe', color: '#6B7280' },
};

export const NOTIFY_CHANNEL_LIST: NotifyChannel[] = ['slack', 'telegram', 'discord', 'webhook'];
