import { HttpError, InvalidResponseError, NetworkError, isAbortError } from './errors.js';
import { DEFAULT_TASK_PRIORITY, TASK_PRIORITIES, TASK_STATUSES } from './types.js';
import type { ApiErrorBody, CreateTaskInput, RequestOptions, Task, UpdateTaskInput } from './types.js';

export interface TaskApiClientOptions { baseUrl?: string; fetch?: typeof fetch }
export interface TaskApi {
  getTasks(options?: RequestOptions): Promise<Task[]>;
  getTask(id: string, options?: RequestOptions): Promise<Task>;
  createTask(input: CreateTaskInput, options?: RequestOptions): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput, options?: RequestOptions): Promise<Task>;
  deleteTask(id: string, options?: RequestOptions): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type RawTask = Omit<Task, 'priority'> & Partial<Pick<Task, 'priority'>>;

function isTask(value: unknown): value is RawTask {
  return isRecord(value)
    && ['id', 'title', 'description', 'createdAt', 'updatedAt'].every(key => typeof value[key] === 'string')
    && TASK_STATUSES.some(status => status === value.status)
    && (value.priority === undefined || TASK_PRIORITIES.some(priority => priority === value.priority));
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return isRecord(value) && isRecord(value.error)
    && typeof value.error.code === 'string' && typeof value.error.message === 'string';
}

function normalizeTask(value: RawTask): Task {
  return { ...value, priority: value.priority ?? DEFAULT_TASK_PRIORITY };
}

function task(value: unknown): Task {
  if (!isTask(value)) throw new InvalidResponseError('Expected a task response');
  return normalizeTask(value);
}

function inputBody(input: UpdateTaskInput): UpdateTaskInput {
  return Object.fromEntries(['title', 'description', 'status', 'priority']
    .filter(key => input[key as keyof UpdateTaskInput] !== undefined)
    .map(key => [key, input[key as keyof UpdateTaskInput]]));
}

export function createTaskApiClient(options: TaskApiClientOptions = {}): TaskApi {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const taskPath = (id: string) => `/tasks/${encodeURIComponent(id)}`;

  async function request(method: string, path: string, requestOptions?: RequestOptions, body?: UpdateTaskInput): Promise<unknown> {
    const init: RequestInit = {
      method,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      signal: requestOptions?.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    // Errors caused by the caller's signal (abort, timeout or custom reason) propagate unchanged.
    const rethrowAbort = (cause: unknown) => {
      if (isAbortError(cause) || requestOptions?.signal?.aborted) throw cause;
    };
    let response: Response;
    try {
      response = await (options.fetch ? options.fetch(`${baseUrl}${path}`, init) : globalThis.fetch(`${baseUrl}${path}`, init));
    } catch (cause) {
      rethrowAbort(cause);
      throw new NetworkError('Unable to reach the task API', { cause });
    }
    if (!response.ok) {
      let errorBody: unknown;
      try { errorBody = JSON.parse(await response.text()); } catch (cause) {
        rethrowAbort(cause);
      }
      if (isApiErrorBody(errorBody)) {
        throw new HttpError(response.status, errorBody.error.code, errorBody.error.message, errorBody.error.details);
      }
      throw new HttpError(response.status, 'HTTP_ERROR', response.statusText || `Request failed with status ${response.status}`);
    }
    if (response.status === 204) return undefined;
    try { return await response.json(); } catch (cause) {
      rethrowAbort(cause);
      throw new InvalidResponseError('Expected a JSON response', { cause });
    }
  }

  return {
    async getTasks(requestOptions) {
      const value = await request('GET', '/tasks', requestOptions);
      if (!Array.isArray(value) || !value.every(isTask)) throw new InvalidResponseError('Expected a task array response');
      return value.map(normalizeTask);
    },
    async getTask(id, requestOptions) { return task(await request('GET', taskPath(id), requestOptions)); },
    async createTask(input, requestOptions) { return task(await request('POST', '/tasks', requestOptions, inputBody(input))); },
    async updateTask(id, input, requestOptions) {
      const body = inputBody(input);
      // Reject empty updates locally to avoid a round trip for a known invalid request.
      if (Object.keys(body).length === 0) throw new RangeError('At least one task field is required');
      return task(await request('PATCH', taskPath(id), requestOptions, body));
    },
    async deleteTask(id, requestOptions) { await request('DELETE', taskPath(id), requestOptions); },
  };
}
