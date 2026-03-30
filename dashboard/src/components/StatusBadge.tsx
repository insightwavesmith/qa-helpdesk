const STATUS_STYLES: Record<string, string> = {
  // 태스크 상태
  in_progress: 'bg-primary/10 text-primary',
  in_review: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
  backlog: 'bg-gray-100 text-gray-500',
  todo: 'bg-blue-100 text-blue-700',
  // 에이전트 상태
  running: 'bg-primary/10 text-primary',
  idle: 'bg-gray-100 text-gray-500',
  paused: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  terminated: 'bg-gray-200 text-gray-400',
  // 우선순위
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  in_progress: '진행중',
  in_review: '검토중',
  completed: '완료',
  cancelled: '취소',
  backlog: '대기',
  todo: '할 일',
  running: '실행중',
  idle: '대기',
  paused: '일시정지',
  error: '오류',
  terminated: '종료',
  critical: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
  // PDCA
  planning: '기획',
  designing: '설계',
  implementing: '구현',
  checking: '검증',
  acting: '개선',
};

export function StatusBadge({ value, className = '' }: { value: string; className?: string }) {
  const style = STATUS_STYLES[value] ?? 'bg-gray-100 text-gray-600';
  const label = STATUS_LABELS[value] ?? value;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style} ${className}`}>
      {label}
    </span>
  );
}
