import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePresets, useCreatePreset } from '../../hooks/brick/usePresets';
import { useProjects } from '../../hooks/brick/useProjects';
import { useStartExecution } from '../../hooks/brick/useExecutions';
import { ProjectSelector } from '../../components/brick/ProjectSelector';
import { ExecuteDialog } from '../../components/brick/dialogs/ExecuteDialog';

export function PresetListPage() {
  const navigate = useNavigate();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [executingPresetId, setExecutingPresetId] = useState<string | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const { data: projects = [] } = useProjects();
  const { data: presets = [] } = usePresets();
  const { mutate: createPreset } = useCreatePreset();
  const startExecution = useStartExecution();

  const filteredPresets = selectedProjectId
    ? presets.filter((p) => (p as { projectId?: string }).projectId === selectedProjectId)
    : presets;

  const handleDuplicate = (preset: { name: string; yaml?: string }) => {
    createPreset({
      name: `${preset.name}-복사본`,
      yaml: preset.yaml || '',
    });
  };

  const handleRunClick = (presetId: string) => {
    setExecuteError(null);
    setExecutingPresetId(presetId);
  };

  const handleExecuteConfirm = async (feature: string) => {
    if (!executingPresetId) return;
    try {
      const result = await startExecution.mutateAsync({
        presetId: executingPresetId,
        feature,
        task: `${feature} 워크플로우 실행`,
      });
      setExecutingPresetId(null);
      navigate(`/brick/runs/${result.id}`);
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : '실행 실패');
    }
  };

  return (
    <div data-testid="preset-list-page">
      <h1 className="text-xl font-bold mb-6">프리셋</h1>

      <ProjectSelector
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelect={setSelectedProjectId}
      />

      {executeError && (
        <p data-testid="execute-error" className="mb-4 text-sm text-red-500">{executeError}</p>
      )}

      <div data-testid="preset-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPresets.map((preset) => (
          <div key={preset.id} data-testid={`preset-card-${preset.id}`} className="p-4 border rounded-lg bg-white shadow-sm">
            <h3 className="font-medium">{preset.name}</h3>
            {preset.description && <p className="text-sm text-gray-500 mt-1">{preset.description}</p>}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">블록 {preset.blockCount}개</span>
              <div className="flex gap-2">
                <button
                  data-testid={`preset-duplicate-${preset.id}`}
                  className="text-xs text-primary hover:underline"
                  onClick={() => handleDuplicate(preset)}
                >
                  복제
                </button>
                <button
                  data-testid={`preset-run-${preset.id}`}
                  className="text-xs px-2 py-1 rounded text-white"
                  style={{ backgroundColor: '#F75D5D' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#E54949')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#F75D5D')}
                  onClick={() => handleRunClick(preset.id)}
                >
                  ▶ 실행
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ExecuteDialog
        open={!!executingPresetId}
        onConfirm={handleExecuteConfirm}
        onCancel={() => setExecutingPresetId(null)}
      />
    </div>
  );
}
