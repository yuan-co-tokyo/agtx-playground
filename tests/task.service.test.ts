import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../src/errors.js';
import { InMemoryTaskRepository } from '../src/repositories/in-memory-task.repository.js';
import { TaskService } from '../src/services/task.service.js';

describe('TaskService', () => {
  it('assigns defaults and preserves creation metadata during a partial update', () => {
    const now = vi.fn().mockReturnValueOnce(new Date('2026-01-01')).mockReturnValueOnce(new Date('2026-01-02'));
    const service = new TaskService(new InMemoryTaskRepository(), now, () => 'fixed-id');
    const created = service.create({ title: 'Task' });
    expect(created).toEqual({ id: 'fixed-id', title: 'Task', description: '', status: 'todo', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(service.update(created.id, { status: 'done' })).toEqual({ ...created, status: 'done', updatedAt: '2026-01-02T00:00:00.000Z' });
    expect(service.findAll()).toHaveLength(1);
    service.delete(created.id);
    expect(service.findAll()).toEqual([]);
  });

  it('preserves supplied optional values', () => {
    const service = new TaskService(new InMemoryTaskRepository());
    expect(service.create({ title: 'Task', description: 'Details', status: 'in_progress' })).toMatchObject({ description: 'Details', status: 'in_progress' });
  });

  it('rejects missing tasks for read, update and delete', () => {
    const service = new TaskService(new InMemoryTaskRepository());
    expect(() => service.findById('missing')).toThrow(NotFoundError);
    expect(() => service.update('missing', { title: 'new' })).toThrow(NotFoundError);
    expect(() => service.delete('missing')).toThrow(NotFoundError);
  });
});
