import { differenceInDays, format, parseISO, getDay, isBefore, startOfDay } from 'date-fns';
import { RRule } from 'rrule';
import { parseTimeString } from './timeUtils';
import { calculateStreakFromDates } from './streakUtils';

export { calculateStreakFromDates };

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
  icon?: string;
  iconColor?: string;
};

export type Task = {
  id: string;
  name: string;
  category?: string;
  duration?: string;
  recurring: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  createdAt: string; // YYYY-MM-DD
  description?: string; // serialized JSON of TaskMetadata
  metadata?: TaskMetadata;
  startTime?: string;
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

/**
 * Extracts the scheduled time of a task as total minutes from midnight (0 to 1439).
 * Returns null if the task is untimed / anytime.
 */
export function getTaskScheduledMinutes(task: Task): number | null {
  const meta = parseTaskMetadata(task);

  // 1. Authoritative scheduled time field from task or task metadata
  const timeCandidate = task.startTime || meta.startTime || (meta as any).time;
  if (timeCandidate) {
    const parsed = parseTimeString(timeCandidate);
    if (parsed) return parsed.h * 60 + parsed.m;
  }

  // 2. Fallback to task.duration if formatted as a time string
  if (task.duration) {
    const parsed = parseTimeString(task.duration);
    if (parsed) return parsed.h * 60 + parsed.m;
  }

  // 3. Fallback: extract time pattern from task title (e.g. "Sleep — 10:00 PM")
  if (task.name) {
    const nameMatch = task.name.match(/(?:^|\s|[—\-–@]|at\s+)(\d{1,2}:\d{2}(?:\s?[ap]m)?|\d{1,2}\s?[ap]m)(?:\s|$)/i);
    if (nameMatch) {
      const parsed = parseTimeString(nameMatch[1]);
      if (parsed) return parsed.h * 60 + parsed.m;
    }
  }

  return null;
}

/**
 * Stably sorts tasks in ascending chronological order:
 * - Timed tasks appear first, ordered from earliest to latest (0:00 to 23:59).
 * - Untimed / anytime tasks appear at the bottom.
 * - Tasks with identical scheduled times preserve their original relative order.
 * - Untimed tasks preserve their original relative order.
 * - Does not mutate the original array.
 */
export function sortTasksChronologically(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const timeA = getTaskScheduledMinutes(a);
    const timeB = getTaskScheduledMinutes(b);

    if (timeA !== null && timeB !== null) {
      return timeA - timeB;
    }
    if (timeA !== null && timeB === null) {
      return -1; // timed before untimed
    }
    if (timeA === null && timeB !== null) {
      return 1; // untimed after timed
    }
    return 0; // both untimed, preserve relative order
  });
}

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
    if (task.recurring === 'monthly') {
      const anchorDay = createdDate.getDate();
      const daysInTargetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
      return targetDate.getDate() === Math.min(anchorDay, daysInTargetMonth);
    }
    if (task.recurring === 'yearly') {
      if (targetDate.getMonth() !== createdDate.getMonth()) return false;
      const anchorDay = createdDate.getDate();
      const daysInTargetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
      return targetDate.getDate() === Math.min(anchorDay, daysInTargetMonth);
    }

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

  return sortTasksChronologically([...specificTasks, ...applicableRecurring]);
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

export interface HeatmapDayCellModel {
  level: 0 | 1 | 2 | 3 | 4;
  completedCount: number;
  totalCount: number | null;
  percent: number | null;
  manualCompletion: boolean;
}

export const getHeatmapDayCellModel = (
  data: AppData,
  dateStr: string,
  variant: 'personal' | 'public-aggregated' = 'personal'
): HeatmapDayCellModel => {
  const dayData = data.days[dateStr];
  const manualCompletion = !!dayData?.manualCompletion;

  if (variant === 'public-aggregated') {
    const allTasks = getTasksForDate(data, dateStr);
    const validTasks = allTasks.filter(t => parseTaskMetadata(t).status !== 'cancelled');
    const taskCompletedCount =
      validTasks.length > 0
        ? validTasks.filter(t => dayData?.completedTaskIds.includes(t.id)).length
        : 0;

    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (taskCompletedCount >= 4) level = 4;
    else if (taskCompletedCount === 3) level = 3;
    else if (taskCompletedCount === 2) level = 2;
    else if (taskCompletedCount === 1) level = 1;
    else if (manualCompletion) level = 1;

    return {
      level,
      completedCount: taskCompletedCount,
      totalCount: null,
      percent: null,
      manualCompletion
    };
  }

  const info = getDayCompletionInfo(data, dateStr);
  let level: 0 | 1 | 2 | 3 | 4 = 0;
  if (info.percent > 0) level = 1;
  if (info.percent >= 25) level = 2;
  if (info.percent >= 50) level = 3;
  if (info.percent >= 75) level = 4;
  if (info.completedCount > 0 && info.totalCount === 0 && info.completed) level = 4;

  return {
    level,
    completedCount: info.completedCount,
    totalCount: info.totalCount,
    percent: info.percent,
    manualCompletion
  };
};

export const calculateLongestStreakFromDates = (dateStrings: string[]): number => {
  if (!dateStrings || dateStrings.length === 0) return 0;

  const uniqueSortedDates = Array.from(new Set(
    dateStrings.map(d => d.split('T')[0]).filter(Boolean)
  )).sort();

  if (uniqueSortedDates.length === 0) return 0;

  let longest = 0;
  let currentRun = 0;
  let prevDate: Date | null = null;

  for (const dateStr of uniqueSortedDates) {
    const date = parseISO(dateStr);
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
    if (currentRun > longest) {
      longest = currentRun;
    }
    prevDate = date;
  }

  return longest;
};

export const calculateStats = (data: AppData, year: number) => {
  let completedDays = 0;
  let totalTasksCompleted = 0;

  const activeDates: string[] = [];

  Object.keys(data.days).forEach(dateStr => {
    const info = getDayCompletionInfo(data, dateStr);
    if (info.completed || info.completedCount > 0) {
      activeDates.push(dateStr);
    }
    if (dateStr.startsWith(year.toString())) {
      if (info.completed || info.completedCount > 0) completedDays++;
      totalTasksCompleted += info.completedCount;
    }
  });

  const currentStreak = calculateStreakFromDates(activeDates);
  const longestStreak = calculateLongestStreakFromDates(activeDates);

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
