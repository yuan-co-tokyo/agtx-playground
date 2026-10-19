import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../src/errors.js';
import { InMemoryTaskRepository } from '../src/repositories/in-memory-task.repository.js';
import { TaskService } from '../src/services/task.service.js';

describe('TaskService', () => {
  it('assigns defaults and preserves creation metadata during a partial update', () => {
    const now = vi.fn().mockReturnValueOnce(new Date('2026-01-01')).mockReturnValueOnce(new Date('2026-01-02'));
    const service = new TaskService(new InMemoryTaskRepository(), now, () => 'fixed-id');
    const created = service.create({ title: 'Task' });
    expect(created).toEqual({ id: 'fixed-id', title: 'Task', description: '', status: 'todo', priority: 'medium', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(service.update(created.id, { status: 'done' })).toEqual({ ...created, status: 'done', updatedAt: '2026-01-02T00:00:00.000Z' });
    expect(service.findAll()).toHaveLength(1);
    service.delete(created.id);
    expect(service.findAll()).toEqual([]);
  });

  it('preserves supplied optional values', () => {
    const service = new TaskService(new InMemoryTaskRepository());
    expect(service.create({ title: 'Task', description: 'Details', status: 'in_progress' })).toMatchObject({ description: 'Details', status: 'in_progress' });
  });

  it('creates, changes and preserves explicit priorities', () => {
    const service = new TaskService(new InMemoryTaskRepository());
    const created = service.create({ title: 'Task', priority: 'high' });
    expect(created.priority).toBe('high');
    expect(service.update(created.id, { priority: 'low' })).toMatchObject({ ...created, priority: 'low', updatedAt: expect.any(String) });
    expect(service.update(created.id, { status: 'done' }).priority).toBe('low');
    expect(service.findAll({ priority: 'low' })).toHaveLength(1);
    expect(service.findAll({ priority: 'high' })).toEqual([]);
  });

  it('normalizes legacy records before filtering and persists the default on update', () => {
    const repository = new InMemoryTaskRepository();
    const legacy = { id: 'legacy', title: 'Legacy', description: '', status: 'todo' as const, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    repository.create(legacy);
    const service = new TaskService(repository);
    const expected = { ...legacy, priority: 'medium' };
    expect(service.findById(legacy.id)).toEqual(expected);
    expect(service.findAll()).toEqual([expected]);
    expect(service.findAll({ priority: 'medium' })).toEqual([expected]);
    expect(service.findAll({ priority: 'high' })).toEqual([]);
    expect(repository.findById(legacy.id)).toEqual(legacy);
    expect(service.update(legacy.id, { title: 'Updated' }).priority).toBe('medium');
    expect(repository.findById(legacy.id)?.priority).toBe('medium');
  });

  it('rejects missing tasks for read, update and delete', () => {
    const service = new TaskService(new InMemoryTaskRepository());
    expect(() => service.findById('missing')).toThrow(NotFoundError);
    expect(() => service.update('missing', { title: 'new' })).toThrow(NotFoundError);
    expect(() => service.delete('missing')).toThrow(NotFoundError);
  });
});
