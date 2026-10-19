import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTaskApiClient, ApiError, HttpError, InvalidResponseError, NetworkError, isAbortError, getTasks } from '../../src/api/index.js';

const task = { id: 'a/b', title: 'Test', description: '', status: 'todo', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
function setup(response: Response) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  return { fetch, api: createTaskApiClient({ baseUrl: 'http://localhost:3000///', fetch }) };
}
afterEach(() => vi.unstubAllGlobals());

describe('task API client', () => {
  it('lists tasks, trims base URL and forwards a signal', async () => {
    const { fetch, api } = setup(Response.json([task]));
    const signal = new AbortController().signal;
    expect(await api.getTasks({ signal })).toEqual([task]);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/tasks', expect.objectContaining({ method: 'GET', signal, headers: { Accept: 'application/json' } }));
  });

  it('uses relative URLs and resolves global fetch at call time through the public exports', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json([]));
    vi.stubGlobal('fetch', fetch);
    expect(await getTasks()).toEqual([]);
    expect(fetch).toHaveBeenCalledWith('/tasks', expect.anything());
  });

  it('encodes IDs when getting, updating and deleting', async () => {
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      const response = method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(task);
      const json = vi.spyOn(response, 'json');
      const { fetch, api } = setup(response);
      if (method === 'GET') expect(await api.getTask('a/b')).toEqual(task);
      if (method === 'PATCH') {
        expect(await api.updateTask('a/b', { status: 'done' })).toEqual(task);
        expect(fetch.mock.calls[0]?.[1]?.body).toBe('{"status":"done"}');
      }
      if (method === 'DELETE') {
        expect(await api.deleteTask('a/b')).toBeUndefined();
        expect(json).not.toHaveBeenCalled();
      }
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/tasks/a%2Fb', expect.objectContaining({ method }));
    }
  });

  it('creates a task with only defined input fields', async () => {
    const { fetch, api } = setup(Response.json(task, { status: 201 }));
    expect(await api.createTask({ ...task, status: undefined, description: undefined })).toEqual(task);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/tasks', expect.objectContaining({
      method: 'POST', body: '{"title":"Test"}', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    }));
  });

  it.each([[404, 'NOT_FOUND'], [400, 'VALIDATION_ERROR'], [413, 'PAYLOAD_TOO_LARGE'], [500, 'INTERNAL_ERROR'], [409, 'FUTURE_CODE']])('preserves HTTP error %s', async (status, code) => {
    const details = [{ path: ['title'], message: 'Required' }];
    const { api } = setup(Response.json({ error: { code, message: 'Failure', details } }, { status: Number(status) }));
    const error = await api.getTasks().catch(error => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status, code, message: 'Failure', details, isNotFound: status === 404, isValidationError: code === 'VALIDATION_ERROR' });
  });

  it.each(['<html>Bad Gateway</html>', '', '{"error":null}', '{}'])('falls back for unexpected error body %s', async body => {
    const { api } = setup(new Response(body, { status: 502 }));
    await expect(api.getTasks()).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 502, message: 'Request failed with status 502' });
  });

  it('uses statusText for fallback HTTP errors', async () => {
    const { api } = setup(new Response('', { status: 502, statusText: 'Bad Gateway' }));
    await expect(api.getTasks()).rejects.toMatchObject({ message: 'Bad Gateway' });
  });

  it('wraps network failures with their cause', async () => {
    const cause = new TypeError('Failed to fetch');
    const { fetch, api } = setup(Response.json([]));
    fetch.mockRejectedValue(cause);
    const error = await api.getTasks().catch(error => error);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.cause).toBe(cause);
  });

  it('preserves aborts during fetch and response reading', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    expect(isAbortError(abort)).toBe(true);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(new TypeError())).toBe(false);
    const { fetch, api } = setup(Response.json([]));
    fetch.mockRejectedValue(abort);
    await expect(api.getTasks()).rejects.toBe(abort);
    for (const status of [200, 400]) {
      const response = new Response('', { status });
      vi.spyOn(response, status === 200 ? 'json' : 'text').mockRejectedValue(abort);
      fetch.mockResolvedValue(response);
      await expect(api.getTasks()).rejects.toBe(abort);
    }
  });

  it('preserves timeouts and custom abort reasons from the caller signal', async () => {
    const timeout = new DOMException('Timed out', 'TimeoutError');
    expect(isAbortError(timeout)).toBe(true);
    const { fetch, api } = setup(Response.json([]));
    fetch.mockRejectedValue(timeout);
    await expect(api.getTasks()).rejects.toBe(timeout);
    const reason = new Error('cancelled');
    const controller = new AbortController();
    controller.abort(reason);
    for (const status of [0, 200, 400]) {
      const response = new Response('', { status: status || 200 });
      if (status) vi.spyOn(response, status === 200 ? 'json' : 'text').mockRejectedValue(reason);
      if (status) fetch.mockResolvedValue(response); else fetch.mockRejectedValue(reason);
      await expect(api.getTasks({ signal: controller.signal })).rejects.toBe(reason);
    }
  });

  it.each(['not json', '{}', '[{}]', JSON.stringify([{ ...task, status: 'unknown' }])])('rejects malformed list responses %s', async body => {
    const { api } = setup(new Response(body));
    await expect(api.getTasks()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('rejects malformed task responses and accepts additive fields', async () => {
    const { fetch, api } = setup(Response.json({ ...task, title: null }));
    await expect(api.getTask('id')).rejects.toBeInstanceOf(InvalidResponseError);
    fetch.mockResolvedValue(Response.json({ ...task, extra: true }));
    expect(await api.getTask('id')).toMatchObject(task);
  });

  it('rejects empty updates without fetching', async () => {
    const { fetch, api } = setup(Response.json(task));
    await expect(api.updateTask('id', {})).rejects.toBeInstanceOf(RangeError);
    await expect(api.updateTask('id', { title: undefined })).rejects.toBeInstanceOf(RangeError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
