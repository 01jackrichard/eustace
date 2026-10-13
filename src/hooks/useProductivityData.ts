import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { AppData, Task, DailyData, TaskMetadata } from '../lib/dataManager';
import { parseTaskMetadata, serializeTaskMetadata } from '../lib/dataManager';
import { addDays, parseISO, format } from 'date-fns';
import toast from 'react-hot-toast';

export function useProductivityData(year: number) {
  const { user } = useAuth();
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const [tasksRes, completionsRes, dailyRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', user.id),
      supabase.from('task_completions').select('*')
        .eq('user_id', user.id)
        .gte('completed_date', startDate)
        .lte('completed_date', endDate),
      supabase.from('daily_data').select('*')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate)
    ]);

    const dbTasks = tasksRes.data;
    const dbCompletions = completionsRes.data;
    const dbDailyData = dailyRes.data;

    const days: Record<string, DailyData> = {};
    const recurringTasks: Task[] = [];

    if (dbTasks) {
      for (const t of dbTasks) {
        let meta: TaskMetadata = {};
        if (t.description) {
          try {
            meta = JSON.parse(t.description);
          } catch {}
        }

        const rawStartTime = t.start_time ? String(t.start_time).slice(0, 5) : meta.startTime;
        if (rawStartTime) {
          meta.startTime = rawStartTime;
        }

        const task: Task = {
          id: t.id,
          name: t.name,
          category: t.category,
          duration: t.duration,
          recurring: t.recurring,
          createdAt: t.created_at.split('T')[0],
          description: t.description,
          metadata: meta,
          startTime: rawStartTime
        };

        if (t.recurring !== 'none') {
          recurringTasks.push(task);
        } else {
          const dateStr = t.created_at.split('T')[0];
          if (!days[dateStr]) days[dateStr] = { tasks: [], completedTaskIds: [] };
          days[dateStr].tasks.push(task);
        }
      }
    }

    if (dbCompletions) {
      for (const c of dbCompletions) {
        const dateStr = c.completed_date.split('T')[0];
        if (!days[dateStr]) days[dateStr] = { tasks: [], completedTaskIds: [] };
        days[dateStr].completedTaskIds.push(c.task_id);
      }
    }

    if (dbDailyData) {
      for (const d of dbDailyData) {
        const dateStr = d.date.split('T')[0];
        if (!days[dateStr]) days[dateStr] = { tasks: [], completedTaskIds: [] };
        days[dateStr].note = d.note;
        days[dateStr].manualCompletion = d.manual_completion;
      }
    }

    setData({
      version: 2,
      days,
      recurringTasks,
      settings: { theme: 'dark', weekStartsOn: 0 }
    });
    setLoading(false);
  }, [user, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  

  const addTask = async (taskData: Omit<Task, 'id'>) => {
    if (!user || !data) return false;

    const rawStartTime = taskData.metadata?.startTime || taskData.startTime || null;
    const insertPayload: Record<string, any> = {
      user_id: user.id,
      name: taskData.name,
      category: taskData.category,
      duration: taskData.duration,
      recurring: taskData.recurring,
      created_at: taskData.createdAt,
      description: taskData.description,
      start_time: rawStartTime
    };

    let { data: inserted, error } = await supabase
      .from('tasks')
      .insert(insertPayload)
      .select()
      .single();

    // Backward-compatibility fallback if start_time column is not yet deployed to live schema
    if (error && (error.code === 'PGRST204' || error.message?.includes('start_time'))) {
      delete insertPayload.start_time;
      const retry = await supabase
        .from('tasks')
        .insert(insertPayload)
        .select()
        .single();
      inserted = retry.data;
      error = retry.error;
    }

    // Backward-compatibility fallback if recurring check constraint does not permit 'monthly' or 'yearly'
    if (
      error &&
      (error.code === '23514' || error.message?.includes('tasks_recurring_check') || error.message?.includes('recurring')) &&
      (insertPayload.recurring === 'monthly' || insertPayload.recurring === 'yearly')
    ) {
      const origRecurring = insertPayload.recurring;
      insertPayload.recurring = 'custom';
      try {
        const meta = insertPayload.description ? JSON.parse(insertPayload.description) : {};
        if (!meta.rrule) {
          meta.rrule = origRecurring === 'monthly' ? 'RRULE:FREQ=MONTHLY' : 'RRULE:FREQ=YEARLY';
          insertPayload.description = JSON.stringify(meta);
        }
      } catch {}

      const retry = await supabase
        .from('tasks')
        .insert(insertPayload)
        .select()
        .single();
      inserted = retry.data;
      error = retry.error;
    }

    if (error && (error.code === 'PGRST204' || error.message?.includes('start_time')) && 'start_time' in insertPayload) {
      delete insertPayload.start_time;
      const retry = await supabase
        .from('tasks')
        .insert(insertPayload)
        .select()
        .single();
      inserted = retry.data;
      error = retry.error;
    }

    if (inserted && !error) {
      let meta: TaskMetadata = {};
      if (inserted.description) {
        try { meta = JSON.parse(inserted.description); } catch {}
      }
      if (rawStartTime) {
        meta.startTime = rawStartTime;
      }

      const newTask: Task = {
        id: inserted.id,
        name: inserted.name,
        category: inserted.category,
        duration: inserted.duration,
        recurring: inserted.recurring,
        createdAt: inserted.created_at.split('T')[0],
        description: inserted.description,
        metadata: meta,
        startTime: rawStartTime || undefined
      };

      const newData = structuredClone(data);
      if (newTask.recurring !== 'none') {
        newData.recurringTasks.push(newTask);
      } else {
        if (!newData.days[newTask.createdAt]) newData.days[newTask.createdAt] = { tasks: [], completedTaskIds: [] };
        newData.days[newTask.createdAt].tasks.push(newTask);
      }
      setData(newData);
      return true;
    } else {
      toast.error(error?.message || 'Failed to create task');
      return false;
    }
  };

  const updateTask = async (task: Task) => {
    if (!user || !data) return false;
    const rawStartTime = task.metadata?.startTime || task.startTime || null;
    const updatePayload: Record<string, any> = {
      name: task.name,
      category: task.category,
      duration: task.duration,
      recurring: task.recurring,
      description: task.description,
      start_time: rawStartTime
    };

    let { data: updated, error } = await supabase
      .from('tasks')
      .update(updatePayload)
      .match({ id: task.id, user_id: user.id })
      .select()
      .single();

    if (error && (error.code === 'PGRST204' || error.message?.includes('start_time'))) {
      delete updatePayload.start_time;
      const retry = await supabase
        .from('tasks')
        .update(updatePayload)
        .match({ id: task.id, user_id: user.id })
        .select()
        .single();
      updated = retry.data;
      error = retry.error;
    }

    if (
      error &&
      (error.code === '23514' || error.message?.includes('tasks_recurring_check') || error.message?.includes('recurring')) &&
      (updatePayload.recurring === 'monthly' || updatePayload.recurring === 'yearly')
    ) {
      const origRecurring = updatePayload.recurring;
      updatePayload.recurring = 'custom';
      try {
        const meta = updatePayload.description ? JSON.parse(updatePayload.description) : {};
        if (!meta.rrule) {
          meta.rrule = origRecurring === 'monthly' ? 'RRULE:FREQ=MONTHLY' : 'RRULE:FREQ=YEARLY';
          updatePayload.description = JSON.stringify(meta);
        }
      } catch {}

      const retry = await supabase
        .from('tasks')
        .update(updatePayload)
        .match({ id: task.id, user_id: user.id })
        .select()
        .single();
      updated = retry.data;
      error = retry.error;
    }

    if (error && (error.code === 'PGRST204' || error.message?.includes('start_time')) && 'start_time' in updatePayload) {
      delete updatePayload.start_time;
      const retry = await supabase
        .from('tasks')
        .update(updatePayload)
        .match({ id: task.id, user_id: user.id })
        .select()
        .single();
      updated = retry.data;
      error = retry.error;
    }

    if (updated && !error) {
      const newTask: Task = {
        ...task,
        recurring: updated.recurring,
        description: updated.description,
        startTime: rawStartTime || undefined
      };
      const newData = structuredClone(data);
      if (newTask.recurring !== 'none') {
        newData.recurringTasks = newData.recurringTasks.map(t => t.id === newTask.id ? newTask : t);
      } else {
        const dateStr = newTask.createdAt;
        if (newData.days[dateStr]) {
          newData.days[dateStr].tasks = newData.days[dateStr].tasks.map(t => t.id === newTask.id ? newTask : t);
        }
      }
      setData(newData);
      return true;
    } else {
      toast.error(error?.message || 'Failed to update task');
      return false;
    }
  };

  const toggleTaskCompletion = async (taskId: string, dateStr: string) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (dateStr !== todayStr) {
      toast.error('Tasks can only be completed on their scheduled date.');
      return;
    }
    if (!user || !data) return;

    const dayData = data.days[dateStr] || { tasks: [], completedTaskIds: [] };
    const isCompleted = dayData.completedTaskIds.includes(taskId);

    const previousData = structuredClone(data);
    const newData = structuredClone(data);
    if (!newData.days[dateStr]) newData.days[dateStr] = { tasks: [], completedTaskIds: [] };

    if (isCompleted) {
      newData.days[dateStr].completedTaskIds = newData.days[dateStr].completedTaskIds.filter(id => id !== taskId);
      setData(newData);
      const { error } = await supabase.from('task_completions').delete().match({ user_id: user.id, task_id: taskId, completed_date: dateStr });
      if (error) {
        setData(previousData);
        toast.error(error.message || 'Failed to update task status');
      }
    } else {
      newData.days[dateStr].completedTaskIds.push(taskId);
      setData(newData);
      const { error } = await supabase.from('task_completions').insert({ user_id: user.id, task_id: taskId, completed_date: dateStr });
      if (error) {
        setData(previousData);
        toast.error(error.message || 'Failed to update task status');
      }
    }
  };

  const skipTask = async (taskId: string, dateStr: string, isRecurring: boolean) => {
    if (!user || !data) return;
    const task = isRecurring
      ? data.recurringTasks.find(t => t.id === taskId)
      : data.days[dateStr]?.tasks.find(t => t.id === taskId);

    if (!task) return;

    if (isRecurring) {
      const meta = parseTaskMetadata(task);
      meta.skippedDates = [...(meta.skippedDates || []), dateStr];
      const updatedTask = { ...task, description: serializeTaskMetadata(meta), metadata: meta };
      const success = await updateTask(updatedTask);
      if (success) {
        toast.success('Task skipped for today');
      }
    } else {
      // Non-recurring: move to tomorrow using calendar-aware date addition
      const tomorrowStr = format(addDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
      const updatedTask = { ...task, createdAt: tomorrowStr };

      const previousData = structuredClone(data);
      const newData = structuredClone(data);
      if (newData.days[dateStr]) {
        newData.days[dateStr].tasks = newData.days[dateStr].tasks.filter(t => t.id !== taskId);
      }
      if (!newData.days[tomorrowStr]) {
        newData.days[tomorrowStr] = { tasks: [], completedTaskIds: [] };
      }
      newData.days[tomorrowStr].tasks.push(updatedTask);
      setData(newData);

      const { error } = await supabase.from('tasks').update({ created_at: tomorrowStr }).match({ id: task.id, user_id: user.id });
      if (error) {
        setData(previousData);
        toast.error('Failed to move task');
      } else {
        toast.success('Task moved to tomorrow');
      }
    }
  };

  const updateNote = async (dateStr: string, note: string) => {
    if (!user || !data) return;

    const previousData = structuredClone(data);
    const newData = structuredClone(data);
    if (!newData.days[dateStr]) newData.days[dateStr] = { tasks: [], completedTaskIds: [] };
    newData.days[dateStr].note = note;
    setData(newData);

    const { error } = await supabase.from('daily_data').upsert(
      { user_id: user.id, date: dateStr, note },
      { onConflict: 'user_id,date' }
    );
    if (error) {
      setData(previousData);
      toast.error('Failed to save note');
    }
  };

  const toggleManualCompletion = async (dateStr: string) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (dateStr !== todayStr) {
      toast.error('Manual completion can only be toggled for today.');
      return;
    }
    if (!user || !data) return;

    const isManuallyCompleted = !!data.days[dateStr]?.manualCompletion;
    const nextState = !isManuallyCompleted;

    const previousData = structuredClone(data);
    const newData = structuredClone(data);
    if (!newData.days[dateStr]) newData.days[dateStr] = { tasks: [], completedTaskIds: [] };
    newData.days[dateStr].manualCompletion = nextState;
    setData(newData);

    const { error } = await supabase.from('daily_data').upsert(
      { user_id: user.id, date: dateStr, manual_completion: nextState },
      { onConflict: 'user_id,date' }
    );
    if (error) {
      setData(previousData);
      toast.error(error.message || 'Failed to update completion status');
    }
  };

  const deleteTask = async (taskId: string, _dateStr?: string, _isRecurring?: boolean) => {
    if (!user || !data) return;

    const previousData = structuredClone(data);
    const newData = structuredClone(data);

    newData.recurringTasks = newData.recurringTasks.filter(t => t.id !== taskId);
    Object.keys(newData.days).forEach(d => {
      newData.days[d].tasks = newData.days[d].tasks.filter(t => t.id !== taskId);
      newData.days[d].completedTaskIds = newData.days[d].completedTaskIds.filter(id => id !== taskId);
    });
    setData(newData);

    const { error } = await supabase.from('tasks').delete().match({ id: taskId, user_id: user.id });
    if (error) {
      setData(previousData);
      toast.error('Failed to delete task');
    } else {
      toast.success('Task deleted');
    }
  };

  return {
    data,
    loading,
    addTask,
    updateTask,
    skipTask,
    toggleTaskCompletion,
    updateNote,
    toggleManualCompletion,
    deleteTask,
    refresh: fetchData
  };
}




