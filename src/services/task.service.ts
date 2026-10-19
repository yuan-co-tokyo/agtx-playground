import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../errors.js';
import type { TaskRepository } from '../repositories/task.repository.js';
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from '../schemas/task.schema.js';
import { DEFAULT_TASK_PRIORITY, type StoredTask, type Task } from '../types/task.js';

export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly generateId: () => string = randomUUID,
  ) {}

  private normalize(task: StoredTask): Task {
    return { ...task, priority: task.priority ?? DEFAULT_TASK_PRIORITY };
  }

  findAll(filter: ListTasksQuery = {}): Task[] {
    return this.repository.findAll()
      .map((task) => this.normalize(task))
      .filter((task) => filter.priority === undefined || task.priority === filter.priority);
  }

  findById(id: string): Task {
    const task = this.repository.findById(id);
    if (!task) throw new NotFoundError();
    return this.normalize(task);
  }

  create(input: CreateTaskInput): Task {
    const timestamp = this.now().toISOString();
    return this.normalize(this.repository.create({
      id: this.generateId(),
      title: input.title,
      description: input.description ?? '',
      status: input.status ?? 'todo',
      priority: input.priority ?? DEFAULT_TASK_PRIORITY,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
  }

  update(id: string, input: UpdateTaskInput): Task {
    const existing = this.findById(id);
    const task = this.repository.update({
      ...existing,
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      status: input.status ?? existing.status,
      priority: input.priority ?? existing.priority,
      updatedAt: this.now().toISOString(),
    });
    if (!task) throw new NotFoundError();
    return this.normalize(task);
  }

  delete(id: string): void {
    if (!this.repository.delete(id)) throw new NotFoundError();
  }
}
