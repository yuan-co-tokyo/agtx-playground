import type { TaskApi } from './task-api';

const unavailable = async (): Promise<never> => {
  throw new Error('APIクライアントが未接続です');
};
export const taskApi: TaskApi = {
  getTasks: unavailable, createTask: unavailable, updateTask: unavailable, deleteTask: unavailable,
};
