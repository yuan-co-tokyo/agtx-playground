import { vi } from 'vitest';
import type { TaskApi } from '../api/client';
import type { CreateTaskInput, Task, UpdateTaskInput } from '../api/types';

export const sampleTask: Task = {
  id: 'one', title: '仕様を確認', description: 'APIの仕様を読む', status: 'todo', priority: 'medium',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export function fakeTaskApi(initial: Task[] = []) {
  let tasks = [...initial];
  let nextId = 0;
  return {
    getTask: vi.fn(async (id: string) => {
      const task = tasks.find(task => task.id === id);
      if (!task) throw new Error('タスクが見つかりません');
      return task;
    }),
    getTasks: vi.fn(async () => [...tasks]),
    createTask: vi.fn(async (input: CreateTaskInput) => {
      const task: Task = { ...sampleTask, description: '', status: 'todo', priority: 'medium', ...input, id: `new-${nextId++}` };
      tasks.push(task);
      return task;
    }),
    updateTask: vi.fn(async (id: string, input: UpdateTaskInput) => {
      const previous = tasks.find(task => task.id === id);
      if (!previous) throw new Error('タスクが見つかりません');
      const updated = { ...previous, ...input };
      tasks = tasks.map(task => task.id === id ? updated : task);
      return updated;
    }),
    deleteTask: vi.fn(async (id: string) => { tasks = tasks.filter(task => task.id !== id); }),
  } satisfies TaskApi;
}
