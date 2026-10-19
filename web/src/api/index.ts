import { createTaskApiClient } from './client.js';
import { resolveApiBaseUrl } from './config.js';

export * from './types.js';
export * from './errors.js';
export * from './client.js';
export { resolveApiBaseUrl } from './config.js';

export const taskApi = createTaskApiClient({ baseUrl: resolveApiBaseUrl() });
export const { getTasks, getTask, createTask, updateTask, deleteTask } = taskApi;
