import { useState } from 'react';

export type GateType = 'command' | 'http' | 'prompt' | 'agent' | 'review';
export type ExecutionMode = 'sequential' | 'parallel' | 'voting';

export interface GateConfig {
  gateId: string;
  type: GateType;
  status: string;
  // command
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
}

const GATE_TYPE_LABELS: Record<GateType, string> = {
  command: '명령어',
  http: 'HTTP',
  prompt: '프롬프트',
  agent: '에이전트',
  review: '리뷰',
};

const GATE_TYPES: GateType[] = ['command', 'http', 'prompt', 'agent', 'review'];

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
  const [addType, setAddType] = useState<GateType>('command');

  const handleAdd = () => {
    const newGate: GateConfig = {
      gateId: `gate-${Date.now()}`,
      type: addType,
      status: 'pending',
    };
    onChange?.([...gates, newGate]);
  };

  const handleDelete = (gateId: string) => {
    onChange?.(gates.filter((g) => g.gateId !== gateId));
  };

  const handleUpdate = (gateId: string, updates: Partial<GateConfig>) => {
    onChange?.(
      gates.map((g) => (g.gateId === gateId ? { ...g, ...updates } : g)),
    );
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

      {/* Gate 목록 */}
      {gates.map((gate) => (
        <div key={gate.gateId} data-testid={`gate-item-${gate.type}`} className="border border-gray-200 rounded p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{GATE_TYPE_LABELS[gate.type]}</span>
            <button
              data-testid={`gate-delete-${gate.gateId}`}
              onClick={() => handleDelete(gate.gateId)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              삭제
            </button>
          </div>

          {/* command Gate */}
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

          {/* http Gate */}
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
                placeholder="예상 상태코드"
                value={gate.expectedStatus || ''}
                onChange={(e) => handleUpdate(gate.gateId, { expectedStatus: Number(e.target.value) })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
            </div>
          )}

          {/* prompt Gate */}
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
                <option value="claude-opus">Claude Opus</option>
                <option value="claude-sonnet">Claude Sonnet</option>
              </select>
              <input
                data-testid="gate-confidence-input"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={gate.confidence || 0.5}
                onChange={(e) => handleUpdate(gate.gateId, { confidence: Number(e.target.value) })}
                className="w-full"
              />
              <input
                data-testid="gate-votes-input"
                type="number"
                placeholder="투표 횟수"
                value={gate.votes || ''}
                onChange={(e) => handleUpdate(gate.gateId, { votes: Number(e.target.value) })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
            </div>
          )}

          {/* agent Gate */}
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
                placeholder="도구 목록 (쉼표 구분)"
                value={gate.tools || ''}
                onChange={(e) => handleUpdate(gate.gateId, { tools: e.target.value })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
              <input
                data-testid="gate-max-turns-input"
                type="number"
                placeholder="최대 턴 수"
                value={gate.maxTurns || ''}
                onChange={(e) => handleUpdate(gate.gateId, { maxTurns: Number(e.target.value) })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
            </div>
          )}

          {/* review Gate */}
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
                <option value="any">any</option>
                <option value="all">all</option>
                <option value="unanimous">unanimous</option>
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
                placeholder="에스컬레이션"
                value={gate.escalation || ''}
                onChange={(e) => handleUpdate(gate.gateId, { escalation: e.target.value })}
                className="w-full px-2 py-1 text-xs border rounded"
              />
            </div>
          )}
        </div>
      ))}

      {/* Gate 추가 */}
      <div className="flex items-center gap-2">
        <select
          data-testid="gate-type-select"
          value={addType}
          onChange={(e) => setAddType(e.target.value as GateType)}
          className="px-2 py-1 text-xs border border-gray-300 rounded"
        >
          {GATE_TYPES.map((gt) => (
            <option key={gt} value={gt}>
              {GATE_TYPE_LABELS[gt]}
            </option>
          ))}
        </select>
        <button
          data-testid="gate-add-btn"
          onClick={handleAdd}
          className="px-3 py-1 text-xs rounded bg-primary text-white hover:bg-primary-hover"
        >
          Gate 추가
        </button>
      </div>
    </div>
  );
}
