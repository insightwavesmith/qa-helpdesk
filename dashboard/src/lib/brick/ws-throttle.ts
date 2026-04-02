import { useCanvasStore } from './canvas-store';
import type { BlockStatus } from '../../components/brick/nodes/types';

const pendingUpdates = new Map<string, BlockStatus>();
let rafId: number | null = null;

export function throttledBlockUpdate(blockId: string, status: BlockStatus) {
  pendingUpdates.set(blockId, status);
  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      const store = useCanvasStore.getState();
      pendingUpdates.forEach((s, id) => {
        store.updateNodeData(id, { status: s });
      });
      pendingUpdates.clear();
      rafId = null;
    });
  }
}

/** 테스트용: 내부 상태 리셋 */
export function _resetThrottle() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  pendingUpdates.clear();
}

/** 테스트용: pending 확인 */
export function _getPendingUpdates() {
  return new Map(pendingUpdates);
}
