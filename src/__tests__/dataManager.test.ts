import { describe, it, expect } from 'vitest';
import { calculateStats, getDayCompletionInfo, getTasksForDate, calculateStreakFromDates, calculateLongestStreakFromDates } from '../lib/dataManager';
import type { AppData } from '../lib/dataManager';
import { format, subDays, startOfDay } from 'date-fns';

describe('DataManager Productivity & Stats Logic', () => {
  const mockData: AppData = {
    version: 2,
    settings: { theme: 'dark', weekStartsOn: 1 },
    recurringTasks: [
      {
        id: 'rec-1',
        name: 'Morning Workout',
        recurring: 'daily',
        createdAt: '2026-01-01',
      }
    ],
    days: {
      '2026-10-04': {
        tasks: [],
        completedTaskIds: ['rec-1'],
        manualCompletion: false
      },
      '2026-10-05': {
        tasks: [],
        completedTaskIds: ['rec-1'],
        manualCompletion: false
      },
      '2026-10-06': {
        tasks: [],
        completedTaskIds: ['rec-1'],
        manualCompletion: false
      }
    }
  };

  it('correctly calculates day completion for recurring tasks', () => {
    const info = getDayCompletionInfo(mockData, '2026-10-05');
    expect(info.completed).toBe(true);
    expect(info.percent).toBe(100);
    expect(info.completedCount).toBe(1);
    expect(info.totalCount).toBe(1);
  });

  it('marks day as incomplete when task is missing completion', () => {
    const emptyDayData: AppData = {
      ...mockData,
      days: {
        '2026-10-05': {
          tasks: [],
          completedTaskIds: [],
          manualCompletion: false
        }
      }
    };
    const info = getDayCompletionInfo(emptyDayData, '2026-10-05');
    expect(info.completed).toBe(false);
    expect(info.percent).toBe(0);
  });

  it('correctly calculates longest streak across consecutive dates', () => {
    const stats = calculateStats(mockData, 2026);
    expect(stats.longestStreak).toBe(3);
    expect(stats.completedDays).toBe(3);
    expect(stats.totalTasksCompleted).toBe(3);
  });

  it('correctly filters applicable recurring tasks by date', () => {
    const tasks = getTasksForDate(mockData, '2026-10-06');
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe('rec-1');
  });

  it('handles empty data gracefully', () => {
    const emptyData: AppData = {
      version: 2,
      settings: { theme: 'dark', weekStartsOn: 1 },
      recurringTasks: [],
      days: {}
    };
    const stats = calculateStats(emptyData, 2026);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.completedDays).toBe(0);
  });

  it('calculates active streak when completed today', () => {
    const today = startOfDay(new Date());
    const d0 = format(today, 'yyyy-MM-dd');
    const d1 = format(subDays(today, 1), 'yyyy-MM-dd');
    const d2 = format(subDays(today, 2), 'yyyy-MM-dd');

    const streak = calculateStreakFromDates([d0, d1, d2]);
    expect(streak).toBe(3);
  });

  it('preserves active streak when completed yesterday and today is still in progress', () => {
    const today = startOfDay(new Date());
    const d1 = format(subDays(today, 1), 'yyyy-MM-dd');
    const d2 = format(subDays(today, 2), 'yyyy-MM-dd');

    const streak = calculateStreakFromDates([d1, d2]);
    expect(streak).toBe(2);
  });

  it('returns 0 when last completion was before yesterday', () => {
    const today = startOfDay(new Date());
    const d2 = format(subDays(today, 2), 'yyyy-MM-dd');
    const d3 = format(subDays(today, 3), 'yyyy-MM-dd');

    const streak = calculateStreakFromDates([d2, d3]);
    expect(streak).toBe(0);
  });

  it('calculates longest streak correctly across disconnected segments', () => {
    const longest = calculateLongestStreakFromDates([
      '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04',
      '2026-02-01', '2026-02-02'
    ]);
    expect(longest).toBe(4);
  });
});
