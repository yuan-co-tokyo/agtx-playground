import type { Task } from '../api/types';
import { TaskItem, type TaskItemProps } from './TaskItem';

interface Props extends Pick<TaskItemProps, 'onUpdate' | 'onToggle' | 'onRemove'> {
  tasks: Task[];
  emptyMessage?: string;
  pendingIds: Set<string>;
}
export function TaskList({ tasks, pendingIds, emptyMessage = 'タスクはまだありません', ...actions }: Props) {
  if (!tasks.length) return <p className="empty-state">{emptyMessage}</p>;
  return <ul className="task-list" aria-label="タスク一覧">
    {tasks.map(task => <TaskItem key={task.id} task={task} pending={pendingIds.has(task.id)} {...actions} />)}
  </ul>;
}
