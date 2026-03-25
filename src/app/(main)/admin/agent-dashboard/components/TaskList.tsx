'use client';

import type { AgentTask, TaskStatus } from '@/types/agent-dashboard';

interface TaskListProps {
  tasks: AgentTask[];
}

const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: string; iconClass: string; label: string }
> = {
  done: { icon: '✓', iconClass: 'text-green-500', label: '완료' },
  active: { icon: '→', iconClass: 'text-blue-500', label: '진행중' },
  pending: { icon: '○', iconClass: 'text-gray-400', label: '대기' },
  blocked: { icon: '✕', iconClass: 'text-red-500', label: '차단' },
};

export function TaskList({ tasks }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <p
        className="text-xs text-[#64748B] py-2"
        style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}
      >
        배정된 태스크 없음
      </p>
    );
  }

  return (
    <ul
      className="flex flex-col gap-1"
      style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}
    >
      {tasks.map((task) => {
        const config = STATUS_CONFIG[task.status];
        return (
          <li
            key={task.id}
            className="flex items-center gap-2 text-sm py-0.5"
          >
            {/* 상태 아이콘 */}
            <span
              className={`w-4 text-center font-bold shrink-0 ${config.iconClass}`}
            >
              {config.icon}
            </span>

            {/* 제목 */}
            <span className="flex-1 text-[#0F172A] truncate">
              {task.title}
            </span>

            {/* 담당자 */}
            {task.assignee && (
              <span className="text-xs text-[#64748B] shrink-0">
                {task.assignee}
              </span>
            )}

            {/* 상태 텍스트 */}
            <span
              className={`text-xs shrink-0 font-medium ${config.iconClass}`}
            >
              {config.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
