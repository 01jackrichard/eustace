import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  getDaysInYear,
  format,
} from 'date-fns';
import {
  getDayCompletionInfo,
  getHeatmapDayCellModel,
  type AppData,
  type Task,
} from '../lib/dataManager';
import { ContributionGraph } from '../components/ContributionGraph';
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

  describe('Public Aggregated vs Personal Heatmap Mode (getHeatmapDayCellModel)', () => {
    const buildAggregatedDay = (date: string, count: number, manualCompletion = false) => {
      const tasks: Task[] = [];
      const completedTaskIds: string[] = [];
      for (let i = 0; i < count; i++) {
        const id = `agg-${date}-${i}`;
        completedTaskIds.push(id);
        tasks.push({
          id,
          name: 'Completed Task',
          recurring: 'none',
          createdAt: date,
        });
      }
      return { tasks, completedTaskIds, manualCompletion };
    };

    const publicAggregatedData: AppData = {
      version: 2,
      days: {
        '2026-02-01': buildAggregatedDay('2026-02-01', 0, false),
        '2026-02-02': buildAggregatedDay('2026-02-02', 1, false),
        '2026-02-03': buildAggregatedDay('2026-02-03', 2, false),
        '2026-02-04': buildAggregatedDay('2026-02-04', 3, false),
        '2026-02-05': buildAggregatedDay('2026-02-05', 4, false),
        '2026-02-06': buildAggregatedDay('2026-02-06', 7, false),
        '2026-02-07': buildAggregatedDay('2026-02-07', 0, true),
        '2026-02-08': buildAggregatedDay('2026-02-08', 1, true),
        '2026-02-09': buildAggregatedDay('2026-02-09', 2, true),
        '2026-02-10': buildAggregatedDay('2026-02-10', 4, true),
      },
      recurringTasks: [],
      settings: { theme: 'dark', weekStartsOn: 1 },
    };

    it('derives public-aggregated cell intensity directly from 0 through 4+ task completions without fabricated denominator or percent', () => {
      expect(getHeatmapDayCellModel(publicAggregatedData, '2026-02-01', 'public-aggregated')).toEqual({
        level: 0,
        completedCount: 0,
        totalCount: null,
        percent: null,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(publicAggregatedData, '2026-02-02', 'public-aggregated')).toEqual({
        level: 1,
        completedCount: 1,
        totalCount: null,
        percent: null,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(publicAggregatedData, '2026-02-03', 'public-aggregated')).toEqual({
        level: 2,
        completedCount: 2,
        totalCount: null,
        percent: null,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(publicAggregatedData, '2026-02-04', 'public-aggregated')).toEqual({
        level: 3,
        completedCount: 3,
        totalCount: null,
        percent: null,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(publicAggregatedData, '2026-02-05', 'public-aggregated')).toEqual({
        level: 4,
        completedCount: 4,
        totalCount: null,
        percent: null,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(publicAggregatedData, '2026-02-06', 'public-aggregated')).toEqual({
        level: 4,
        completedCount: 7,
        totalCount: null,
        percent: null,
        manualCompletion: false,
      });
    });

    it('handles manual-only completion days in public-aggregated mode as visibly active (level 1) with 0 completed tasks', () => {
      const manualOnlyCell = getHeatmapDayCellModel(
        publicAggregatedData,
        '2026-02-07',
        'public-aggregated'
      );

      expect(manualOnlyCell).toEqual({
        level: 1,
        completedCount: 0,
        totalCount: null,
        percent: null,
        manualCompletion: true,
      });
    });

    it('handles combined task + manual completion in public-aggregated mode accurately without inflating task counts', () => {
      expect(getHeatmapDayCellModel(publicAggregatedData, '2026-02-08', 'public-aggregated')).toEqual({
        level: 1,
        completedCount: 1,
        totalCount: null,
        percent: null,
        manualCompletion: true,
      });

      expect(getHeatmapDayCellModel(publicAggregatedData, '2026-02-09', 'public-aggregated')).toEqual({
        level: 2,
        completedCount: 2,
        totalCount: null,
        percent: null,
        manualCompletion: true,
      });

      expect(getHeatmapDayCellModel(publicAggregatedData, '2026-02-10', 'public-aggregated')).toEqual({
        level: 4,
        completedCount: 4,
        totalCount: null,
        percent: null,
        manualCompletion: true,
      });
    });

    it('handles empty years and unrecorded dates cleanly in both public-aggregated and personal modes', () => {
      const emptyYearData: AppData = {
        version: 2,
        days: {},
        recurringTasks: [],
        settings: { theme: 'dark', weekStartsOn: 1 },
      };

      expect(getHeatmapDayCellModel(emptyYearData, '2026-06-15', 'public-aggregated')).toEqual({
        level: 0,
        completedCount: 0,
        totalCount: null,
        percent: null,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(emptyYearData, '2026-06-15', 'personal')).toEqual({
        level: 0,
        completedCount: 0,
        totalCount: 0,
        percent: 0,
        manualCompletion: false,
      });
    });

    it('preserves unchanged personal heatmap behavior (percentage-based levels and manual-completion 100%)', () => {
      expect(getHeatmapDayCellModel(sampleData, '2026-01-05')).toEqual({
        level: 0,
        completedCount: 0,
        totalCount: 4,
        percent: 0,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(sampleData, '2026-01-06')).toEqual({
        level: 1,
        completedCount: 1,
        totalCount: 5,
        percent: 20,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(sampleData, '2026-01-07')).toEqual({
        level: 2,
        completedCount: 1,
        totalCount: 3,
        percent: 33,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(sampleData, '2026-01-08')).toEqual({
        level: 3,
        completedCount: 2,
        totalCount: 3,
        percent: 67,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(sampleData, '2026-01-09')).toEqual({
        level: 4,
        completedCount: 3,
        totalCount: 4,
        percent: 75,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(sampleData, '2026-01-10')).toEqual({
        level: 4,
        completedCount: 4,
        totalCount: 4,
        percent: 100,
        manualCompletion: false,
      });

      expect(getHeatmapDayCellModel(sampleData, '2026-01-11')).toEqual({
        level: 4,
        completedCount: 1,
        totalCount: 1,
        percent: 100,
        manualCompletion: true,
      });
    });

    it('renders ContributionGraph UI in public-aggregated mode with accurate level classes, manual-only active state, and tooltips free of N / N or %', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const html = renderToStaticMarkup(
          createElement(ContributionGraph, {
            year: 2026,
            data: publicAggregatedData,
            onDayClick: () => {},
            variant: 'public-aggregated',
          })
        );

        expect(errorSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();

        // Extract individual day cells by splitting on cell wrapper class
        const cellSegments = html.split('class="w-full aspect-square relative group/cell"').slice(1);
        expect(cellSegments.length).toBe(365);

        const findCellByDate = (dateStr: string) => {
          const [y, m, d] = dateStr.split('-').map(Number);
          const label = format(new Date(y, m - 1, d), 'EEEE, MMMM d, yyyy');
          const cell = cellSegments.find(seg => seg.includes(`>${label}<`));
          expect(cell, `Expected rendered cell for ${dateStr} (${label})`).toBeDefined();
          return cell!;
        };

        // 1. Verify level classes for 0, 1, 2, 3, 4, and 7 (4+) completions
        const cell0 = findCellByDate('2026-02-01');
        expect(cell0).toContain('bg-[#161616] border border-border/30');
        expect(cell0).toContain('>0 tasks completed<');

        const cell1 = findCellByDate('2026-02-02');
        expect(cell1).toContain('bg-accent/20 border border-accent/20');
        expect(cell1).toContain('>Tasks Completed<');
        expect(cell1).toContain('>1<');
        expect(cell1).not.toContain('Manual Completion');

        const cell2 = findCellByDate('2026-02-03');
        expect(cell2).toContain('bg-accent/40 border border-accent/40');
        expect(cell2).toContain('>Tasks Completed<');
        expect(cell2).toContain('>2<');

        const cell3 = findCellByDate('2026-02-04');
        expect(cell3).toContain('bg-accent/70 border border-accent/70');
        expect(cell3).toContain('>Tasks Completed<');
        expect(cell3).toContain('>3<');

        const cell4 = findCellByDate('2026-02-05');
        expect(cell4).toContain('bg-accent border border-accent ');
        expect(cell4).toContain('>Tasks Completed<');
        expect(cell4).toContain('>4<');

        const cell7 = findCellByDate('2026-02-06');
        expect(cell7).toContain('bg-accent border border-accent ');
        expect(cell7).toContain('>Tasks Completed<');
        expect(cell7).toContain('>7<');

        // 2. Verify manual-only day (2026-02-07) is visibly active (level 1) with 0 completed tasks
        const cellManualOnly = findCellByDate('2026-02-07');
        expect(cellManualOnly).toContain('bg-accent/20 border border-accent/20');
        expect(cellManualOnly).not.toContain('bg-[#161616]');
        expect(cellManualOnly).not.toContain('bg-accent border border-accent ');
        expect(cellManualOnly).toContain('>Tasks Completed<');
        expect(cellManualOnly).toContain('>0<');
        expect(cellManualOnly).toContain('>Manual Completion<');
        expect(cellManualOnly).toContain('>Recorded<');

        // 3. Verify combined task + manual completion days
        const cellCombined2 = findCellByDate('2026-02-09');
        expect(cellCombined2).toContain('bg-accent/40 border border-accent/40');
        expect(cellCombined2).toContain('>Tasks Completed<');
        expect(cellCombined2).toContain('>2<');
        expect(cellCombined2).toContain('>Manual Completion<');
        expect(cellCombined2).toContain('>Recorded<');

        // 4. Verify NO public tooltip ever displays N / N or a completion percentage
        for (const seg of cellSegments) {
          expect(seg).not.toContain('>Completion<');
          expect(seg).not.toMatch(/>\d+%</);
          expect(seg).not.toMatch(/>\d+\s*\/\s*\d+</);
        }
      } finally {
        errorSpy.mockRestore();
        warnSpy.mockRestore();
      }
    });

    it('renders ContributionGraph UI in personal mode (default) with completed / total counts and Completion percentage unchanged', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const html = renderToStaticMarkup(
          createElement(ContributionGraph, {
            year: 2026,
            data: sampleData,
            onDayClick: () => {},
          })
        );

        expect(errorSpy).not.toHaveBeenCalled();

        const cellSegments = html.split('class="w-full aspect-square relative group/cell"').slice(1);
        const findCellByDate = (dateStr: string) => {
          const [y, m, d] = dateStr.split('-').map(Number);
          const label = format(new Date(y, m - 1, d), 'EEEE, MMMM d, yyyy');
          return cellSegments.find(seg => seg.includes(`>${label}<`))!;
        };

        // 0/4 (0%) -> level 0
        const personal0 = findCellByDate('2026-01-05');
        expect(personal0).toContain('bg-[#161616] border border-border/30');
        expect(personal0).toContain('>0 / 4<');
        expect(personal0).toContain('>0%<');

        // 1/5 (20%) -> level 1
        const personal20 = findCellByDate('2026-01-06');
        expect(personal20).toContain('bg-accent/20 border border-accent/20');
        expect(personal20).toContain('>1 / 5<');
        expect(personal20).toContain('>20%<');

        // 1/3 (33%) -> level 2
        const personal33 = findCellByDate('2026-01-07');
        expect(personal33).toContain('bg-accent/40 border border-accent/40');
        expect(personal33).toContain('>1 / 3<');
        expect(personal33).toContain('>33%<');

        // 2/3 (67%) -> level 3
        const personal67 = findCellByDate('2026-01-08');
        expect(personal67).toContain('bg-accent/70 border border-accent/70');
        expect(personal67).toContain('>2 / 3<');
        expect(personal67).toContain('>67%<');

        // 3/4 (75%) -> level 4
        const personal75 = findCellByDate('2026-01-09');
        expect(personal75).toContain('bg-accent border border-accent ');
        expect(personal75).toContain('>3 / 4<');
        expect(personal75).toContain('>75%<');

        // Manual-only in personal mode -> level 4, 1 / 1, 100%
        const personalManual = findCellByDate('2026-01-11');
        expect(personalManual).toContain('bg-accent border border-accent ');
        expect(personalManual).toContain('>1 / 1<');
        expect(personalManual).toContain('>100%<');
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('renders empty years and year navigation (2025 vs leap-year 2024) accurately in ContributionGraph', () => {
      const emptyYearData: AppData = {
        version: 2,
        days: {},
        recurringTasks: [],
        settings: { theme: 'dark', weekStartsOn: 1 },
      };

      const html2025 = renderToStaticMarkup(
        createElement(ContributionGraph, {
          year: 2025,
          data: emptyYearData,
          onDayClick: () => {},
          variant: 'public-aggregated',
        })
      );
      const cells2025 = html2025.split('class="w-full aspect-square relative group/cell"').slice(1);
      expect(cells2025.length).toBe(365);
      expect(html2025).toContain('>2025 PROGRESS<');
      expect(html2025).toContain('>365 / 365 days<');
      expect(html2025).toContain('>(0 remaining)<');
      for (const seg of cells2025) {
        expect(seg).toContain('bg-[#161616] border border-border/30');
        expect(seg).toContain('>0 tasks completed<');
      }

      const html2024 = renderToStaticMarkup(
        createElement(ContributionGraph, {
          year: 2024,
          data: emptyYearData,
          onDayClick: () => {},
          variant: 'public-aggregated',
        })
      );
      const cells2024 = html2024.split('class="w-full aspect-square relative group/cell"').slice(1);
      expect(cells2024.length).toBe(366);
      expect(html2024).toContain('>2024 PROGRESS<');
      expect(html2024).toContain('>366 / 366 days<');
      expect(html2024).toContain('>(0 remaining)<');
    });
  });
});
