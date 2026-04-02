import { useState } from 'react';
import { useBlockTypes, useCreateBlockType } from '../../hooks/brick/useBlockTypes';

export function BlockCatalogPage() {
  const { data: blockTypes = [] } = useBlockTypes();
  const createMutation = useCreateBlockType();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', what: '', done: '' });

  const handleCreate = () => {
    createMutation.mutate(form, {
      onSuccess: () => {
        setModalOpen(false);
        setForm({ name: '', what: '', done: '' });
      },
    });
  };

  return (
    <div data-testid="block-catalog-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">블록 카탈로그</h1>
        <button
          data-testid="create-block-btn"
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary-hover"
        >
          생성
        </button>
      </div>

      <div data-testid="block-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {blockTypes.map((bt) => (
          <div key={bt.id} data-testid={`block-card-${bt.id}`} className="p-4 border rounded-lg bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span>{bt.icon ?? '🔧'}</span>
              <h3 className="font-medium">{bt.name}</h3>
            </div>
            <p className="text-sm text-gray-500">{bt.description ?? bt.what}</p>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div data-testid="create-modal" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-lg p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">블록 타입 생성</h2>
            <div className="space-y-3">
              <input
                data-testid="input-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="이름"
                className="w-full px-3 py-2 border rounded text-sm"
              />
              <input
                data-testid="input-what"
                value={form.what}
                onChange={(e) => setForm({ ...form, what: e.target.value })}
                placeholder="하는 일 (what)"
                className="w-full px-3 py-2 border rounded text-sm"
              />
              <input
                data-testid="input-done"
                value={form.done}
                onChange={(e) => setForm({ ...form, done: e.target.value })}
                placeholder="완료 조건 (done)"
                className="w-full px-3 py-2 border rounded text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button data-testid="cancel-btn" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm border rounded">
                취소
              </button>
              <button data-testid="submit-btn" onClick={handleCreate} className="px-4 py-2 text-sm bg-primary text-white rounded">
                생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
