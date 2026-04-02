import { useTeams } from '../../hooks/brick/useTeams';

export function TeamManagePage() {
  const { data: teams = [] } = useTeams();

  return (
    <div data-testid="team-manage-page">
      <h1 className="text-xl font-bold mb-6">팀 관리</h1>

      <div data-testid="team-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team) => (
          <div key={team.id} data-testid={`team-card-${team.id}`} className="p-4 border rounded-lg bg-white shadow-sm">
            <h3 className="font-medium">{team.name}</h3>
            {team.description && <p className="text-sm text-gray-500 mt-1">{team.description}</p>}
            <div className="mt-2 text-xs text-gray-400">팀원 {team.memberCount}명</div>
          </div>
        ))}
      </div>
    </div>
  );
}
