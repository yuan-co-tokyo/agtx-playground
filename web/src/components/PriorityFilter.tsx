import { useId } from 'react';
import { TASK_PRIORITIES, type TaskPriority } from '../api/types';
import { priorityLabels } from './PriorityBadge';

export type PriorityFilterValue = TaskPriority | 'all';
export function PriorityFilter({ value, onChange }: { value: PriorityFilterValue; onChange: (value: PriorityFilterValue) => void }) {
  const id = useId();
  return <div className="list-toolbar">
    <label htmlFor={id}>優先度で絞り込み</label>
    <select id={id} value={value} onChange={event => onChange(event.target.value as PriorityFilterValue)}>
      <option value="all">すべて</option>
      {TASK_PRIORITIES.map(priority => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
    </select>
  </div>;
}
