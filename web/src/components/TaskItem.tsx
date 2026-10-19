import { useEffect, useRef, useState } from 'react';
import type { Task, UpdateTaskInput } from '../api/types';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { TaskForm } from './TaskForm';

export interface TaskItemProps {
  task: Task;
  pending: boolean;
  onUpdate: (id: string, input: UpdateTaskInput) => Promise<boolean>;
  onToggle: (task: Task) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}
export function TaskItem({ task, pending, onUpdate, onToggle, onRemove }: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!editing && restoreFocus.current) { editButton.current?.focus(); restoreFocus.current = false; }
  }, [editing]);
  const close = () => { restoreFocus.current = true; setEditing(false); };
  return <li className="task-card" aria-busy={pending}>
    {editing ? <TaskForm initialValues={task} submitLabel="保存" submitting={pending}
      onCancel={close} onSubmit={async input => {
        const success = await onUpdate(task.id, input);
        if (success) close();
        return success;
      }} /> : <>
      <div className="task-heading">
        <label className="completion">
          <input type="checkbox" checked={task.status === 'done'} disabled={pending}
            aria-label={`「${task.title}」を${task.status === 'done' ? '未着手' : '完了'}にする`}
            onChange={() => void onToggle(task)} />
          <span className="visually-hidden">完了</span>
        </label>
        <h3 className={task.status === 'done' ? 'completed' : ''}>{task.title}</h3>
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
      </div>
      {task.description && <p className="description">{task.description}</p>}
      <div className="task-actions">
        <button ref={editButton} disabled={pending} aria-label={`「${task.title}」を編集`} onClick={() => setEditing(true)}>編集</button>
        <button className="danger" disabled={pending} aria-label={`「${task.title}」を削除`} onClick={() => void onRemove(task.id)}>削除</button>
      </div>
    </>}
  </li>;
}
