import { useEffect, useRef } from 'react';
import type { LinkType } from '../nodes/types';

interface LinkTypePopoverProps {
  position: { x: number; y: number };
  onSelect: (linkType: LinkType) => void;
  onCancel: () => void;
}

const LINK_TYPES_CONFIG: { name: LinkType; label: string; color: string }[] = [
  { name: 'sequential', label: '순차', color: '#6B7280' },
  { name: 'parallel',   label: '병렬', color: '#3B82F6' },
  { name: 'compete',    label: '경쟁', color: '#EF4444' },
  { name: 'loop',       label: '반복', color: '#8B5CF6' },
  { name: 'cron',       label: '크론', color: '#F59E0B' },
  { name: 'branch',     label: '분기', color: '#10B981' },
];

export function LinkTypePopover({ position, onSelect, onCancel }: LinkTypePopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onCancel]);

  return (
    <div
      ref={ref}
      data-testid="link-type-popover"
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: 50,
      }}
      className="bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[140px]"
    >
      <p className="text-xs text-gray-400 mb-2 px-1">링크 타입</p>
      <div className="grid grid-cols-2 gap-1">
        {LINK_TYPES_CONFIG.map(({ name, label, color }) => (
          <button
            key={name}
            data-testid={`link-type-btn-${name}`}
            onClick={() => onSelect(name)}
            className="px-2 py-1.5 text-xs font-medium rounded text-white hover:opacity-80 transition-opacity"
            style={{ backgroundColor: color }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
