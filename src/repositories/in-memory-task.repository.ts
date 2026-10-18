import type { Task } from '../types/task.js';
import type { TaskRepository } from './task.repository.js';

export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, Task>();

  findAll(): Task[] {
    return [...this.tasks.values()].map((task) => ({ ...task }));
  }

  findById(id: string): Task | undefined {
    const task = this.tasks.get(id);
    return task ? { ...task } : undefined;
  }

  create(task: Task): Task {
    if (this.tasks.has(task.id)) throw new Error('Duplicate task ID');
    this.tasks.set(task.id, { ...task });
    return { ...task };
  }

  update(task: Task): Task | undefined {
    if (!this.tasks.has(task.id)) return undefined;
    this.tasks.set(task.id, { ...task });
    return { ...task };
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }
}
