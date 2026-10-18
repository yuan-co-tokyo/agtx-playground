import type { Task } from '../types/task.js';

export interface TaskRepository {
  findAll(): Task[];
  findById(id: string): Task | undefined;
  create(task: Task): Task;
  update(task: Task): Task | undefined;
  delete(id: string): boolean;
}
