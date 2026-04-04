import { useState } from 'react';

export type GateType =
  | 'command' | 'http' | 'prompt' | 'agent' | 'review'
  | 'metric' | 'approval' | 'artifact';

export type ExecutionMode = 'sequential' | 'parallel' | 'voting';

export interface GateConfig {
  gateId: string;
  type: GateType;
  status: string;
  // command / http
  command?: string;
  timeout?: number;
  onFailure?: 'stop' | 'skip' | 'retry';
  // http
  url?: string;
  method?: 'GET' | 'POST' | 'PUT';
  expectedStatus?: number;
  // prompt
  promptText?: string;
  model?: string;
  confidence?: number;
  votes?: number;
  // agent
  agentPrompt?: string;
  tools?: string;
  maxTurns?: number;
  // review
  reviewers?: string[];
  strategy?: 'any' | 'all' | 'unanimous';
  reviewTimeout?: number;
  escalation?: string;
  // metric (신규)
  threshold?: number;
  // approval (신규)
  approver?: string;
  channel?: string;
  onTimeout?: 'reject' | 'approve' | 'escalate';
}

const ALL_GATE_TYPES: GateType[] = [
  'artifact', 'command', 'http', 'prompt', 'agent', 'review', 'approval', 'metric',
];

const GATE_TYPE_LABELS: Record<GateType, string> = {
  command: '명령어',
  http: 'HTTP',
  prompt: '프롬프트',
  agent: '에이전트',
  review: '리뷰',
  metric: '수치',
  approval: '승인',
  artifact: '산출물',
};

interface GateConfigPanelProps {
  gates: GateConfig[];
  executionMode?: ExecutionMode;
  onChange?: (gates: GateConfig[]) => void;
  onExecutionModeChange?: (mode: ExecutionMode) => void;
}

export function GateConfigPanel({
  gates,
  executionMode = 'sequential',
  onChange,
  onExecutionModeChange,
}: GateConfigPanelProps) {
  const enabledTypes = new Set(gates.map((g) => g.type));

  const toggleGate = (type: GateType) => {
    if (enabledTypes.has(type)) {
      onChange?.(gates.filter((g) => g.type !== type));
    } else {
      onChange?.([...gates, { gateId: `gate-${Date.now()}`, type, status: 'pending' }]);
    }
  };

  const handleUpdate = (gateId: string, updates: Partial<GateConfig>) => {
    onChange?.(gates.map((g) => (g.gateId === gateId ? { ...g, ...updates } : g)));
  };

  return (
    <div data-testid="gate-config-panel" className="space-y-3">
      <h4 className="text-xs font-semibold text-gray-600">Gate 설정</h4>

      {/* 실행 방식 */}
      <div data-testid="execution-mode" className="flex gap-3 text-xs">
        {(['sequential', 'parallel', 'voting'] as ExecutionMode[]).map((mode) => (
          <label key={mode} className="flex items-center gap-1">
            <input
              type="radio"
              name="execution-mode"
              value={mode}
              checked={executionMode === mode}
              onChange={() => onExecutionModeChange?.(mode)}
            />
            {mode === 'sequential' ? '순차' : mode === 'parallel' ? '병렬' : '투표'}
          </label>
        ))}
      </div>

      {/* 체크박스 그리드 (8종) */}
      <div className="grid grid-cols-2 gap-1.5">
        {ALL_GATE_TYPES.map((type) => (
          <label
            key={type}
            className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
          >
            <input
              type="checkbox"
              data-testid={`gate-checkbox-${type}`}
              checked={enabledTypes.has(type)}
              onChange={() => toggleGate(type)}
              className="rounded"
            />
            <span>{GATE_TYPE_LABELS[type]}</span>
          </label>
        ))}
      </div>

      {/* 활성화된 Gate 설정 */}
      {gates.map((gate) => (
        <div
          key={gate.gateId}
          data-testid={`gate-item-${gate.type}`}
          className="border border-gray-200 rounded p-2 space-y-2"
        >
          <p className="text-xs font-medium text-gray-600">{GATE_TYPE_LABELS[gate.type]}</p>

          {/* command */}
          {gate.type === 'command' && (
            <div className="space-y-1">
              <input
                data-testid="gate-command-input"
                type="text"
                placeholder="명령어"
                value={gate.command || ''}
                onChange={(e) => handleUpdate(gate.gateId, { command: e.target.value })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
              <input
                data-testid="gate-timeout-input"
                type="number"
                placeholder="타임아웃 (초)"
                value={gate.timeout || ''}
                onChange={(e) => handleUpdate(gate.gateId, { timeout: Number(e.target.value) })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
            </div>
          )}

          {/* http */}
          {gate.type === 'http' && (
            <div className="space-y-1">
              <input
                data-testid="gate-url-input"
                type="text"
                placeholder="URL"
                value={gate.url || ''}
                onChange={(e) => handleUpdate(gate.gateId, { url: e.target.value })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
              <select
                data-testid="gate-method-select"
                value={gate.method || 'GET'}
                onChange={(e) => handleUpdate(gate.gateId, { method: e.target.value as GateConfig['method'] })}
                className="w-full px-2 py-1 text-xs border rounded"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
          )}

          {/* prompt */}
          {gate.type === 'prompt' && (
            <div className="space-y-1">
              <textarea
                data-testid="gate-prompt-input"
                placeholder="프롬프트"
                value={gate.promptText || ''}
                onChange={(e) => handleUpdate(gate.gateId, { promptText: e.target.value })}
                className="w-full px-2 py-1 text-xs border rounded"
                rows={2}
              />
              <label className="block text-xs text-gray-400">신뢰도</label>
              <input
                data-testid="gate-confidence-input"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={gate.confidence ?? 0.5}
                onChange={(e) => handleUpdate(gate.gateId, { confidence: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          )}

          {/* agent */}
          {gate.type === 'agent' && (
            <div className="space-y-1">
              <textarea
                data-testid="gate-agent-prompt-input"
                placeholder="프롬프트"
                value={gate.agentPrompt || ''}
                onChange={(e) => handleUpdate(gate.gateId, { agentPrompt: e.target.value })}
                className="w-full px-2 py-1 text-xs border rounded"
                rows={2}
              />
            </div>
          )}

          {/* review */}
          {gate.type === 'review' && (
            <div className="space-y-1">
              <input
                data-testid="gate-reviewers-input"
                type="text"
                placeholder="리뷰어 (쉼표 구분)"
                value={gate.reviewers?.join(', ') || ''}
                onChange={(e) =>
                  handleUpdate(gate.gateId, {
                    reviewers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full px-2 py-1 text-xs border rounded"
              />
            </div>
          )}

          {/* metric (신규) */}
          {gate.type === 'metric' && (
            <div className="space-y-1">
              <label className="block text-xs text-gray-400">임계값 ({gate.threshold ?? 90})</label>
              <input
                data-testid="gate-threshold-slider"
                type="range"
                min="0"
                max="100"
                step="1"
                value={gate.threshold ?? 90}
                onChange={(e) => handleUpdate(gate.gateId, { threshold: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          )}

          {/* approval (신규) */}
          {gate.type === 'approval' && (
            <div className="space-y-1">
              <input
                data-testid="gate-approval-approver"
                type="text"
                placeholder="승인자"
                value={gate.approver || ''}
                onChange={(e) => handleUpdate(gate.gateId, { approver: e.target.value })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
              <input
                data-testid="gate-approval-channel"
                type="text"
                placeholder="채널 (예: #general)"
                value={gate.channel || ''}
                onChange={(e) => handleUpdate(gate.gateId, { channel: e.target.value })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
              <input
                data-testid="gate-approval-timeout"
                type="number"
                placeholder="타임아웃 (초)"
                value={gate.timeout || ''}
                onChange={(e) => handleUpdate(gate.gateId, { timeout: Number(e.target.value) })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
              <select
                data-testid="gate-approval-on-timeout"
                value={gate.onTimeout || 'reject'}
                onChange={(e) => handleUpdate(gate.gateId, { onTimeout: e.target.value as GateConfig['onTimeout'] })}
                className="w-full px-2 py-1 text-xs border rounded"
              >
                <option value="reject">거부</option>
                <option value="approve">승인</option>
                <option value="escalate">에스컬레이트</option>
              </select>
            </div>
          )}

          {/* artifact (신규) — 설정 없음 */}
          {gate.type === 'artifact' && (
            <p className="text-xs text-gray-400">산출물 존재 여부를 확인합니다.</p>
          )}
        </div>
      ))}
    </div>
  );
}
