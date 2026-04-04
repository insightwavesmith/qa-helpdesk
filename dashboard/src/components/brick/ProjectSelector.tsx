import type { Project } from '../../hooks/brick/useProjects';

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
}

export function ProjectSelector({ projects, selectedProjectId, onSelect }: ProjectSelectorProps) {
  return (
    <div className="mb-4" data-testid="project-selector">
      <label className="block text-xs font-medium text-gray-500 mb-1">프로젝트 선택</label>
      <select
        data-testid="project-select"
        value={selectedProjectId ?? ''}
        onChange={(e) => {
          if (e.target.value) onSelect(e.target.value);
        }}
        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-[Pretendard] focus:outline-none focus:ring-2 focus:ring-[#F75D5D]"
      >
        <option value="">전체 프로젝트</option>
        {projects.length === 0 ? (
          <option disabled value="__empty__">프로젝트 없음</option>
        ) : (
          projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.presetCount}개 프리셋)
            </option>
          ))
        )}
      </select>
    </div>
  );
}
