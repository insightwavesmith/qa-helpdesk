import { useState } from 'react';
import { usePresets, useCreatePreset } from '../../hooks/brick/usePresets';
import { useProjects } from '../../hooks/brick/useProjects';
import { ProjectSelector } from '../../components/brick/ProjectSelector';

export function PresetListPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { data: projects = [] } = useProjects();
  const { data: presets = [] } = usePresets();
  const { mutate: createPreset } = useCreatePreset();

  const filteredPresets = selectedProjectId
    ? presets.filter((p) => (p as { projectId?: string }).projectId === selectedProjectId)
    : presets;

  const handleDuplicate = (preset: { name: string; yaml?: string }) => {
    createPreset({
      name: `${preset.name}-복사본`,
      yaml: preset.yaml || '',
    });
  };

  return (
    <div data-testid="preset-list-page">
      <h1 className="text-xl font-bold mb-6">프리셋</h1>

      <ProjectSelector
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelect={setSelectedProjectId}
      />

      <div data-testid="preset-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPresets.map((preset) => (
          <div key={preset.id} data-testid={`preset-card-${preset.id}`} className="p-4 border rounded-lg bg-white shadow-sm">
            <h3 className="font-medium">{preset.name}</h3>
            {preset.description && <p className="text-sm text-gray-500 mt-1">{preset.description}</p>}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">블록 {preset.blockCount}개</span>
              <button
                data-testid={`preset-duplicate-${preset.id}`}
                className="text-xs text-primary hover:underline"
                onClick={() => handleDuplicate(preset)}
              >
                복제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
