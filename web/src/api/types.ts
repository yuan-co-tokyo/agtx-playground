export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
}

export type UpdateTaskInput = Partial<CreateTaskInput>;
export type ApiErrorCode = 'VALIDATION_ERROR' | 'INVALID_JSON' | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE' | 'BAD_REQUEST' | 'INTERNAL_ERROR' | (string & {});
export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}
export interface RequestOptions { signal?: AbortSignal }
