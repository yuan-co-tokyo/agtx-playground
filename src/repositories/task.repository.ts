import type { StoredTask } from '../types/task.js';

export interface TaskRepository {
  findAll(): StoredTask[];
  findById(id: string): StoredTask | undefined;
  create(task: StoredTask): StoredTask;
  update(task: StoredTask): StoredTask | undefined;
  delete(id: string): boolean;
}
