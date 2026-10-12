import { describe, it, expect } from 'vitest';
import { format, subDays, startOfDay } from 'date-fns';
import { getDayCompletionInfo, type AppData } from '../lib/dataManager';

describe('Weekly Productivity Chart - Data Model & Calculation Verification', () => {
  const today = startOfDay(new Date());

  const generateSevenDayWindow = (data: AppData) => {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const weekday = format(date, 'EEE');
      const info = getDayCompletionInfo(data, dateStr);
      result.push({
        name: weekday,
        date,
        dateStr,
        percent: info.percent,
        completed: info.completedCount,
        total: info.totalCount,
        isCurrentDay: i === 0,
      });
    }
    return result;
  };

  it('generates exactly seven consecutive calendar dates ending today in chronological order', () => {
    const emptyData: AppData = {
      version: 2,
      days: {},
      recurringTasks: [],
      settings: { theme: 'dark', weekStartsOn: 0 },
    };

    const window = generateSevenDayWindow(emptyData);
    expect(window).toHaveLength(7);

    // Oldest first, newest last
    expect(window[0].dateStr).toBe(format(subDays(today, 6), 'yyyy-MM-dd'));
    expect(window[6].dateStr).toBe(format(today, 'yyyy-MM-dd'));

    // Check chronological order and uniqueness
    for (let i = 0; i < 6; i++) {
      expect(window[i].date.getTime()).toBeLessThan(window[i + 1].date.getTime());
    }

    const uniqueDates = new Set(window.map((d) => d.dateStr));
    expect(uniqueDates.size).toBe(7);

    // Current day flag only on today (last item)
    expect(window[6].isCurrentDay).toBe(true);
    expect(window.slice(0, 6).every((d) => !d.isCurrentDay)).toBe(true);
  });

  it('contains no future dates in the seven-day period', () => {
    const emptyData: AppData = {
      version: 2,
      days: {},
      recurringTasks: [],
      settings: { theme: 'dark', weekStartsOn: 0 },
    };

    const window = generateSevenDayWindow(emptyData);
    for (const item of window) {
      expect(item.date.getTime()).toBeLessThanOrEqual(today.getTime());
    }
  });

  it('renders zero-activity days honestly without fabricating metrics or sample data', () => {
    const emptyData: AppData = {
      version: 2,
      days: {},
      recurringTasks: [],
      settings: { theme: 'dark', weekStartsOn: 0 },
    };

    const window = generateSevenDayWindow(emptyData);
    for (const item of window) {
      expect(item.percent).toBe(0);
      expect(item.completed).toBe(0);
      expect(item.total).toBe(0);
    }
  });

  it('distinguishes days with 0 completed tasks out of scheduled tasks from days with no tasks', () => {
    const dateStr = format(subDays(today, 2), 'yyyy-MM-dd');
    const mockData: AppData = {
      version: 2,
      days: {
        [dateStr]: {
          tasks: [
            {
              id: 'task-1',
              name: 'Write docs',
              recurring: 'none',
              createdAt: dateStr,
            },
            {
              id: 'task-2',
              name: 'Fix bug',
              recurring: 'none',
              createdAt: dateStr,
            },
          ],
          completedTaskIds: [],
        },
      },
      recurringTasks: [],
      settings: { theme: 'dark', weekStartsOn: 0 },
    };

    const window = generateSevenDayWindow(mockData);
    const dayWithTasks = window.find((d) => d.dateStr === dateStr);
    expect(dayWithTasks).toBeDefined();
    expect(dayWithTasks?.total).toBe(2);
    expect(dayWithTasks?.completed).toBe(0);
    expect(dayWithTasks?.percent).toBe(0);

    const dayWithoutTasks = window.find((d) => d.dateStr !== dateStr);
    expect(dayWithoutTasks).toBeDefined();
    expect(dayWithoutTasks?.total).toBe(0);
    expect(dayWithoutTasks?.completed).toBe(0);
    expect(dayWithoutTasks?.percent).toBe(0);
  });

  it('correctly calculates proportional completion percentages and updates when tasks are completed', () => {
    const dateStr = format(subDays(today, 1), 'yyyy-MM-dd');
    const dataWithPartialCompletion: AppData = {
      version: 2,
      days: {
        [dateStr]: {
          tasks: [
            { id: 't1', name: 'Task 1', recurring: 'none', createdAt: dateStr },
            { id: 't2', name: 'Task 2', recurring: 'none', createdAt: dateStr },
            { id: 't3', name: 'Task 3', recurring: 'none', createdAt: dateStr },
            { id: 't4', name: 'Task 4', recurring: 'none', createdAt: dateStr },
          ],
          completedTaskIds: ['t1'],
        },
      },
      recurringTasks: [],
      settings: { theme: 'dark', weekStartsOn: 0 },
    };

    let window = generateSevenDayWindow(dataWithPartialCompletion);
    let day = window.find((d) => d.dateStr === dateStr);
    expect(day?.completed).toBe(1);
    expect(day?.total).toBe(4);
    expect(day?.percent).toBe(25);

    // Complete another task
    dataWithPartialCompletion.days[dateStr].completedTaskIds.push('t2');
    window = generateSevenDayWindow(dataWithPartialCompletion);
    day = window.find((d) => d.dateStr === dateStr);
    expect(day?.completed).toBe(2);
    expect(day?.total).toBe(4);
    expect(day?.percent).toBe(50);

    // Complete all tasks
    dataWithPartialCompletion.days[dateStr].completedTaskIds.push('t3', 't4');
    window = generateSevenDayWindow(dataWithPartialCompletion);
    day = window.find((d) => d.dateStr === dateStr);
    expect(day?.completed).toBe(4);
    expect(day?.total).toBe(4);
    expect(day?.percent).toBe(100);

    // Uncomplete a task
    dataWithPartialCompletion.days[dateStr].completedTaskIds = ['t1'];
    window = generateSevenDayWindow(dataWithPartialCompletion);
    day = window.find((d) => d.dateStr === dateStr);
    expect(day?.completed).toBe(1);
    expect(day?.total).toBe(4);
    expect(day?.percent).toBe(25);
  });

  it('handles unequal distribution across the week correctly', () => {
    const days: Record<string, any> = {};
    const percents = [25, 0, 50, 100, 25, 75, 0];

    for (let i = 6; i >= 0; i--) {
      const dateStr = format(subDays(today, i), 'yyyy-MM-dd');
      const targetPercent = percents[6 - i];
      if (targetPercent > 0) {
        const total = 4;
        const completedCount = Math.round((targetPercent / 100) * total);
        const tasks = Array.from({ length: total }, (_, idx) => ({
          id: `task-${i}-${idx}`,
          name: `Task ${idx}`,
          recurring: 'none' as const,
          createdAt: dateStr,
        }));
        days[dateStr] = {
          tasks,
          completedTaskIds: tasks.slice(0, completedCount).map((t) => t.id),
        };
      }
    }

    const mockData: AppData = {
      version: 2,
      days,
      recurringTasks: [],
      settings: { theme: 'dark', weekStartsOn: 0 },
    };

    const window = generateSevenDayWindow(mockData);
    expect(window).toHaveLength(7);
    expect(window.map((d) => d.percent)).toEqual([25, 0, 50, 100, 25, 75, 0]);
  });
});
