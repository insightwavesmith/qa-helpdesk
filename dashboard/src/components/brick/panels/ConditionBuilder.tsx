import { useMemo } from 'react';

interface ConditionBuilderProps {
  condition: string;
  onChange: (condition: string) => void;
  availableMetrics: string[];
}

const OPERATORS = ['<', '>', '<=', '>=', '=='];

function parseCondition(cond: string) {
  const parts = cond.trim().split(/\s+/);
  return {
    metric: parts[0] || '',
    operator: parts[1] || '<',
    value: parts[2] || '',
  };
}

export function ConditionBuilder({ condition, onChange, availableMetrics }: ConditionBuilderProps) {
  const parsed = useMemo(() => parseCondition(condition), [condition]);

  const update = (field: 'metric' | 'operator' | 'value', newVal: string) => {
    const next = { ...parsed, [field]: newVal };
    if (next.metric && next.value) {
      onChange(`${next.metric} ${next.operator} ${next.value}`);
    } else {
      onChange('');
    }
  };

  return (
    <div data-testid="condition-builder" className="space-y-2">
      <p className="text-xs text-gray-500">조건</p>
      <div className="flex items-center gap-1">
        <select
          data-testid="condition-metric-select"
          value={parsed.metric}
          onChange={(e) => update('metric', e.target.value)}
          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
        >
          <option value="">지표 선택</option>
          {availableMetrics.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          data-testid="condition-operator-select"
          value={parsed.operator}
          onChange={(e) => update('operator', e.target.value)}
          className="w-14 px-1 py-1 text-xs border border-gray-300 rounded"
        >
          {OPERATORS.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>
        <input
          data-testid="condition-value-input"
          type="number"
          value={parsed.value}
          onChange={(e) => update('value', e.target.value)}
          placeholder="값"
          className="w-16 px-2 py-1 text-xs border border-gray-300 rounded"
        />
      </div>
      <div
        data-testid="condition-preview"
        className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded font-mono"
      >
        {parsed.metric && parsed.value
          ? `${parsed.metric} ${parsed.operator} ${parsed.value}`
          : '—'}
      </div>
    </div>
  );
}
