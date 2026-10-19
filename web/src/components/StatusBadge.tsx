import type { TaskStatus } from '../api/types';

export const statusLabels: Record<TaskStatus, string> = { todo: '未着手', in_progress: '進行中', done: '完了' };
export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge badge-${status}`}>{statusLabels[status]}</span>;
}
