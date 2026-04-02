import { BLOCK_TYPES, BLOCK_TYPE_ICONS, BLOCK_TYPE_LABELS, type BlockType } from './nodes/types';

interface BlockSidebarProps {
  onDragStart?: (blockType: BlockType) => void;
}

export function BlockSidebar({ onDragStart }: BlockSidebarProps) {
  const handleDragStart = (e: React.DragEvent, blockType: BlockType) => {
    e.dataTransfer.setData('application/brick-block', blockType);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(blockType);
  };

  return (
    <aside data-testid="block-sidebar" className="w-56 border-r border-gray-200 bg-white p-3 space-y-1 overflow-y-auto">
      <h3 className="text-xs font-medium uppercase tracking-widest text-gray-400 px-2 mb-2">
        블록 팔레트
      </h3>
      {BLOCK_TYPES.map((bt) => (
        <div
          key={bt}
          data-testid={`block-type-${bt}`}
          draggable
          onDragStart={(e) => handleDragStart(e, bt)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab hover:bg-gray-100 text-sm text-gray-700"
        >
          <span>{BLOCK_TYPE_ICONS[bt]}</span>
          <span>{BLOCK_TYPE_LABELS[bt]}</span>
        </div>
      ))}
    </aside>
  );
}
