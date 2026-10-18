import express from 'express';
import { NotFoundError } from './errors.js';
import { errorHandler } from './middleware/error-handler.js';
import { InMemoryTaskRepository } from './repositories/in-memory-task.repository.js';
import type { TaskRepository } from './repositories/task.repository.js';
import { createTaskRouter } from './routes/task.routes.js';
import { TaskService } from './services/task.service.js';

export function createApp({ repository = new InMemoryTaskRepository() }: { repository?: TaskRepository } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/tasks', createTaskRouter(new TaskService(repository)));
  app.use((_req, _res, next) => { next(new NotFoundError('Route not found')); });
  app.use(errorHandler);
  return app;
}
