import { z } from 'zod';
import { TASK_PRIORITIES } from '../types/task.js';

const fields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
};
export const createTaskSchema = z.object(fields).strict();
export const updateTaskSchema = z.object(fields).partial().strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const listTasksQuerySchema = z.object({
  priority: z.enum(TASK_PRIORITIES).optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
