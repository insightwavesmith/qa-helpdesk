const MODELS = [
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { id: 'gpt-4o', label: 'GPT-4o' },
];

interface ModelSelectorProps {
  selected: string;
  onSelect: (model: string) => void;
}

export function ModelSelector({ selected, onSelect }: ModelSelectorProps) {
  return (
    <div data-testid="model-selector" className="space-y-2">
      {MODELS.map((m) => (
        <label
          key={m.id}
          data-testid={`model-${m.id}`}
          className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 cursor-pointer"
        >
          <input
            type="radio"
            name="model"
            value={m.id}
            checked={selected === m.id}
            onChange={() => onSelect(m.id)}
            className="w-4 h-4 text-primary"
          />
          <span className="text-sm font-medium">{m.label}</span>
        </label>
      ))}
    </div>
  );
}
