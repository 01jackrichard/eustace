/* eslint-disable react/purity */
import { useMemo, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { format, subDays, startOfDay, getDay } from 'date-fns';
import { Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { AppData } from '../lib/dataManager';
import { getDayCompletionInfo } from '../lib/dataManager';
import { cn } from '../lib/utils';
import { RadarChart } from './charts/radar-chart';
import { RadarGrid } from './charts/radar-grid';
import { RadarAxis } from './charts/radar-axis';
import { RadarLabels } from './charts/radar-labels';
import { RadarArea } from './charts/radar-area';
import type { RadarData, RadarMetric } from './charts/radar-context';

export interface WeekdayMetricDef extends RadarMetric {
  dayIndex: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
}

export const RADAR_WEEKDAYS: WeekdayMetricDef[] = [
  { key: 'Mon', label: 'MON', dayIndex: 1 },
  { key: 'Tue', label: 'TUE', dayIndex: 2 },
  { key: 'Wed', label: 'WED', dayIndex: 3 },
  { key: 'Thu', label: 'THU', dayIndex: 4 },
  { key: 'Fri', label: 'FRI', dayIndex: 5 },
  { key: 'Sat', label: 'SAT', dayIndex: 6 },
  { key: 'Sun', label: 'SUN', dayIndex: 0 },
];

export interface DayActivityInfo {
  date: Date;
  dateStr: string;
  completed: number;
  total: number;
  percent: number;
  normalized: number; // 0 - 100 relative to shared reference max
}

export interface WeekdayComparison {
  key: string;
  label: string;
  latest: DayActivityInfo;
  previous: DayActivityInfo;
  delta: number;
}

export interface ProductivityTrendRadarStats {
  metrics: WeekdayMetricDef[];
  comparisons: Record<string, WeekdayComparison>;
  radarSeries: RadarData[];
  maxCount: number;
  totalLatest: number;
  totalPrevious: number;
  deltaTasks: number;
  deltaPercentage: number | null;
  busiestWeekday: WeekdayComparison | null;
  dateRangeLatest: string;
  dateRangePrevious: string;
  hasActivity: boolean;
}

/**
 * Computes authoritative radar trend statistics comparing:
 * - Latest 7 days: today and the 6 preceding local calendar dates.
 * - Previous 7 days: the 7 local calendar dates immediately preceding the latest period.
 * 
 * Scaled against a single shared reference maximum across both periods.
 */
export function calculateRadarStats(data: AppData | null, referenceDate = new Date()): ProductivityTrendRadarStats {
  const today = startOfDay(referenceDate);

  // Latest 7 consecutive days: today - 6 to today
  const latestDays: { date: Date; dateStr: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = subDays(today, i);
    latestDays.push({ date: d, dateStr: format(d, 'yyyy-MM-dd') });
  }

  // Previous 7 consecutive days: today - 13 to today - 7
  const previousDays: { date: Date; dateStr: string }[] = [];
  for (let i = 13; i >= 7; i--) {
    const d = subDays(today, i);
    previousDays.push({ date: d, dateStr: format(d, 'yyyy-MM-dd') });
  }

  const rawComparisons: Record<string, { latest: DayActivityInfo; previous: DayActivityInfo }> = {};
  const allCompletedCounts: number[] = [];
  let totalLatest = 0;
  let totalPrevious = 0;

  for (const metric of RADAR_WEEKDAYS) {
    const latestItem = latestDays.find((d) => getDay(d.date) === metric.dayIndex) ?? latestDays[0];
    const prevItem = previousDays.find((d) => getDay(d.date) === metric.dayIndex) ?? previousDays[0];

    const latestInfo = data ? getDayCompletionInfo(data, latestItem.dateStr) : { completedCount: 0, totalCount: 0, percent: 0 };
    const prevInfo = data ? getDayCompletionInfo(data, prevItem.dateStr) : { completedCount: 0, totalCount: 0, percent: 0 };

    allCompletedCounts.push(latestInfo.completedCount, prevInfo.completedCount);
    totalLatest += latestInfo.completedCount;
    totalPrevious += prevInfo.completedCount;

    rawComparisons[metric.key] = {
      latest: {
        date: latestItem.date,
        dateStr: latestItem.dateStr,
        completed: latestInfo.completedCount,
        total: latestInfo.totalCount,
        percent: latestInfo.percent,
        normalized: 0,
      },
      previous: {
        date: prevItem.date,
        dateStr: prevItem.dateStr,
        completed: prevInfo.completedCount,
        total: prevInfo.totalCount,
        percent: prevInfo.percent,
        normalized: 0,
      },
    };
  }

  const maxCount = Math.max(...allCompletedCounts, 0);
  const comparisons: Record<string, WeekdayComparison> = {};
  let busiestWeekday: WeekdayComparison | null = null;
  let highestDayCount = -1;

  for (const metric of RADAR_WEEKDAYS) {
    const raw = rawComparisons[metric.key];
    const latestNorm = maxCount > 0 ? Math.round((raw.latest.completed / maxCount) * 100) : 0;
    const prevNorm = maxCount > 0 ? Math.round((raw.previous.completed / maxCount) * 100) : 0;

    const comp: WeekdayComparison = {
      key: metric.key,
      label: metric.label,
      latest: {
        ...raw.latest,
        normalized: latestNorm,
      },
      previous: {
        ...raw.previous,
        normalized: prevNorm,
      },
      delta: raw.latest.completed - raw.previous.completed,
    };

    comparisons[metric.key] = comp;

    const dayMax = Math.max(comp.latest.completed, comp.previous.completed);
    if (dayMax > highestDayCount && dayMax > 0) {
      highestDayCount = dayMax;
      busiestWeekday = comp;
    }
  }

  const hasActivity = maxCount > 0;

  // Series 0: Previous 7 days (#94a3b8)
  // Series 1: Latest 7 days (#22c55e)
  const radarSeries: RadarData[] = [
    {
      label: 'Previous 7 days',
      color: '#94a3b8',
      values: Object.fromEntries(
        RADAR_WEEKDAYS.map((m) => [m.key, comparisons[m.key].previous.normalized])
      ),
    },
    {
      label: 'Latest 7 days',
      color: '#22c55e',
      values: Object.fromEntries(
        RADAR_WEEKDAYS.map((m) => [m.key, comparisons[m.key].latest.normalized])
      ),
    },
  ];

  const deltaTasks = totalLatest - totalPrevious;
  const deltaPercentage = totalPrevious > 0 ? Math.round(((totalLatest - totalPrevious) / totalPrevious) * 100) : null;

  const dateRangeLatest = `${format(latestDays[0].date, 'MMM d')} – ${format(latestDays[6].date, 'MMM d')}`;
  const dateRangePrevious = `${format(previousDays[0].date, 'MMM d')} – ${format(previousDays[6].date, 'MMM d')}`;

  return {
    metrics: RADAR_WEEKDAYS,
    comparisons,
    radarSeries,
    maxCount,
    totalLatest,
    totalPrevious,
    deltaTasks,
    deltaPercentage,
    busiestWeekday,
    dateRangeLatest,
    dateRangePrevious,
    hasActivity,
  };
}

export interface ProductivityTrendRadarChartProps {
  data: AppData | null;
  loading?: boolean;
  className?: string;
  onAddTask?: () => void;
}

export function ProductivityTrendRadarChart({
  data,
  loading = false,
  className = '',
  onAddTask,
}: ProductivityTrendRadarChartProps) {
  const shouldReduceMotion = useReducedMotion();
  const [hoveredSeriesIndex, setHoveredSeriesIndex] = useState<number | null>(null);
  const [activeMetricKey, setActiveMetricKey] = useState<string | null>(null);

  const stats = useMemo(() => calculateRadarStats(data), [data]);

  const activeComparison = useMemo(() => {
    if (!activeMetricKey) return null;
    return stats.comparisons[activeMetricKey] || null;
  }, [activeMetricKey, stats.comparisons]);

  if (loading) {
    return (
      <div className={cn('w-full h-full min-h-[340px] flex items-center justify-center', className)}>
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-[11px] font-medium text-textMuted">Loading productivity trend...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full h-full flex flex-col justify-between relative', className)}>
      {/* 1. HEADER & INTERACTIVE COMPARISON CHIPS */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase">
              PRODUCTIVITY TREND
            </h2>
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.04] text-textMuted border border-white/[0.08]">
              Week-Over-Week
            </span>
          </div>
          <p className="text-xs text-textMuted/80 tracking-tight">
            Daily activity relative to busiest day across both periods.
          </p>
        </div>

        {/* SUMMARY / LEGEND CHIPS */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Latest 7 days chip */}
          <button
            type="button"
            onClick={() => setHoveredSeriesIndex((prev) => (prev === 1 ? null : 1))}
            onMouseEnter={() => setHoveredSeriesIndex(1)}
            onMouseLeave={() => setHoveredSeriesIndex(null)}
            className={cn(
              'px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-2 text-left',
              hoveredSeriesIndex === 1
                ? 'bg-[#22c55e]/10 border-[#22c55e]/50 text-white shadow-lg shadow-emerald-950/20'
                : 'bg-[#141414] border-border/60 hover:border-border text-textMuted hover:text-textMain'
            )}
            title={`Latest 7 days: ${stats.dateRangeLatest}`}
          >
            <span className="w-2 h-2 rounded-full bg-[#22c55e] shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] font-bold uppercase tracking-wider text-textMuted">
                Latest 7D
              </span>
              <span className="text-[11px] font-bold text-textMain">
                {stats.totalLatest} <span className="text-[9px] font-medium text-textMuted">tasks</span>
              </span>
            </div>
          </button>

          {/* Previous 7 days chip */}
          <button
            type="button"
            onClick={() => setHoveredSeriesIndex((prev) => (prev === 0 ? null : 0))}
            onMouseEnter={() => setHoveredSeriesIndex(0)}
            onMouseLeave={() => setHoveredSeriesIndex(null)}
            className={cn(
              'px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-2 text-left',
              hoveredSeriesIndex === 0
                ? 'bg-slate-400/10 border-slate-400/50 text-white shadow-lg'
                : 'bg-[#141414] border-border/60 hover:border-border text-textMuted hover:text-textMain'
            )}
            title={`Previous 7 days: ${stats.dateRangePrevious}`}
          >
            <span className="w-2 h-2 rounded-full bg-[#94a3b8] shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] font-bold uppercase tracking-wider text-textMuted">
                Prev 7D
              </span>
              <span className="text-[11px] font-bold text-textMain">
                {stats.totalPrevious} <span className="text-[9px] font-medium text-textMuted">tasks</span>
              </span>
            </div>
          </button>

          {/* Delta pill */}
          {stats.hasActivity && (
            <div
              className={cn(
                'px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 text-[11px] font-bold',
                stats.deltaTasks > 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : stats.deltaTasks < 0
                  ? 'bg-slate-500/10 border-slate-500/30 text-slate-300'
                  : 'bg-white/[0.03] border-border/50 text-textMuted'
              )}
            >
              {stats.deltaTasks > 0 ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : stats.deltaTasks < 0 ? (
                <TrendingDown className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )}
              <span>
                {stats.deltaTasks > 0 ? `+${stats.deltaTasks}` : stats.deltaTasks}{' '}
                {stats.deltaPercentage !== null && (
                  <span className="text-[9px] font-medium opacity-80">
                    ({stats.deltaPercentage > 0 ? `+${stats.deltaPercentage}%` : `${stats.deltaPercentage}%`})
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. RADAR CHART BODY */}
      <div className="flex-1 w-full relative flex items-center justify-center my-2 min-h-[260px]">
        {/* Radar Chart Component */}
        <div className={cn('w-full h-full relative', !stats.hasActivity && 'opacity-25 pointer-events-none')}>
          <RadarChart
            animate={!shouldReduceMotion}
            data={stats.radarSeries}
            hoveredIndex={hoveredSeriesIndex}
            levels={4}
            margin={40}
            metrics={RADAR_WEEKDAYS}
            onHoverChange={setHoveredSeriesIndex}
            className="w-full h-full min-h-[260px]"
          >
            <RadarGrid
              showLabels={stats.hasActivity}
              stroke="rgba(255, 255, 255, 0.12)"
              strokeOpacity={0.35}
            />
            <RadarAxis
              stroke="rgba(255, 255, 255, 0.12)"
              strokeOpacity={0.35}
            />
            <RadarLabels
              activeMetricKey={activeMetricKey}
              fontSize={10}
              interactive
              offset={18}
              onHoverMetric={setActiveMetricKey}
              onMetricClick={(key) =>
                setActiveMetricKey((prev) => (prev === key ? null : key))
              }
            />
            <RadarArea
              activeMetricKey={activeMetricKey}
              color="#94a3b8"
              index={0}
              onPointHover={(key) => setActiveMetricKey(key)}
              showGlow={false}
              showPoints
              showStroke
            />
            <RadarArea
              activeMetricKey={activeMetricKey}
              color="#22c55e"
              index={1}
              onPointHover={(key) => setActiveMetricKey(key)}
              showGlow
              showPoints
              showStroke
            />
          </RadarChart>
        </div>

        {/* Empty State Overlay */}
        {!stats.hasActivity && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-20 pointer-events-auto">
            <div className="w-9 h-9 rounded-full border border-border/80 bg-background/90 flex items-center justify-center mb-2.5 shadow-xl backdrop-blur-md">
              <Zap className="w-4 h-4 text-textMuted/70" />
            </div>
            <p className="text-xs font-bold text-textMain tracking-tight">No activity recorded yet</p>
            <p className="text-[11px] text-textMuted/70 mt-1 max-w-xs leading-relaxed mb-3">
              Complete tasks across the week to build and compare your week-over-week productivity radar.
            </p>
            {onAddTask && (
              <button
                type="button"
                onClick={onAddTask}
                className="text-[10px] font-bold uppercase tracking-wider bg-background border border-border/80 hover:border-textMuted px-3.5 py-1.5 rounded-lg text-textMain hover:bg-white/[0.04] transition-all shadow-md"
              >
                Add Task
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3. INTERACTIVE FOOTER / DAY INSPECTION BAR */}
      <div className="pt-2 border-t border-border/40 relative z-10">
        {activeComparison ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#141414]/90 border border-border/50 rounded-xl px-3.5 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-wider text-textMain uppercase">
                {activeComparison.label}DAY
              </span>
              <span className="text-[9px] text-textMuted">
                ({format(activeComparison.latest.date, 'MMM d')} vs {format(activeComparison.previous.date, 'MMM d')})
              </span>
            </div>

            <div className="flex items-center gap-4 text-[11px]">
              {/* Latest Value */}
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                <span className="text-textMuted text-[10px]">Latest:</span>
                <span className="font-bold text-textMain">
                  {activeComparison.latest.completed} tasks
                </span>
                <span className="text-[9px] text-textMuted">
                  ({activeComparison.latest.normalized}%)
                </span>
              </div>

              {/* Previous Value */}
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#94a3b8]" />
                <span className="text-textMuted text-[10px]">Previous:</span>
                <span className="font-bold text-slate-300">
                  {activeComparison.previous.completed} tasks
                </span>
                <span className="text-[9px] text-textMuted">
                  ({activeComparison.previous.normalized}%)
                </span>
              </div>

              {/* Day Delta */}
              <div className="text-[10px] font-bold">
                {activeComparison.delta > 0 ? (
                  <span className="text-emerald-400">+{activeComparison.delta}</span>
                ) : activeComparison.delta < 0 ? (
                  <span className="text-slate-400">{activeComparison.delta}</span>
                ) : (
                  <span className="text-textMuted">Equal</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[10px] text-textMuted/70 px-1 py-1">
            <div className="flex items-center gap-2">
              {stats.busiestWeekday ? (
                <>
                  <span className="font-medium text-textMuted">Busiest day:</span>
                  <span className="font-bold text-textMain">
                    {stats.busiestWeekday.label}DAY ({Math.max(stats.busiestWeekday.latest.completed, stats.busiestWeekday.previous.completed)} tasks)
                  </span>
                </>
              ) : (
                <span>Hover any weekday or vertex to inspect daily activity</span>
              )}
            </div>
            <div className="hidden sm:block text-[9px] text-textMuted/50 tracking-wider">
              {stats.dateRangePrevious} vs {stats.dateRangeLatest}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
