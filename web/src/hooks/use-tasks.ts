import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskApi } from '../api/client';
import type { CreateTaskInput, Task, UpdateTaskInput } from '../api/types';
import { toErrorMessage } from '../api/error-message';

export function useTasks(api: TaskApi) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const generation = useRef(0);
  const locks = useRef(new Set<string>());
  const createLock = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const current = ++generation.current;
    locks.current = new Set();
    createLock.current = false;
    setPendingIds(new Set());
    setCreating(false);
    setStatus('loading');
    setLoadError('');
    setActionError('');
    void (async () => {
      try {
        const result = await api.getTasks();
        if (generation.current === current) { setTasks(result); setStatus('ready'); }
      } catch (error) {
        if (generation.current === current) { setLoadError(toErrorMessage(error)); setStatus('error'); }
      }
    })();
    return () => { generation.current++; };
  }, [api, reloadKey]);

  const create = async (input: CreateTaskInput) => {
    if (createLock.current || status !== 'ready') return false;
    const current = generation.current;
    createLock.current = true;
    setCreating(true);
    setActionError('');
    try {
      const task = await api.createTask(input);
      if (generation.current !== current) return false;
      setTasks(previous => [...previous, task]);
      return true;
    } catch (error) {
      if (generation.current === current) setActionError(toErrorMessage(error));
      return false;
    } finally {
      if (generation.current === current) { createLock.current = false; setCreating(false); }
    }
  };

  const mutate = async (id: string, operation: () => Promise<Task | void>) => {
    if (locks.current.has(id) || status !== 'ready') return false;
    const current = generation.current;
    locks.current.add(id);
    setPendingIds(new Set(locks.current));
    setActionError('');
    try {
      const result = await operation();
      if (generation.current !== current) return false;
      setTasks(previous => result
        ? previous.map(task => task.id === id ? result : task)
        : previous.filter(task => task.id !== id));
      return true;
    } catch (error) {
      if (generation.current === current) setActionError(toErrorMessage(error));
      return false;
    } finally {
      if (generation.current === current) {
        locks.current.delete(id);
        setPendingIds(new Set(locks.current));
      }
    }
  };
  const update = (id: string, input: UpdateTaskInput) => mutate(id, () => api.updateTask(id, input));
  return {
    tasks, status, loadError, actionError, pendingIds, creating, create, update,
    reload: useCallback(() => setReloadKey(value => value + 1), []),
    toggleDone: (task: Task) => update(task.id, { status: task.status === 'done' ? 'todo' : 'done' }),
    remove: (id: string) => mutate(id, () => api.deleteTask(id)),
    dismissError: () => setActionError(''),
  };
}
