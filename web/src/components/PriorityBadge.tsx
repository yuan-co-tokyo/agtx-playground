import type { TaskPriority } from '../api/types';

export const priorityLabels: Record<TaskPriority, string> = { high: '高', medium: '中', low: '低' };
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={`badge priority priority-${priority}`}><span className="visually-hidden">優先度: </span>{priorityLabels[priority]}</span>;
}
