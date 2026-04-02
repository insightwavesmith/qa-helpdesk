interface McpServer {
  name: string;
  enabled: boolean;
}

interface McpServerListProps {
  servers: McpServer[];
  onToggle: (name: string, enabled: boolean) => void;
}

export function McpServerList({ servers, onToggle }: McpServerListProps) {
  return (
    <div data-testid="mcp-server-list" className="space-y-2">
      {servers.map((s) => (
        <label
          key={s.name}
          data-testid={`mcp-${s.name}`}
          className="flex items-center justify-between p-2 rounded-lg bg-gray-50 cursor-pointer"
        >
          <span className="text-sm font-medium">{s.name}</span>
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => onToggle(s.name, e.target.checked)}
            className="w-4 h-4 text-primary rounded"
          />
        </label>
      ))}
    </div>
  );
}
