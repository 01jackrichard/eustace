import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { AppData, Task, DailyData, TaskMetadata } from '../lib/dataManager';
import { calculateStats, parseTaskMetadata, serializeTaskMetadata } from '../lib/dataManager';

export function useProductivityData(year: number) {
  const { user, profile } = useAuth();
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: dbTasks } = await supabase.from('tasks').select('*').eq('user_id', user.id);
    const { data: dbCompletions } = await supabase.from('task_completions').select('*').eq('user_id', user.id);
    const { data: dbDailyData } = await supabase.from('daily_data').select('*').eq('user_id', user.id);

    const recurringTasks: Task[] = [];
    const days: Record<string, DailyData> = {};

    if (dbTasks) {
      for (const t of dbTasks) {
        let meta: TaskMetadata = {};
        if (t.description) {
          try {
            meta = JSON.parse(t.description);
          } catch {}
        }
        
        const task: Task = {
          id: t.id,
          name: t.name,
          category: t.category,
          duration: t.duration,
          recurring: t.recurring,
          createdAt: t.created_at.split('T')[0],
          description: t.description,
          metadata: meta
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

  useEffect(() => {
    if (data && user && profile) {
      const stats = calculateStats(data, year);
      if (stats.currentStreak !== profile.current_streak) {
        supabase.from('user_stats').upsert({ user_id: user.id, current_streak: stats.currentStreak }).then();
      }
    }
  }, [data, user, profile, year]);

  const addTask = async (taskData: Omit<Task, 'id'>) => {
    if (!user || !data) return;
    
    const { data: inserted, error } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        name: taskData.name,
        category: taskData.category,
        duration: taskData.duration,
        recurring: taskData.recurring,
        created_at: taskData.createdAt,
        description: taskData.description
      }).select().single();
      
    if (inserted && !error) {
      let meta: TaskMetadata = {};
      if (inserted.description) {
        try { meta = JSON.parse(inserted.description); } catch {}
      }
      
      const newTask: Task = {
        id: inserted.id,
        name: inserted.name,
        category: inserted.category,
        duration: inserted.duration,
        recurring: inserted.recurring,
        createdAt: inserted.created_at.split('T')[0],
        description: inserted.description,
        metadata: meta
      };
      
      const newData = { ...data };
      if (newTask.recurring !== 'none') {
        newData.recurringTasks.push(newTask);
      } else {
        if (!newData.days[newTask.createdAt]) newData.days[newTask.createdAt] = { tasks: [], completedTaskIds: [] };
        newData.days[newTask.createdAt].tasks.push(newTask);
      }
      setData(newData);
    }
  };

  const updateTask = async (task: Task) => {
    if (!user || !data) return;
    const { data: updated, error } = await supabase
      .from('tasks')
      .update({
        name: task.name,
        category: task.category,
        duration: task.duration,
        recurring: task.recurring,
        description: task.description
      })
      .match({ id: task.id, user_id: user.id })
      .select().single();
      
    if (updated && !error) {
      const newData = { ...data };
      if (task.recurring !== 'none') {
        newData.recurringTasks = newData.recurringTasks.map(t => t.id === task.id ? task : t);
      } else {
        const dateStr = task.createdAt;
        if (newData.days[dateStr]) {
          newData.days[dateStr].tasks = newData.days[dateStr].tasks.map(t => t.id === task.id ? task : t);
        }
      }
      setData(newData);
    }
  };

  const toggleTaskCompletion = async (taskId: string, dateStr: string) => {
    if (!user || !data) return;
    
    const dayData = data.days[dateStr] || { tasks: [], completedTaskIds: [] };
    const isCompleted = dayData.completedTaskIds.includes(taskId);
    
    const newData = { ...data };
    if (!newData.days[dateStr]) newData.days[dateStr] = { tasks: [], completedTaskIds: [] };
    
    if (isCompleted) {
      newData.days[dateStr].completedTaskIds = newData.days[dateStr].completedTaskIds.filter(id => id !== taskId);
      setData(newData);
      await supabase.from('task_completions').delete().match({ user_id: user.id, task_id: taskId, completed_date: dateStr });
    } else {
      newData.days[dateStr].completedTaskIds.push(taskId);
      setData(newData);
      await supabase.from('task_completions').insert({ user_id: user.id, task_id: taskId, completed_date: dateStr });
    }
  };

  const skipTask = async (taskId: string, dateStr: string, isRecurring: boolean) => {
    if (!user || !data) return;
    const task = isRecurring 
      ? data.recurringTasks.find(t => t.id === taskId)
      : data.days[dateStr]?.tasks.find(t => t.id === taskId);
      
    if (!task) return;
    
    const meta = parseTaskMetadata(task);
    if (isRecurring) {
      meta.skippedDates = [...(meta.skippedDates || []), dateStr];
    } else {
      meta.status = 'skipped';
    }
    
    const updatedTask = { ...task, description: serializeTaskMetadata(meta), metadata: meta };
    await updateTask(updatedTask);
  };

  const updateNote = async (dateStr: string, note: string) => {
    if (!user || !data) return;
    
    const newData = { ...data };
    if (!newData.days[dateStr]) newData.days[dateStr] = { tasks: [], completedTaskIds: [] };
    newData.days[dateStr].note = note;
    setData(newData);
    
    const { data: existing } = await supabase.from('daily_data').select('id').match({ user_id: user.id, date: dateStr }).single();
    if (existing) {
      await supabase.from('daily_data').update({ note }).match({ id: existing.id });
    } else {
      await supabase.from('daily_data').insert({ user_id: user.id, date: dateStr, note });
    }
  };

  const toggleManualCompletion = async (dateStr: string) => {
    if (!user || !data) return;
    
    const isManuallyCompleted = !!data.days[dateStr]?.manualCompletion;
    const nextState = !isManuallyCompleted;
    
    const newData = { ...data };
    if (!newData.days[dateStr]) newData.days[dateStr] = { tasks: [], completedTaskIds: [] };
    newData.days[dateStr].manualCompletion = nextState;
    setData(newData);
    
    const { data: existing } = await supabase.from('daily_data').select('id').match({ user_id: user.id, date: dateStr }).single();
    if (existing) {
      await supabase.from('daily_data').update({ manual_completion: nextState }).match({ id: existing.id });
    } else {
      await supabase.from('daily_data').insert({ user_id: user.id, date: dateStr, manual_completion: nextState });
    }
  };

  const deleteTask = async (taskId: string, dateStr: string, isRecurring: boolean) => {
    if (!user || !data) return;
    const newData = { ...data };
    if (isRecurring) {
      newData.recurringTasks = newData.recurringTasks.filter(t => t.id !== taskId);
    } else if (newData.days[dateStr]) {
      newData.days[dateStr].tasks = newData.days[dateStr].tasks.filter(t => t.id !== taskId);
      newData.days[dateStr].completedTaskIds = newData.days[dateStr].completedTaskIds.filter(id => id !== taskId);
    }
    setData(newData);
    await supabase.from('tasks').delete().match({ id: taskId, user_id: user.id });
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
