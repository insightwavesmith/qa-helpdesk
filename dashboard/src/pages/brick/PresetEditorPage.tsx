import { useState } from 'react';
import Editor from '@monaco-editor/react';

export function PresetEditorPage() {
  const [yaml, setYaml] = useState('# 프리셋 YAML\n');

  return (
    <div data-testid="preset-editor-page">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">프리셋 편집기</h1>
        <button
          data-testid="save-preset-btn"
          className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary-hover"
        >
          저장
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Editor
          height="600px"
          defaultLanguage="yaml"
          value={yaml}
          onChange={(val) => setYaml(val ?? '')}
          options={{ minimap: { enabled: false }, fontSize: 13 }}
        />
      </div>
    </div>
  );
}
