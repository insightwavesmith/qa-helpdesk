import { useCallback } from 'react';
import {
  useStartExecution,
  usePauseExecution,
  useResumeExecution,
  useCancelExecution,
} from '../../../hooks/brick/useExecutions';

export interface CanvasToolbarProps {
  presetId: string;
  executionId: string | null;
  isExecuting: boolean;
  isPaused: boolean;
  onSave?: () => void;
  onLayoutVertical?: () => void;
  onLayoutHorizontal?: () => void;
  onAutoLayout?: () => void;
}

export function CanvasToolbar({
  presetId,
  executionId,
  isExecuting,
  isPaused,
  onSave,
  onLayoutVertical,
  onLayoutHorizontal,
  onAutoLayout,
}: CanvasToolbarProps) {
  const startExecution = useStartExecution();
  const pauseExecution = usePauseExecution();
  const resumeExecution = useResumeExecution();
  const cancelExecution = useCancelExecution();

  const handleStart = useCallback(() => {
    startExecution.mutate(presetId);
  }, [startExecution, presetId]);

  const handlePause = useCallback(() => {
    if (executionId) pauseExecution.mutate(executionId);
  }, [pauseExecution, executionId]);

  const handleResume = useCallback(() => {
    if (executionId) resumeExecution.mutate(executionId);
  }, [resumeExecution, executionId]);

  const handleCancel = useCallback(() => {
    if (executionId) cancelExecution.mutate(executionId);
  }, [cancelExecution, executionId]);

  return (
    <div data-testid="canvas-toolbar" className="h-12 border-b border-gray-200 bg-white flex items-center px-4 gap-2">
      {/* 실행 제어 */}
      {!isExecuting && (
        <button
          data-testid="start-btn"
          onClick={handleStart}
          className="px-3 py-1 text-sm rounded bg-green-500 text-white hover:bg-green-600"
        >
          ▶ 실행
        </button>
      )}

      {isExecuting && !isPaused && (
        <button
          data-testid="pause-btn"
          onClick={handlePause}
          className="px-3 py-1 text-sm rounded bg-yellow-500 text-white hover:bg-yellow-600"
        >
          ⏸ 일시정지
        </button>
      )}

      {isExecuting && isPaused && (
        <button
          data-testid="resume-btn"
          onClick={handleResume}
          className="px-3 py-1 text-sm rounded bg-blue-500 text-white hover:bg-blue-600"
        >
          ▶ 재개
        </button>
      )}

      {isExecuting && (
        <button
          data-testid="cancel-btn"
          onClick={handleCancel}
          className="px-3 py-1 text-sm rounded bg-red-500 text-white hover:bg-red-600"
        >
          ⏹ 중지
        </button>
      )}

      {/* 구분선 */}
      <div className="w-px h-6 bg-gray-300 mx-1" />

      {/* 레이아웃 */}
      <button
        data-testid="layout-vertical-btn"
        onClick={onLayoutVertical}
        className="px-2 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
        title="세로 정렬"
      >
        세로
      </button>
      <button
        data-testid="layout-horizontal-btn"
        onClick={onLayoutHorizontal}
        className="px-2 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
        title="가로 정렬"
      >
        가로
      </button>
      <button
        data-testid="auto-layout-btn"
        onClick={onAutoLayout}
        className="px-2 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
        title="자동 정렬"
      >
        자동정렬
      </button>

      <div className="flex-1" />

      {/* 저장 */}
      <button
        data-testid="save-btn"
        onClick={onSave}
        className="px-3 py-1 text-sm rounded bg-primary text-white hover:bg-primary-hover"
      >
        저장
      </button>
    </div>
  );
}
