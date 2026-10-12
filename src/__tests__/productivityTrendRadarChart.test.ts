import { describe, it, expect } from 'vitest';
import { format, subDays, startOfDay, getDay } from 'date-fns';
import { calculateRadarStats, RADAR_WEEKDAYS } from '../components/ProductivityTrendRadarChart';
import type { AppData } from '../lib/dataManager';

describe('Productivity Trend Radar Chart - Logic & Calculation Verification', () => {
  const emptyData: AppData = {
    version: 2,
    days: {},
    recurringTasks: [],
    settings: { theme: 'dark', weekStartsOn: 0 },
  };

  it('orders weekday axes consistently from Monday through Sunday', () => {
    const keys = RADAR_WEEKDAYS.map((m) => m.key);
    expect(keys).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

    const dayIndices = RADAR_WEEKDAYS.map((m) => m.dayIndex);
    expect(dayIndices).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('generates two non-overlapping 7-day periods ending today (14 days total)', () => {
    const referenceDate = new Date(2026, 3, 15); // Fixed reference date
    const stats = calculateRadarStats(emptyData, referenceDate);

    expect(stats.metrics).toHaveLength(7);

    // Check each weekday has a valid latest and previous date
    for (const metric of RADAR_WEEKDAYS) {
      const comp = stats.comparisons[metric.key];
      expect(comp).toBeDefined();
      expect(getDay(comp.latest.date)).toBe(metric.dayIndex);
      expect(getDay(comp.previous.date)).toBe(metric.dayIndex);

      // Latest date must be strictly after previous date by exactly 7 days
      const diffMs = comp.latest.date.getTime() - comp.previous.date.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(7);
    }

    // Verify date range strings
    expect(stats.dateRangeLatest).toContain('–');
    expect(stats.dateRangePrevious).toContain('–');
  });

  it('correctly aligns weekdays when reference date is Sunday, Monday, or mid-week', () => {
    const datesToTest = [
      new Date(2026, 3, 12), // Sunday
      new Date(2026, 3, 13), // Monday
      new Date(2026, 3, 16), // Thursday
      new Date(2026, 3, 18), // Saturday
    ];

    for (const ref of datesToTest) {
      const stats = calculateRadarStats(emptyData, ref);
      const today = startOfDay(ref);

      // Latest window must end on ref
      for (const metric of RADAR_WEEKDAYS) {
        const comp = stats.comparisons[metric.key];
        expect(comp.latest.date.getTime()).toBeLessThanOrEqual(today.getTime());
        expect(comp.latest.date.getTime()).toBeGreaterThanOrEqual(subDays(today, 6).getTime());
        expect(comp.previous.date.getTime()).toBeLessThanOrEqual(subDays(today, 7).getTime());
        expect(comp.previous.date.getTime()).toBeGreaterThanOrEqual(subDays(today, 13).getTime());
      }
    }
  });

  it('normalizes activity 0-100 against a SINGLE SHARED maximum across both periods', () => {
    const referenceDate = new Date(2026, 3, 15); // Wednesday
    const today = startOfDay(referenceDate);

    // Let's populate some tasks:
    // In latest 7 days: Monday has 10 tasks completed (the global maximum across 14 days)
    // In previous 7 days: Wednesday has 5 tasks completed
    const latestMonStr = format(subDays(today, (getDay(today) - 1 + 7) % 7), 'yyyy-MM-dd');
    const prevWedStr = format(subDays(today, 7), 'yyyy-MM-dd');

    const testData: AppData = {
      version: 2,
      days: {
        [latestMonStr]: {
          tasks: [
            { id: '1', name: 'Task 1', recurring: 'none', createdAt: latestMonStr },
            { id: '2', name: 'Task 2', recurring: 'none', createdAt: latestMonStr },
            { id: '3', name: 'Task 3', recurring: 'none', createdAt: latestMonStr },
            { id: '4', name: 'Task 4', recurring: 'none', createdAt: latestMonStr },
            { id: '5', name: 'Task 5', recurring: 'none', createdAt: latestMonStr },
            { id: '6', name: 'Task 6', recurring: 'none', createdAt: latestMonStr },
            { id: '7', name: 'Task 7', recurring: 'none', createdAt: latestMonStr },
            { id: '8', name: 'Task 8', recurring: 'none', createdAt: latestMonStr },
            { id: '9', name: 'Task 9', recurring: 'none', createdAt: latestMonStr },
            { id: '10', name: 'Task 10', recurring: 'none', createdAt: latestMonStr },
          ],
          completedTaskIds: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        },
        [prevWedStr]: {
          tasks: [
            { id: 'p1', name: 'P1', recurring: 'none', createdAt: prevWedStr },
            { id: 'p2', name: 'P2', recurring: 'none', createdAt: prevWedStr },
            { id: 'p3', name: 'P3', recurring: 'none', createdAt: prevWedStr },
            { id: 'p4', name: 'P4', recurring: 'none', createdAt: prevWedStr },
            { id: 'p5', name: 'P5', recurring: 'none', createdAt: prevWedStr },
          ],
          completedTaskIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
        },
      },
      recurringTasks: [],
      settings: { theme: 'dark', weekStartsOn: 0 },
    };

    const stats = calculateRadarStats(testData, referenceDate);

    // Global max must be 10 (from Monday)
    expect(stats.maxCount).toBe(10);
    expect(stats.hasActivity).toBe(true);

    // Monday in latest period should be 100%
    const monComp = stats.comparisons['Mon'];
    expect(monComp.latest.completed).toBe(10);
    expect(monComp.latest.normalized).toBe(100);

    // Wednesday in previous period had 5 completed tasks.
    // Under shared normalization (max=10), it MUST normalize to 50% (5/10), NOT 100%!
    const wedComp = stats.comparisons['Wed'];
    expect(wedComp.previous.completed).toBe(5);
    expect(wedComp.previous.normalized).toBe(50);

    // Series values in radarSeries match normalized values
    const prevSeries = stats.radarSeries[0];
    const latestSeries = stats.radarSeries[1];
    expect(prevSeries.values['Wed']).toBe(50);
    expect(latestSeries.values['Mon']).toBe(100);
  });

  it('handles all-zero activity as an honest empty state without division by zero', () => {
    const stats = calculateRadarStats(emptyData);

    expect(stats.maxCount).toBe(0);
    expect(stats.hasActivity).toBe(false);
    expect(stats.totalLatest).toBe(0);
    expect(stats.totalPrevious).toBe(0);
    expect(stats.deltaTasks).toBe(0);
    expect(stats.deltaPercentage).toBeNull();
    expect(stats.busiestWeekday).toBeNull();

    for (const metric of RADAR_WEEKDAYS) {
      const comp = stats.comparisons[metric.key];
      expect(comp.latest.completed).toBe(0);
      expect(comp.latest.normalized).toBe(0);
      expect(comp.previous.completed).toBe(0);
      expect(comp.previous.normalized).toBe(0);
      expect(Number.isNaN(comp.latest.normalized)).toBe(false);
      expect(Number.isFinite(comp.latest.normalized)).toBe(true);
    }
  });

  it('handles null AppData safely without crashing', () => {
    const stats = calculateRadarStats(null);
    expect(stats.maxCount).toBe(0);
    expect(stats.hasActivity).toBe(false);
    expect(stats.totalLatest).toBe(0);
    expect(stats.totalPrevious).toBe(0);
  });

  it('calculates total completions, delta, and percentage change accurately', () => {
    const referenceDate = new Date(2026, 3, 15);
    const today = startOfDay(referenceDate);

    const dateA = format(today, 'yyyy-MM-dd'); // 8 tasks
    const dateB = format(subDays(today, 8), 'yyyy-MM-dd'); // 4 tasks

    const testData: AppData = {
      version: 2,
      days: {
        [dateA]: {
          tasks: [
            { id: '1', name: 'T1', recurring: 'none', createdAt: dateA },
            { id: '2', name: 'T2', recurring: 'none', createdAt: dateA },
            { id: '3', name: 'T3', recurring: 'none', createdAt: dateA },
            { id: '4', name: 'T4', recurring: 'none', createdAt: dateA },
            { id: '5', name: 'T5', recurring: 'none', createdAt: dateA },
            { id: '6', name: 'T6', recurring: 'none', createdAt: dateA },
            { id: '7', name: 'T7', recurring: 'none', createdAt: dateA },
            { id: '8', name: 'T8', recurring: 'none', createdAt: dateA },
          ],
          completedTaskIds: ['1', '2', '3', '4', '5', '6', '7', '8'],
        },
        [dateB]: {
          tasks: [
            { id: '10', name: 'T10', recurring: 'none', createdAt: dateB },
            { id: '11', name: 'T11', recurring: 'none', createdAt: dateB },
            { id: '12', name: 'T12', recurring: 'none', createdAt: dateB },
            { id: '13', name: 'T13', recurring: 'none', createdAt: dateB },
          ],
          completedTaskIds: ['10', '11', '12', '13'],
        },
      },
      recurringTasks: [],
      settings: { theme: 'dark', weekStartsOn: 0 },
    };

    const stats = calculateRadarStats(testData, referenceDate);
    expect(stats.totalLatest).toBe(8);
    expect(stats.totalPrevious).toBe(4);
    expect(stats.deltaTasks).toBe(4);
    expect(stats.deltaPercentage).toBe(100); // (8-4)/4 * 100 = 100%
  });
});
