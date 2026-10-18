import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../errors.js';
import type { TaskRepository } from '../repositories/task.repository.js';
import type { CreateTaskInput, UpdateTaskInput } from '../schemas/task.schema.js';
import type { Task } from '../types/task.js';

export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly generateId: () => string = randomUUID,
  ) {}

  findAll(): Task[] {
    return this.repository.findAll();
  }

  findById(id: string): Task {
    const task = this.repository.findById(id);
    if (!task) throw new NotFoundError();
    return task;
  }

  create(input: CreateTaskInput): Task {
    const timestamp = this.now().toISOString();
    return this.repository.create({
      id: this.generateId(),
      title: input.title,
      description: input.description ?? '',
      status: input.status ?? 'todo',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  update(id: string, input: UpdateTaskInput): Task {
    const existing = this.findById(id);
    const task = this.repository.update({
      ...existing,
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      status: input.status ?? existing.status,
      updatedAt: this.now().toISOString(),
    });
    if (!task) throw new NotFoundError();
    return task;
  }

  delete(id: string): void {
    if (!this.repository.delete(id)) throw new NotFoundError();
  }
}
