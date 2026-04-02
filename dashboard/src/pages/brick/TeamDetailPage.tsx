import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { TeamMemberList } from '../../components/brick/team/TeamMemberList';
import { SkillEditor } from '../../components/brick/team/SkillEditor';
import { McpServerList } from '../../components/brick/team/McpServerList';
import { ModelSelector } from '../../components/brick/team/ModelSelector';
import {
  useTeamMembers,
  useAddMember,
  useRemoveMember,
  useUpdateSkill,
  useConfigureMcp,
  useSetModel,
} from '../../hooks/brick/useTeams';

const TABS = [
  { id: 'members', label: '팀원' },
  { id: 'skills', label: '스킬' },
  { id: 'mcp', label: 'MCP' },
  { id: 'model', label: '모델' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function TeamDetailPage() {
  const { id: teamId = '' } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabId>('members');
  const { data: members = [] } = useTeamMembers(teamId);
  const addMember = useAddMember();
  const removeMember = useRemoveMember();
  const updateSkill = useUpdateSkill();
  const configureMcp = useConfigureMcp();
  const setModel = useSetModel();

  const [selectedModel, setSelectedModel] = useState('claude-opus-4-6');
  const [mcpServers, setMcpServers] = useState([
    { name: 'filesystem', enabled: true },
    { name: 'github', enabled: false },
    { name: 'slack', enabled: false },
  ]);

  return (
    <div data-testid="team-detail-page">
      <h1 className="text-xl font-bold mb-4">팀 상세</h1>

      {/* 탭 */}
      <div data-testid="tab-list" className="flex border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'members' && (
        <TeamMemberList
          members={members}
          onAdd={(data) => addMember.mutate({ teamId, ...data })}
          onRemove={(memberId) => removeMember.mutate({ teamId, memberId })}
        />
      )}

      {activeTab === 'skills' && (
        <SkillEditor
          onSave={(content) => updateSkill.mutate({ teamId, content })}
        />
      )}

      {activeTab === 'mcp' && (
        <McpServerList
          servers={mcpServers}
          onToggle={(name, enabled) => {
            setMcpServers((prev) =>
              prev.map((s) => (s.name === name ? { ...s, enabled } : s)),
            );
            const servers = Object.fromEntries(
              mcpServers.map((s) => [s.name, s.name === name ? enabled : s.enabled]),
            );
            configureMcp.mutate({ teamId, servers });
          }}
        />
      )}

      {activeTab === 'model' && (
        <ModelSelector
          selected={selectedModel}
          onSelect={(model) => {
            setSelectedModel(model);
            setModel.mutate({ teamId, model });
          }}
        />
      )}
    </div>
  );
}
