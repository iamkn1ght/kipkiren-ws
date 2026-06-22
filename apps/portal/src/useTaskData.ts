/**
 * Data hook for the task view.
 *
 * Loads the two lists Kamau can see - active (assigned, not yet finished) and
 * completed - from the PII-safe /v1/tasks surface, and exposes the two
 * architecture-allowed status transitions (paid → in_progress → complete)
 * via PUT /v1/tickets/:id/status. Every field here comes straight from the
 * server's allow-listed serializer; the client never has access to anything
 * else (no client name, no billing).
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiError } from './api.ts';
import { mockTasks } from './mockData.ts';

export interface Task {
  id: string;
  ref: string;
  category: string;
  urgency: 'standard' | 'elevated' | 'urgent';
  status: string;
  description: string;
  sla_deadline_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TasksResponse {
  tasks: Task[];
}

export interface TaskData {
  active: Task[];
  completed: Task[];
  loading: boolean;
  error: string | null;
  startTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const DEV_AUTH_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1';

async function setStatus(id: string, status: 'in_progress' | 'complete'): Promise<void> {
  await apiRequest(`/v1/tickets/${id}/status`, { method: 'PUT', body: { status } });
}

export function useTaskData(): TaskData {
  const [active, setActive] = useState<Task[]>([]);
  const [completed, setCompleted] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      if (DEV_AUTH_BYPASS) {
        setActive(mockTasks.active);
        setCompleted(mockTasks.completed);
        setLoading(false);
        return;
      }
      const [a, c] = await Promise.all([
        apiRequest<TasksResponse>('/v1/tasks'),
        apiRequest<TasksResponse>('/v1/tasks?view=completed'),
      ]);
      setActive(a.tasks);
      setCompleted(c.tasks);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return; // auth layer handles redirect
      setError(err instanceof ApiError ? err.code : 'load_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startTask = useCallback(async (id: string) => {
    if (DEV_AUTH_BYPASS) return; // mock mode - no real mutation
    await setStatus(id, 'in_progress');
    await refresh();
  }, [refresh]);

  const completeTask = useCallback(async (id: string) => {
    if (DEV_AUTH_BYPASS) return;
    await setStatus(id, 'complete');
    await refresh();
  }, [refresh]);

  return { active, completed, loading, error, startTask, completeTask, refresh };
}
