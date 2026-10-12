import { describe, it, expect } from 'vitest';
import { calculatePeakDayStats, WEEKDAYS, type CompletionRecord } from '../components/WhenYouWorkComposedChart';
import type { AppData } from '../lib/dataManager';

describe('WhenYouWorkComposedChart - Peak Day Calculation & Metrics', () => {
  const emptyData: AppData = {
    version: 2,
    days: {},
    recurringTasks: [],
    settings: { theme: 'dark', weekStartsOn: 0 },
  };

  it('orders weekdays consistently from Monday through Sunday', () => {
    const keys = WEEKDAYS.map((w) => w.key);
    expect(keys).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    const indices = WEEKDAYS.map((w) => w.index);
    expect(indices).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('identifies the day when the user works most from timestamped completions', () => {
    // 2 completions on Monday (index 1)
    // 5 completions on Wednesday (index 3)
    // 1 completion on Friday (index 5)
    const completions: CompletionRecord[] = [
      { created_at: new Date(2026, 9, 5, 9, 0).toISOString(), completed_date: '2026-10-05' }, // Mon
      { created_at: new Date(2026, 9, 5, 14, 30).toISOString(), completed_date: '2026-10-05' }, // Mon
      { created_at: new Date(2026, 9, 7, 10, 0).toISOString(), completed_date: '2026-10-07' }, // Wed
      { created_at: new Date(2026, 9, 7, 11, 0).toISOString(), completed_date: '2026-10-07' }, // Wed
      { created_at: new Date(2026, 9, 7, 14, 0).toISOString(), completed_date: '2026-10-07' }, // Wed
      { created_at: new Date(2026, 9, 7, 15, 30).toISOString(), completed_date: '2026-10-07' }, // Wed
      { created_at: new Date(2026, 9, 7, 16, 0).toISOString(), completed_date: '2026-10-07' }, // Wed
      { created_at: new Date(2026, 9, 9, 17, 0).toISOString(), completed_date: '2026-10-09' }, // Fri
    ];

    const stats = calculatePeakDayStats(emptyData, completions, {});

    expect(stats.hasActivity).toBe(true);
    expect(stats.peakWeekday.name).toBe('Wednesday');
    expect(stats.peakWeekday.short).toBe('Wed');
    expect(stats.totalWeekdayTasks).toBe(8);
    expect(stats.weekdayCounts[3]).toBe(5); // Wednesday
    expect(stats.weekdayCounts[1]).toBe(2); // Monday
    expect(stats.weekdayCounts[5]).toBe(1); // Friday
  });

  it('detects peak focus hour and formats peak window correctly', () => {
    // 3 completions at 2 PM (hour 14) on Tuesday (local time)
    const t1 = new Date(2026, 9, 6, 14, 10).toISOString();
    const t2 = new Date(2026, 9, 6, 14, 35).toISOString();
    const t3 = new Date(2026, 9, 6, 14, 50).toISOString();
    const t4 = new Date(2026, 9, 6, 10, 0).toISOString();

    const completions: CompletionRecord[] = [
      { created_at: t1, completed_date: '2026-10-06' },
      { created_at: t2, completed_date: '2026-10-06' },
      { created_at: t3, completed_date: '2026-10-06' },
      { created_at: t4, completed_date: '2026-10-06' },
    ];

    const hourlyData = { 10: 1, 14: 3 };
    const stats = calculatePeakDayStats(emptyData, completions, hourlyData);

    expect(stats.peakWeekday.name).toBe('Tuesday');
    expect(stats.peakHour).toBe(14);
    expect(stats.peakHourLabel).toBe('2 PM');
    expect(stats.peakWindowLabel).toBe('2 PM – 4 PM');
  });

  it('falls back to AppData days if timestamped completions are not present', () => {
    // Oct 6, 2026 is a Tuesday (getDay = 2)
    const testData: AppData = {
      version: 2,
      days: {
        '2026-10-06': {
          tasks: [
            { id: '1', name: 'T1', recurring: 'none', createdAt: '2026-10-06' },
            { id: '2', name: 'T2', recurring: 'none', createdAt: '2026-10-06' },
            { id: '3', name: 'T3', recurring: 'none', createdAt: '2026-10-06' },
          ],
          completedTaskIds: ['1', '2', '3'],
        },
      },
      recurringTasks: [],
      settings: { theme: 'dark', weekStartsOn: 0 },
    };

    const stats = calculatePeakDayStats(testData, [], {});

    expect(stats.hasActivity).toBe(true);
    expect(stats.peakWeekday.name).toBe('Tuesday');
    expect(stats.weekdayCounts[2]).toBe(3);
    expect(stats.totalWeekdayTasks).toBe(3);
  });

  it('handles zero activity as an honest empty state without division by zero', () => {
    const stats = calculatePeakDayStats(emptyData, [], {});

    expect(stats.hasActivity).toBe(false);
    expect(stats.totalWeekdayTasks).toBe(0);
    expect(stats.peakHour).toBeNull();
    // Default fallback to Tuesday/Monday without crash
    expect(stats.peakWeekday).toBeDefined();
    for (const w of WEEKDAYS) {
      expect(stats.weekdayCounts[w.index]).toBe(0);
    }
  });

  it('handles null data and empty lists safely without throwing', () => {
    expect(() => calculatePeakDayStats(null, [], {})).not.toThrow();
    const stats = calculatePeakDayStats(null, undefined, undefined);
    expect(stats.hasActivity).toBe(false);
  });
});
