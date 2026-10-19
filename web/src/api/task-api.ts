export type TaskStatus = 'todo' | 'in_progress' | 'done';
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
// Methods reject with an Error whose message can be displayed to the user.
export interface TaskApi {
  getTasks(): Promise<Task[]>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput): Promise<Task>;
  deleteTask(id: string): Promise<void>;
}
