import { describe, expect, it } from 'vitest';
import { InMemoryTaskRepository } from '../src/repositories/in-memory-task.repository.js';
import type { Task } from '../src/types/task.js';

const task = (id: string): Task => ({ id, title: id, description: '', status: 'todo', priority: 'medium', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });

describe('InMemoryTaskRepository', () => {
  it('preserves creation order across updates and deletes existing tasks only', () => {
    const repo = new InMemoryTaskRepository();
    expect(repo.findAll()).toEqual([]);
    repo.create(task('a'));
    repo.create(task('b'));
    expect(repo.update({ ...task('a'), title: 'updated' })?.title).toBe('updated');
    expect(repo.findAll().map((item) => item.id)).toEqual(['a', 'b']);
    expect(repo.update(task('missing'))).toBeUndefined();
    expect(repo.delete('a')).toBe(true);
    expect(repo.delete('a')).toBe(false);
    expect(repo.findById('a')).toBeUndefined();
  });

  it('copies inputs and every returned object', () => {
    const repo = new InMemoryTaskRepository();
    const input = task('a');
    const created = repo.create(input);
    input.title = 'changed';
    created.title = 'changed';
    repo.findById('a')!.title = 'changed';
    repo.findAll()[0]!.title = 'changed';
    expect(repo.findById('a')!.title).toBe('a');
    const update = { ...task('a'), title: 'updated' };
    const returned = repo.update(update)!;
    update.title = 'changed';
    returned.title = 'changed';
    expect(repo.findById('a')!.title).toBe('updated');
    expect(() => repo.create(task('a'))).toThrow('Duplicate task ID');
  });
});
