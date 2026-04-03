import { useState } from 'react';

interface ExecuteDialogProps {
  open: boolean;
  onConfirm: (feature: string) => void;
  onCancel: () => void;
}

export function ExecuteDialog({ open, onConfirm, onCancel }: ExecuteDialogProps) {
  const [feature, setFeature] = useState('');
  const isValid = /^[a-z0-9-]+$/.test(feature) && feature.length >= 2;

  if (!open) return null;

  return (
    <div data-testid="execute-dialog" className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-80">
        <h3 className="text-sm font-semibold mb-3">워크플로우 실행</h3>
        <label className="text-xs text-gray-500">피처 이름</label>
        <input
          data-testid="feature-input"
          value={feature}
          onChange={(e) => setFeature(e.target.value)}
          placeholder="my-feature"
          className="w-full mt-1 px-3 py-2 border rounded text-sm"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-1 text-sm rounded bg-gray-200">
            취소
          </button>
          <button
            data-testid="execute-confirm-btn"
            onClick={() => onConfirm(feature)}
            disabled={!isValid}
            className="px-3 py-1 text-sm rounded bg-green-500 text-white disabled:opacity-50"
          >
            실행
          </button>
        </div>
      </div>
    </div>
  );
}
