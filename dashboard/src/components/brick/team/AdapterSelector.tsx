const ADAPTERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'bedrock', label: 'AWS Bedrock' },
  { id: 'vertex', label: 'Google Vertex AI' },
];

interface AdapterSelectorProps {
  selected: string;
  onSelect: (adapter: string) => void;
}

export function AdapterSelector({ selected, onSelect }: AdapterSelectorProps) {
  return (
    <div data-testid="adapter-selector">
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full px-3 py-2 text-sm border rounded-lg"
        data-testid="adapter-dropdown"
      >
        {ADAPTERS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
    </div>
  );
}
