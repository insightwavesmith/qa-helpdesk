import { useState } from 'react';
import Editor from '@monaco-editor/react';

interface SkillEditorProps {
  initialContent?: string;
  onSave: (content: string) => void;
}

export function SkillEditor({ initialContent = '', onSave }: SkillEditorProps) {
  const [content, setContent] = useState(initialContent);

  return (
    <div data-testid="skill-editor">
      <div className="border rounded-lg overflow-hidden">
        <Editor
          height="400px"
          defaultLanguage="markdown"
          value={content}
          onChange={(val) => setContent(val ?? '')}
          options={{ minimap: { enabled: false }, fontSize: 13 }}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          data-testid="save-skill-btn"
          onClick={() => onSave(content)}
          className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary-hover"
        >
          저장
        </button>
      </div>
    </div>
  );
}
