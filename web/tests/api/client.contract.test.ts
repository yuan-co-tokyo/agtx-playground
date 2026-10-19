import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { createTaskApiClient, HttpError } from '../../src/api/index.js';

it('matches the real server priority contract', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const api = createTaskApiClient({ baseUrl });
    const medium = await api.createTask({ title: 'Default priority' });
    expect(medium.priority).toBe('medium');
    const high = await api.createTask({ title: 'High priority', priority: 'high' });
    const low = await api.createTask({ title: 'Low priority', priority: 'low' });
    expect(await api.getTask(high.id)).toEqual({ ...high, priority: 'high' });
    expect(await api.getTask(low.id)).toEqual({ ...low, priority: 'low' });
    expect(await api.getTasks()).toEqual([medium, high, low]);

    const changed = await api.updateTask(high.id, { priority: 'low' });
    expect(changed).toEqual({ ...high, priority: 'low', updatedAt: expect.any(String) });
    const done = await api.updateTask(high.id, { status: 'done' });
    expect(done).toEqual({ ...changed, status: 'done', updatedAt: expect.any(String) });
    expect(await api.getTasks()).toEqual([medium, done, low]);

    const matching = await api.createTask({ title: 'Still high', priority: 'high' });
    const filtered = await fetch(`${baseUrl}/tasks?priority=high`);
    expect(filtered.status).toBe(200);
    expect(await filtered.json()).toEqual([matching]);
    const invalid = await fetch(`${baseUrl}/tasks?priority=urgent`);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    await expect(api.createTask({ title: 'Invalid priority', priority: 'urgent' as never }))
      .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

it('matches the real server CRUD and error contracts', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const api = createTaskApiClient({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    expect(await api.getTasks()).toEqual([]);
    const created = await api.createTask({ title: 'Contract' });
    expect(created).toMatchObject({ title: 'Contract', description: '', status: 'todo' });
    expect(await api.getTask(created.id)).toEqual(created);
    expect(await api.getTasks()).toEqual([created]);
    expect(await api.updateTask(created.id, { status: 'done' })).toMatchObject({ ...created, status: 'done', updatedAt: expect.any(String) });
    await expect(api.createTask({ title: '' })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR', details: expect.any(Array) });
    expect(await api.deleteTask(created.id)).toBeUndefined();
    const error = await api.getTask(created.id).catch(error => error);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', isNotFound: true });
    expect(await api.getTasks()).toEqual([]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
