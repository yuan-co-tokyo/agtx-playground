import { Router } from 'express';
import { createTaskSchema, listTasksQuerySchema, updateTaskSchema } from '../schemas/task.schema.js';
import type { TaskService } from '../services/task.service.js';

export function createTaskRouter(service: TaskService): Router {
  const router = Router();
  router.get('/', (req, res) => { res.json(service.findAll(listTasksQuerySchema.parse(req.query))); });
  router.get('/:id', (req, res) => { res.json(service.findById(req.params.id)); });
  router.post('/', (req, res) => {
    const task = service.create(createTaskSchema.parse(req.body));
    res.status(201).json(task);
  });
  router.patch('/:id', (req, res) => {
    res.json(service.update(req.params.id, updateTaskSchema.parse(req.body)));
  });
  router.delete('/:id', (req, res) => {
    service.delete(req.params.id);
    res.status(204).end();
  });
  return router;
}
