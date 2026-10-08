import { differenceInDays, format, parseISO, subDays, getDay, isBefore, startOfDay } from 'date-fns';
import { RRule } from 'rrule';

export type TaskMetadata = {
  notes?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'pending' | 'skipped' | 'cancelled';
  skippedDates?: string[]; // YYYY-MM-DD format
  rrule?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string; // HH:mm format
  endTime?: string; // HH:mm format
};

export type Task = {
  id: string;
  name: string;
  category?: string;
  duration?: string;
  recurring: 'none' | 'daily' | 'weekdays' | 'weekly' | 'custom';
  createdAt: string; // YYYY-MM-DD
  description?: string; // serialized JSON of TaskMetadata
  metadata?: TaskMetadata;
};

export const parseTaskMetadata = (task: Task): TaskMetadata => {
  if (task.metadata) return task.metadata;
  if (!task.description) return {};
  try {
    return JSON.parse(task.description);
  } catch {
    return {};
  }
};

export const serializeTaskMetadata = (metadata: TaskMetadata): string => {
  return JSON.stringify(metadata);
};

export type DailyData = {
  tasks: Task[]; // specific to this day (not recurring)
  completedTaskIds: string[]; // IDs of tasks completed on this day
  note?: string;
  manualCompletion?: boolean;
};

export type AppData = {
  version: 2;
  days: Record<string, DailyData>;
  recurringTasks: Task[];
  settings: {
    theme: 'dark' | 'light' | 'system';
    weekStartsOn: 0 | 1;
  };
};

const STORAGE_KEY = 'productivity-tracker-data';

export const DataManager = {
  loadData: (): AppData => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return DataManager.getDefaultData();
      const parsed = JSON.parse(data);
      return DataManager.migrateData(parsed);
    } catch {
      return DataManager.getDefaultData();
    }
  },

  getDefaultData: (): AppData => ({
    version: 2,
    days: {},
    recurringTasks: [],
    settings: { theme: 'dark', weekStartsOn: 0 }
  }),

  migrateData: (oldData: any): AppData => {
    if (!oldData) return DataManager.getDefaultData();
    if (oldData.version === 2) return oldData;

    const newData = DataManager.getDefaultData();
    for (const [dateStr, isCompleted] of Object.entries(oldData)) {
      if (typeof isCompleted === 'boolean' && isCompleted) {
        newData.days[dateStr] = { tasks: [], completedTaskIds: [], manualCompletion: true };
      }
    }
    return newData;
  },

  saveData: (data: AppData) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  },

  clearData: () => {
    localStorage.removeItem(STORAGE_KEY);
  },

  exportData: () => {
    const data = DataManager.loadData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `productivity-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importData: (jsonStr: string): AppData | null => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'object' && parsed !== null) {
        const migrated = DataManager.migrateData(parsed);
        DataManager.saveData(migrated);
        return migrated;
      }
    } catch {}
    return null;
  }
};

// Memoization cache for parsed RRule instances
const rruleCache = new Map<string, RRule>();

export const getParsedRRule = (rruleStr: string): RRule | null => {
  if (!rruleStr) return null;
  const cached = rruleCache.get(rruleStr);
  if (cached) return cached;
  try {
    const rule = RRule.fromString(rruleStr);
    if (rruleCache.size > 200) {
      const firstKey = rruleCache.keys().next().value;
      if (firstKey) rruleCache.delete(firstKey);
    }
    rruleCache.set(rruleStr, rule);
    return rule;
  } catch {
    return null;
  }
};

export const getTasksForDate = (data: AppData, dateStr: string): Task[] => {
  const dayData = data.days[dateStr];
  const specificTasks = dayData?.tasks || [];

  const targetDate = parseISO(dateStr);
  const targetDayOfWeek = getDay(targetDate);

  const applicableRecurring = data.recurringTasks.filter(task => {
    const meta = parseTaskMetadata(task);
    const startStr = meta.startDate || task.createdAt;
    const createdDate = parseISO(startStr);

    // Check start date
    if (isBefore(targetDate, startOfDay(createdDate))) return false;

    // Check end date
    if (meta.endDate && isBefore(parseISO(meta.endDate), startOfDay(targetDate))) return false;

    // Do not show skipped occurrences
    if (meta.skippedDates?.includes(dateStr)) return false;

    if (task.recurring === 'daily') return true;
    if (task.recurring === 'weekdays') return targetDayOfWeek >= 1 && targetDayOfWeek <= 5;
    if (task.recurring === 'weekly') return getDay(createdDate) === targetDayOfWeek;

    if (task.recurring === 'custom' && meta.rrule) {
      try {
        const rule = getParsedRRule(meta.rrule);
        if (!rule) return false;

        // RRule uses UTC dates. We need to convert our local targetDate to UTC for matching
        const utcTarget = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()));

        // Find occurrences around the target date
        const occurrences = rule.between(
           new Date(utcTarget.getTime() - 24 * 60 * 60 * 1000),
           new Date(utcTarget.getTime() + 24 * 60 * 60 * 1000),
           true
        );

        // Check if any occurrence matches our target day
        return occurrences.some(d =>
          d.getUTCFullYear() === targetDate.getFullYear() &&
          d.getUTCMonth() === targetDate.getMonth() &&
          d.getUTCDate() === targetDate.getDate()
        );
      } catch (e) {
        return false;
      }
    }

    return false;
  });

  return [...specificTasks, ...applicableRecurring];
};

export const getDayCompletionInfo = (data: AppData, dateStr: string) => {
  const dayData = data.days[dateStr];
  const allTasks = getTasksForDate(data, dateStr);

  // Exclude cancelled tasks from total count
  const validTasks = allTasks.filter(t => {
    const meta = parseTaskMetadata(t);
    // If it's a specific task that was cancelled
    if (meta.status === 'cancelled') return false;
    // We keep skipped tasks in the total tasks (so percent drops)
    return true;
  });

  const totalTasks = validTasks.length;

  if (totalTasks === 0) {
    const isManuallyCompleted = !!dayData?.manualCompletion;
    return {
      completed: isManuallyCompleted,
      percent: isManuallyCompleted ? 100 : 0,
      completedCount: isManuallyCompleted ? 1 : 0,
      totalCount: isManuallyCompleted ? 1 : 0
    };
  }

  const completedCount = validTasks.filter(t => dayData?.completedTaskIds.includes(t.id)).length;
  const percent = Math.round((completedCount / totalTasks) * 100);

  return {
    completed: percent === 100,
    percent,
    completedCount,
    totalCount: totalTasks
  };
};

export const calculateStats = (data: AppData, year: number) => {
  let completedDays = 0;
  let totalTasksCompleted = 0;

  const allCompletedDates: Date[] = [];

  Object.keys(data.days).forEach(dateStr => {
    const info = getDayCompletionInfo(data, dateStr);
    if (info.completed) {
      allCompletedDates.push(parseISO(dateStr));
    }
    if (dateStr.startsWith(year.toString())) {
      if (info.completed) completedDays++;
      totalTasksCompleted += info.completedCount;
    }
  });

  allCompletedDates.sort((a, b) => a.getTime() - b.getTime());

  let currentStreak = 0;
  let longestStreak = 0;
  let currentRun = 0;
  let prevDate: Date | null = null;

  for (const date of allCompletedDates) {
    if (!prevDate) {
      currentRun = 1;
    } else {
      const diff = differenceInDays(date, prevDate);
      if (diff === 1) {
        currentRun++;
      } else if (diff > 1) {
        currentRun = 1;
      }
    }
    if (currentRun > longestStreak) {
      longestStreak = currentRun;
    }
    prevDate = date;
  }

  const today = startOfDay(new Date());
  const yesterday = subDays(today, 1);

  if (allCompletedDates.length > 0) {
    let tempStreak = 0;
    const todayStr = format(today, 'yyyy-MM-dd');
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

    if (getDayCompletionInfo(data, todayStr).completed) {
       let cur = today;
       while (getDayCompletionInfo(data, format(cur, 'yyyy-MM-dd')).completed) {
         tempStreak++;
         cur = subDays(cur, 1);
       }
    } else if (getDayCompletionInfo(data, yesterdayStr).completed) {
       let cur = yesterday;
       while (getDayCompletionInfo(data, format(cur, 'yyyy-MM-dd')).completed) {
         tempStreak++;
         cur = subDays(cur, 1);
       }
    }
    currentStreak = tempStreak;
  }

  const completionRate = Object.keys(data.days).length > 0
    ? Math.round((completedDays / Object.keys(data.days).length) * 100)
    : 0;

  return {
    completedDays,
    totalTasksCompleted,
    currentStreak,
    longestStreak,
    completionRate
  };
};
