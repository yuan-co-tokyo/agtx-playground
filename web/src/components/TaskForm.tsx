import { useEffect, useId, useRef, useState } from 'react';
import type { CreateTaskInput, TaskStatus } from '../api/task-api';
import { statusLabels } from './StatusBadge';

interface Props {
  initialValues?: CreateTaskInput;
  submitLabel: string;
  onSubmit: (input: CreateTaskInput) => Promise<boolean>;
  onCancel?: () => void;
  submitting: boolean;
}
export function TaskForm({ initialValues, submitLabel, onSubmit, onCancel, submitting }: Props) {
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(initialValues?.status ?? 'todo');
  const [error, setError] = useState('');
  useEffect(() => { if (initialValues) titleRef.current?.focus(); }, [initialValues]);

  return <form onSubmit={async event => {
    event.preventDefault();
    if (submitting) return;
    if (!title.trim()) {
      setError('タイトルを入力してください');
      titleRef.current?.focus();
      return;
    }
    setError('');
    if (await onSubmit({ title: title.trim(), description, status })) {
      if (!initialValues) { setTitle(''); setDescription(''); setStatus('todo'); }
    }
  }} aria-busy={submitting}>
    <fieldset disabled={submitting}>
      <label htmlFor={`${id}-title`}>タイトル <span className="required">必須</span></label>
      <input ref={titleRef} id={`${id}-title`} required maxLength={200} value={title}
        aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => { setTitle(event.target.value); setError(''); }} />
      {error && <p id={`${id}-error`} className="field-error">{error}</p>}
      <label htmlFor={`${id}-description`}>説明</label>
      <textarea id={`${id}-description`} maxLength={2000} rows={4} value={description}
        onChange={event => setDescription(event.target.value)} />
      <label htmlFor={`${id}-status`}>ステータス</label>
      <select id={`${id}-status`} value={status} onChange={event => setStatus(event.target.value as TaskStatus)}>
        {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <div className="form-actions">
        <button className="primary" type="submit" disabled={submitting}>{submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel}>キャンセル</button>}
      </div>
    </fieldset>
  </form>;
}
