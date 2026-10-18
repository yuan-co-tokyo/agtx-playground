import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { InMemoryTaskRepository } from '../src/repositories/in-memory-task.repository.js';

let app: ReturnType<typeof createApp>;
beforeEach(() => { app = createApp(); });

describe('Tasks API', () => {
  it('supports the complete task lifecycle and isolates apps', async () => {
    expect((await request(app).get('/tasks').expect(200)).body).toEqual([]);
    const { body: created } = await request(app).post('/tasks').send({ title: '  First task  ' }).expect(201);
    expect(created).toMatchObject({ title: 'First task', description: '', status: 'todo' });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    expect(created.updatedAt).toBe(created.createdAt);
    expect((await request(app).get(`/tasks/${created.id}`).expect(200)).body).toEqual(created);
    await request(app).post('/tasks').send({ title: 'Second', description: 'Details', status: 'in_progress' }).expect(201);
    const { body: updated } = await request(app).patch(`/tasks/${created.id}`).send({ status: 'done' }).expect(200);
    expect(updated).toMatchObject({ ...created, status: 'done', updatedAt: expect.any(String) });
    expect((await request(app).get('/tasks').expect(200)).body.map((task: { title: string }) => task.title)).toEqual(['First task', 'Second']);
    expect((await request(createApp()).get('/tasks').expect(200)).body).toEqual([]);
    const deleted = await request(app).delete(`/tasks/${created.id}`).expect(204);
    expect(deleted.text).toBe('');
    await request(app).get(`/tasks/${created.id}`).expect(404);
    await request(app).delete(`/tasks/${created.id}`).expect(404);
  });

  it.each([
    {}, { title: '' }, { title: '   ' }, { title: 'a'.repeat(201) },
    { title: 42 }, { title: 'ok', status: 'invalid' }, { title: 'ok', id: 'custom' },
    { title: 'ok', description: 'a'.repeat(2001) }, { title: 'ok', description: null },
    null, [[]],
  ])('rejects invalid create input: %j', async (body) => {
    const response = await request(app).post('/tasks').set('Content-Type', 'application/json').send(JSON.stringify(body)).expect(400);
    expect(['VALIDATION_ERROR', 'INVALID_JSON']).toContain(response.body.error.code);
    expect((await request(app).get('/tasks')).body).toEqual([]);
  });

  it.each([{}, { title: ' ' }, { status: 'bad' }, { createdAt: 'custom' }, { title: 'x'.repeat(201) }, { description: 'x'.repeat(2001) }])('rejects invalid updates without mutation: %j', async (body) => {
    const { body: created } = await request(app).post('/tasks').send({ title: 'original' });
    const response = await request(app).patch(`/tasks/${created.id}`).send(body).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect((await request(app).get(`/tasks/${created.id}`)).body).toEqual(created);
  });

  it('accepts exact length limits and clears descriptions', async () => {
    const { body: created } = await request(app).post('/tasks').send({ title: 'x'.repeat(200), description: 'x'.repeat(2000) }).expect(201);
    const { body } = await request(app).patch(`/tasks/${created.id}`).send({ title: '  renamed  ', description: '' }).expect(200);
    expect(body).toMatchObject({ title: 'renamed', description: '', status: 'todo' });
  });

  it('returns consistent JSON errors for malformed input and missing routes', async () => {
    const malformed = await request(app).post('/tasks').set('Content-Type', 'application/json').send('{').expect(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');
    for (const response of [
      await request(app).get('/tasks/missing').expect(404),
      await request(app).patch('/tasks/missing').send({ title: 'new' }).expect(404),
      await request(app).delete('/tasks/missing').expect(404),
      await request(app).get('/unknown').expect(404),
    ]) expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('hides unexpected exception details', async () => {
    const repository = new InMemoryTaskRepository();
    vi.spyOn(repository, 'findAll').mockImplementation(() => { throw new Error('private detail'); });
    const response = await request(createApp({ repository })).get('/tasks').expect(500);
    expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });
});
