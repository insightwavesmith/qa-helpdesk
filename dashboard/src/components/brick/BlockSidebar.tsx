import { useState, useMemo } from 'react';
import {
  BLOCK_TYPES,
  BLOCK_TYPE_ICONS,
  BLOCK_TYPE_LABELS,
  BLOCK_CATEGORY_MAP,
  CATEGORY_BG_COLORS,
  type BlockType,
  type BlockCategory,
} from './nodes/types';

interface BlockSidebarProps {
  onDragStart?: (blockType: BlockType) => void;
  filter?: string;
}

const CATEGORY_ORDER: BlockCategory[] = ['Plan', 'Do', 'Check', 'Act', 'Notify'];

const CATEGORY_LABELS: Record<BlockCategory, string> = {
  Plan: '계획',
  Do: '실행',
  Check: '검증',
  Act: '조치',
  Notify: '알림',
};

const CATEGORY_ICONS: Record<BlockCategory, string> = {
  Plan: '🔍',
  Do: '⚡',
  Check: '🧪',
  Act: '🔧',
  Notify: '🔔',
};

export function BlockSidebar({ onDragStart }: BlockSidebarProps) {
  const [search, setSearch] = useState('');
  const [openCategories, setOpenCategories] = useState<Set<BlockCategory>>(
    new Set(CATEGORY_ORDER),
  );

  const handleDragStart = (e: React.DragEvent, blockType: BlockType) => {
    e.dataTransfer.setData('application/brick-block', blockType);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(blockType);
  };

  const toggleCategory = (category: BlockCategory) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const filteredTypes = useMemo(() => {
    if (!search.trim()) return BLOCK_TYPES as readonly BlockType[];
    const q = search.trim().toLowerCase();
    return BLOCK_TYPES.filter(
      (bt) =>
        BLOCK_TYPE_LABELS[bt].toLowerCase().includes(q) ||
        bt.toLowerCase().includes(q),
    );
  }, [search]);

  const groupedBlocks = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        label: CATEGORY_LABELS[category],
        icon: CATEGORY_ICONS[category],
        bgColor: CATEGORY_BG_COLORS[category],
        blocks: filteredTypes.filter((bt) => BLOCK_CATEGORY_MAP[bt] === category),
      })).filter((g) => g.blocks.length > 0),
    [filteredTypes],
  );

  return (
    <aside
      data-testid="block-sidebar"
      className="w-56 border-r border-gray-200 bg-white flex flex-col overflow-hidden"
    >
      {/* 검색 */}
      <div className="p-3 border-b border-gray-100">
        <input
          type="text"
          placeholder="블록 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-gray-400"
        />
      </div>

      {/* 카테고리 그룹 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {groupedBlocks.map(({ category, label, icon, bgColor, blocks }) => {
          const isOpen = openCategories.has(category);
          return (
            <div key={category}>
              {/* 카테고리 헤더 */}
              <button
                data-testid={`category-toggle-${label}`}
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-gray-600 hover:opacity-90"
                style={{ backgroundColor: bgColor + '99' }}
              >
                <span className="text-sm">{icon}</span>
                <span>{label}</span>
                <span className="ml-auto text-gray-400">{isOpen ? '▼' : '▶'}</span>
              </button>

              {/* 블록 목록 */}
              {isOpen &&
                blocks.map((bt) => (
                  <div
                    key={bt}
                    data-testid={`block-type-${bt}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, bt)}
                    className="flex items-center gap-2 px-3 py-1.5 ml-2 rounded-md cursor-grab hover:bg-gray-100 text-sm text-gray-700"
                  >
                    <span>{BLOCK_TYPE_ICONS[bt]}</span>
                    <span>{BLOCK_TYPE_LABELS[bt]}</span>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
