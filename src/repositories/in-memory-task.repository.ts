import type { StoredTask } from '../types/task.js';
import type { TaskRepository } from './task.repository.js';

export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, StoredTask>();

  findAll(): StoredTask[] {
    return [...this.tasks.values()].map((task) => ({ ...task }));
  }

  findById(id: string): StoredTask | undefined {
    const task = this.tasks.get(id);
    return task ? { ...task } : undefined;
  }

  create(task: StoredTask): StoredTask {
    if (this.tasks.has(task.id)) throw new Error('Duplicate task ID');
    this.tasks.set(task.id, { ...task });
    return { ...task };
  }

  update(task: StoredTask): StoredTask | undefined {
    if (!this.tasks.has(task.id)) return undefined;
    this.tasks.set(task.id, { ...task });
    return { ...task };
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }
}
