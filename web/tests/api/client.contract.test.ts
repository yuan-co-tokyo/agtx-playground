import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { createTaskApiClient, HttpError } from '../../src/api/index.js';

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
