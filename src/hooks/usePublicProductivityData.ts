/* eslint-disable react-compiler/react-compiler */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { AppData, Task, DailyData } from '../lib/dataManager';

export function usePublicProductivityData(targetUserId: string, year: number) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: result, error: rpcError } = await supabase.rpc('get_public_productivity', {
        target_user_id: targetUserId,
        target_year: year
      });

      if (rpcError) throw rpcError;

      if (result && result.error) {
        setError(result.error);
        setData(null);
        setLoading(false);
        return;
      }

      const dbTasks = result.tasks || [];
      const dbCompletions = result.completions || [];
      const dbDailyData = result.daily_data || [];

      const recurringTasks: Task[] = [];
      const days: Record<string, DailyData> = {};

      for (const t of dbTasks) {
        const task: Task = {
          id: t.id,
          name: 'Private Task',
          description: t.description,
          recurring: t.recurring,
          createdAt: t.created_at?.split('T')[0] || '',
        };

        if (task.recurring && task.recurring !== 'none') {
          recurringTasks.push(task);
        } else {
          const date = task.createdAt;
          if (date) {
            if (!days[date]) days[date] = { tasks: [], completedTaskIds: [], manualCompletion: false };
            days[date].tasks.push(task);
          }
        }
      }

      for (const d of dbDailyData) {
        if (!days[d.date]) days[d.date] = { tasks: [], completedTaskIds: [], manualCompletion: false };
        days[d.date].manualCompletion = d.manual_completion;
      }

      for (const c of dbCompletions) {
        const date = c.date || c.completed_date;
        if (!date) continue;
        if (!days[date]) days[date] = { tasks: [], completedTaskIds: [], manualCompletion: false };
        if (!days[date].completedTaskIds) days[date].completedTaskIds = [];

        if (typeof c.count === 'number') {
          // Minimal aggregated schema from hardened RPC
          for (let i = 0; i < c.count; i++) {
            days[date].completedTaskIds.push(`agg-${date}-${i}`);
            days[date].tasks.push({
              id: `agg-${date}-${i}`,
              name: 'Completed Task',
              recurring: 'none',
              createdAt: date
            });
          }
        } else if (c.task_id) {
          // Legacy schema
          days[date].completedTaskIds.push(c.task_id);
        }
      }

      setData({
        version: 2,
        settings: { theme: 'dark', weekStartsOn: 1 },
        recurringTasks,
        days
      });
    } catch (err) {
      console.error("RPC Error:", err);
      setData({ version: 2, settings: { theme: 'dark', weekStartsOn: 1 }, days: {}, recurringTasks: [] });
      setError("rpc_error");
    } finally {
      setLoading(false);
    }
  }, [targetUserId, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error };
}
