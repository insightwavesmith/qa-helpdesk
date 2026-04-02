import { useState } from 'react';
import type { TeamMember } from '../../../hooks/brick/useTeams';

interface TeamMemberListProps {
  members: TeamMember[];
  onAdd: (data: { name: string; role: string }) => void;
  onRemove: (memberId: string) => void;
}

export function TeamMemberList({ members, onAdd, onRemove }: TeamMemberListProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), role: role.trim() || '팀원' });
    setName('');
    setRole('');
  };

  return (
    <div data-testid="team-member-list">
      <div className="space-y-2 mb-4">
        {members.map((m) => (
          <div key={m.id} data-testid={`member-${m.id}`} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                {m.name.charAt(0)}
              </div>
              <div>
                <div className="text-sm font-medium">{m.name}</div>
                <div className="text-xs text-gray-500">{m.role}</div>
              </div>
            </div>
            <button
              data-testid={`remove-${m.id}`}
              onClick={() => onRemove(m.id)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              제거
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          data-testid="member-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름"
          className="flex-1 px-2 py-1 text-sm border rounded"
        />
        <input
          data-testid="member-role-input"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="역할"
          className="flex-1 px-2 py-1 text-sm border rounded"
        />
        <button
          data-testid="add-member-btn"
          onClick={handleAdd}
          className="px-3 py-1 text-sm bg-primary text-white rounded hover:bg-primary-hover"
        >
          추가
        </button>
      </div>
    </div>
  );
}
