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
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-600">{GATE_TYPE_LABELS[gate.type]}</p>
            <button
              data-testid={`gate-delete-${gate.gateId}`}
              onClick={() => onChange?.(gates.filter((g) => g.gateId !== gate.gateId))}
              className="text-xs text-red-400 hover:text-red-600"
            >
              삭제
            </button>
          </div>

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
              <select
                data-testid="gate-on-failure-select"
                value={gate.onFailure || 'stop'}
                onChange={(e) => handleUpdate(gate.gateId, { onFailure: e.target.value as GateConfig['onFailure'] })}
                className="w-full px-2 py-1 text-xs border rounded"
              >
                <option value="stop">중단</option>
                <option value="skip">건너뛰기</option>
                <option value="retry">재시도</option>
              </select>
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
              <input
                data-testid="gate-status-code-input"
                type="number"
                placeholder="기대 상태코드"
                value={gate.expectedStatus || 200}
                onChange={(e) => handleUpdate(gate.gateId, { expectedStatus: Number(e.target.value) })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
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
              <select
                data-testid="gate-model-select"
                value={gate.model || ''}
                onChange={(e) => handleUpdate(gate.gateId, { model: e.target.value })}
                className="w-full px-2 py-1 text-xs border rounded"
              >
                <option value="">모델 선택</option>
                <option value="claude-opus-4-6">Opus</option>
                <option value="claude-sonnet-4-6">Sonnet</option>
                <option value="claude-haiku-4-5">Haiku</option>
              </select>
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
              <input
                data-testid="gate-votes-input"
                type="number"
                placeholder="투표 수"
                min="1"
                value={gate.votes ?? 1}
                onChange={(e) => handleUpdate(gate.gateId, { votes: Number(e.target.value) })}
                className="w-full px-2 py-1 text-xs border rounded"
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
              <input
                data-testid="gate-tools-input"
                type="text"
                placeholder="도구 (쉼표 구분)"
                value={gate.tools || ''}
                onChange={(e) => handleUpdate(gate.gateId, { tools: e.target.value })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
              <input
                data-testid="gate-max-turns-input"
                type="number"
                placeholder="최대 턴 수"
                min="1"
                value={gate.maxTurns ?? 5}
                onChange={(e) => handleUpdate(gate.gateId, { maxTurns: Number(e.target.value) })}
                className="w-full px-2 py-1 text-xs border rounded"
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
              <select
                data-testid="gate-strategy-select"
                value={gate.strategy || 'any'}
                onChange={(e) => handleUpdate(gate.gateId, { strategy: e.target.value as GateConfig['strategy'] })}
                className="w-full px-2 py-1 text-xs border rounded"
              >
                <option value="any">1명 이상</option>
                <option value="all">전원</option>
                <option value="unanimous">만장일치</option>
              </select>
              <input
                data-testid="gate-review-timeout-input"
                type="number"
                placeholder="타임아웃 (시간)"
                value={gate.reviewTimeout || ''}
                onChange={(e) => handleUpdate(gate.gateId, { reviewTimeout: Number(e.target.value) })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
              <input
                data-testid="gate-escalation-input"
                type="text"
                placeholder="에스컬레이션 대상"
                value={gate.escalation || ''}
                onChange={(e) => handleUpdate(gate.gateId, { escalation: e.target.value })}
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
