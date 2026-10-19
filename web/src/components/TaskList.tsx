import type { Task } from '../api/task-api';
import { TaskItem, type TaskItemProps } from './TaskItem';

interface Props extends Pick<TaskItemProps, 'onUpdate' | 'onToggle' | 'onRemove'> {
  tasks: Task[];
  pendingIds: Set<string>;
}
export function TaskList({ tasks, pendingIds, ...actions }: Props) {
  if (!tasks.length) return <p className="empty-state">タスクはまだありません</p>;
  return <ul className="task-list" aria-label="タスク一覧">
    {tasks.map(task => <TaskItem key={task.id} task={task} pending={pendingIds.has(task.id)} {...actions} />)}
  </ul>;
}
