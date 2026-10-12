import { describe, it, expect } from 'vitest';
import {
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  getDaysInYear,
} from 'date-fns';
import {
  getDayCompletionInfo,
  type AppData,
  type Task,
} from '../lib/dataManager';
import {
  rotateHeatmapColumnBins,
  isHeatmapGhostBin,
  type HeatmapColumn,
  type HeatmapBin,
} from '../components/charts/heatmap';

describe('Productivity Activity Heatmap - Logic & Model Verification', () => {
  const sampleTask: Task = {
    id: 't-1',
    name: 'Workout',
    createdAt: '2026-01-01',
    recurring: 'none',
  };

  const sampleData: AppData = {
    version: 2,
    days: {
      // 0% completion (0/4) -> Level 0
      '2026-01-05': {
        tasks: [
          { ...sampleTask, id: 'a1' },
          { ...sampleTask, id: 'a2' },
          { ...sampleTask, id: 'a3' },
          { ...sampleTask, id: 'a4' },
        ],
        completedTaskIds: [],
      },
      // 20% completion (1/5) -> Level 1 (0 < % < 25)
      '2026-01-06': {
        tasks: [
          { ...sampleTask, id: 'b1' },
          { ...sampleTask, id: 'b2' },
          { ...sampleTask, id: 'b3' },
          { ...sampleTask, id: 'b4' },
          { ...sampleTask, id: 'b5' },
        ],
        completedTaskIds: ['b1'],
      },
      // 33% completion (1/3) -> Level 2 (25 <= % < 50)
      '2026-01-07': {
        tasks: [
          { ...sampleTask, id: 'c1' },
          { ...sampleTask, id: 'c2' },
          { ...sampleTask, id: 'c3' },
        ],
        completedTaskIds: ['c1'],
      },
      // 67% completion (2/3) -> Level 3 (50 <= % < 75)
      '2026-01-08': {
        tasks: [
          { ...sampleTask, id: 'd1' },
          { ...sampleTask, id: 'd2' },
          { ...sampleTask, id: 'd3' },
        ],
        completedTaskIds: ['d1', 'd2'],
      },
      // 75% completion (3/4) -> Level 4 (>= 75%)
      '2026-01-09': {
        tasks: [
          { ...sampleTask, id: 'e1' },
          { ...sampleTask, id: 'e2' },
          { ...sampleTask, id: 'e3' },
          { ...sampleTask, id: 'e4' },
        ],
        completedTaskIds: ['e1', 'e2', 'e3'],
      },
      // 100% completion (4/4) -> Level 4 (>= 75%)
      '2026-01-10': {
        tasks: [
          { ...sampleTask, id: 'f1' },
          { ...sampleTask, id: 'f2' },
          { ...sampleTask, id: 'f3' },
          { ...sampleTask, id: 'f4' },
        ],
        completedTaskIds: ['f1', 'f2', 'f3', 'f4'],
      },
      // Manual completion with 0 tasks -> Level 4
      '2026-01-11': {
        tasks: [],
        completedTaskIds: [],
        manualCompletion: true,
      },
    },
    recurringTasks: [],
    settings: { theme: 'dark', weekStartsOn: 1 },
  };

  it('correctly maps task completion percentages to the 5 Eustace heatmap levels', () => {
    const dates = [
      { dateStr: '2026-01-05', expectedLevel: 0, expectedPercent: 0 },
      { dateStr: '2026-01-06', expectedLevel: 1, expectedPercent: 20 },
      { dateStr: '2026-01-07', expectedLevel: 2, expectedPercent: 33 },
      { dateStr: '2026-01-08', expectedLevel: 3, expectedPercent: 67 },
      { dateStr: '2026-01-09', expectedLevel: 4, expectedPercent: 75 },
      { dateStr: '2026-01-10', expectedLevel: 4, expectedPercent: 100 },
      { dateStr: '2026-01-11', expectedLevel: 4, expectedPercent: 100 },
    ];

    for (const { dateStr, expectedLevel, expectedPercent } of dates) {
      const info = getDayCompletionInfo(sampleData, dateStr);
      let level = 0;
      if (info.percent > 0) level = 1;
      if (info.percent >= 25) level = 2;
      if (info.percent >= 50) level = 3;
      if (info.percent >= 75) level = 4;
      if (info.completedCount > 0 && info.totalCount === 0 && info.completed) {
        level = 4;
      }
      expect(info.percent).toBe(expectedPercent);
      expect(level).toBe(expectedLevel);
    }
  });

  it('handles leap years accurately (366 days for 2024 vs 365 days for 2025/2026)', () => {
    const leapYearDays = getDaysInYear(new Date(2024, 0, 1));
    const regularYear2025 = getDaysInYear(new Date(2025, 0, 1));
    const regularYear2026 = getDaysInYear(new Date(2026, 0, 1));

    expect(leapYearDays).toBe(366);
    expect(regularYear2025).toBe(365);
    expect(regularYear2026).toBe(365);

    // Verify Feb 29 exists in 2024
    const feb29_2024 = new Date(2024, 1, 29);
    expect(feb29_2024.getMonth()).toBe(1);
    expect(feb29_2024.getDate()).toBe(29);
  });

  it('builds calendar interval starting on Monday and ending on Sunday', () => {
    const year = 2026;
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    const calendarStart = startOfWeek(startDate, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(endDate, { weekStartsOn: 1 });

    // calendarStart must be a Monday (day index 1)
    expect(calendarStart.getDay()).toBe(1);
    // calendarEnd must be a Sunday (day index 0)
    expect(calendarEnd.getDay()).toBe(0);

    const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    expect(allDays.length % 7).toBe(0);
    const weekCount = allDays.length / 7;
    expect(weekCount).toBeGreaterThanOrEqual(52);
    expect(weekCount).toBeLessThanOrEqual(54);
  });

  it('rotates Sun-first bins by weekStartDay=1 to align Row 0 to Monday and Row 6 to Sunday', () => {
    // Mock a 7-day week column where Sunday is bin 0, Monday is bin 1 ... Saturday is bin 6
    const sunDate = new Date(2026, 0, 4); // Sunday
    const monDate = new Date(2026, 0, 5); // Monday
    const tueDate = new Date(2026, 0, 6);
    const wedDate = new Date(2026, 0, 7);
    const thuDate = new Date(2026, 0, 8);
    const friDate = new Date(2026, 0, 9);
    const satDate = new Date(2026, 0, 10);

    const inputColumn: HeatmapColumn = {
      bin: 0,
      bins: [
        { bin: 0, count: 0, date: sunDate },
        { bin: 1, count: 1, date: monDate },
        { bin: 2, count: 2, date: tueDate },
        { bin: 3, count: 3, date: wedDate },
        { bin: 4, count: 4, date: thuDate },
        { bin: 5, count: 0, date: friDate },
        { bin: 6, count: 0, date: satDate },
      ],
    };

    const rotated = rotateHeatmapColumnBins([inputColumn], 1);
    const rotatedBins = rotated[0].bins;

    expect(rotatedBins).toHaveLength(7);
    // Index 0 must now be Monday
    expect(rotatedBins[0].date).toBe(monDate);
    // Index 1 must be Tuesday
    expect(rotatedBins[1].date).toBe(tueDate);
    // Index 5 must be Saturday
    expect(rotatedBins[5].date).toBe(satDate);
    // Index 6 must be Sunday
    expect(rotatedBins[6].date).toBe(sunDate);
  });

  it('correctly filters padding dates from adjacent years via displayRange ghost-bin check', () => {
    const year = 2026;
    const displayRange = {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
    };

    // Dates outside 2026
    const prevYearPadding: HeatmapBin = {
      bin: 0,
      count: 0,
      date: new Date(2025, 11, 29),
    };
    const nextYearPadding: HeatmapBin = {
      bin: 0,
      count: 0,
      date: new Date(2027, 0, 2),
    };

    // Dates inside 2026
    const firstDayOfYear: HeatmapBin = {
      bin: 3,
      count: 0,
      date: new Date(2026, 0, 1),
    };
    const midYearDay: HeatmapBin = {
      bin: 2,
      count: 3,
      date: new Date(2026, 6, 15),
    };
    const lastDayOfYear: HeatmapBin = {
      bin: 3,
      count: 4,
      date: new Date(2026, 11, 31),
    };

    expect(isHeatmapGhostBin(prevYearPadding, displayRange)).toBe(true);
    expect(isHeatmapGhostBin(nextYearPadding, displayRange)).toBe(true);

    expect(isHeatmapGhostBin(firstDayOfYear, displayRange)).toBe(false);
    expect(isHeatmapGhostBin(midYearDay, displayRange)).toBe(false);
    expect(isHeatmapGhostBin(lastDayOfYear, displayRange)).toBe(false);
  });

  it('preserves zero-activity days honestly without fabricating values', () => {
    const emptyDayStr = '2026-03-15';
    const info = getDayCompletionInfo(sampleData, emptyDayStr);
    expect(info.completedCount).toBe(0);
    expect(info.totalCount).toBe(0);
    expect(info.percent).toBe(0);
    expect(info.completed).toBe(false);
  });

  it('handles year change dynamically when switching selected year', () => {
    const year2025 = 2025;
    const year2026 = 2026;

    const range2025 = {
      start: new Date(year2025, 0, 1),
      end: new Date(year2025, 11, 31, 23, 59, 59, 999),
    };
    const range2026 = {
      start: new Date(year2026, 0, 1),
      end: new Date(year2026, 11, 31, 23, 59, 59, 999),
    };

    const bin2025: HeatmapBin = { bin: 0, count: 0, date: new Date(2025, 5, 1) };
    const bin2026: HeatmapBin = { bin: 0, count: 0, date: new Date(2026, 5, 1) };

    // When 2025 is selected:
    expect(isHeatmapGhostBin(bin2025, range2025)).toBe(false);
    expect(isHeatmapGhostBin(bin2026, range2025)).toBe(true);

    // When 2026 is selected:
    expect(isHeatmapGhostBin(bin2025, range2026)).toBe(true);
    expect(isHeatmapGhostBin(bin2026, range2026)).toBe(false);
  });
});
