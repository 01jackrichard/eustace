/* eslint-disable react/purity */
import { useMemo, useState } from 'react';
import { format, parseISO, getDay } from 'date-fns';
import { Clock, Flame, ChevronDown, ArrowRight } from 'lucide-react';
import { curveCatmullRom } from '@visx/curve';
import type { AppData } from '../lib/dataManager';
import { getDayCompletionInfo } from '../lib/dataManager';
import { cn } from '../lib/utils';
import { ComposedChart } from './charts/composed-chart';
import { SeriesBar } from './charts/series-bar';
import { Area } from './charts/area';
import { Line } from './charts/line';
import { Grid } from './charts/grid';
import { XAxis } from './charts/x-axis';
import { ChartTooltip } from './charts/tooltip/chart-tooltip';

export interface CompletionRecord {
  created_at: string;
  completed_date?: string;
}

export interface WhenYouWorkComposedChartProps {
  data: AppData | null;
  completions?: CompletionRecord[];
  hourlyData?: Record<number, number>;
  loading?: boolean;
  className?: string;
  onAddTask?: () => void;
}

export interface WeekdayOption {
  index: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  key: string;
  name: string;
  short: string;
}

export const WEEKDAYS: WeekdayOption[] = [
  { index: 1, key: 'Mon', name: 'Monday', short: 'Mon' },
  { index: 2, key: 'Tue', name: 'Tuesday', short: 'Tue' },
  { index: 3, key: 'Wed', name: 'Wednesday', short: 'Wed' },
  { index: 4, key: 'Thu', name: 'Thursday', short: 'Thu' },
  { index: 5, key: 'Fri', name: 'Friday', short: 'Fri' },
  { index: 6, key: 'Sat', name: 'Saturday', short: 'Sat' },
  { index: 0, key: 'Sun', name: 'Sunday', short: 'Sun' },
];

export interface HourlyWorkPoint {
  date: Date;
  hour: number;
  timeLabel: string;
  tasks: number;
  flow: number;
  pace: number;
  focusPercent: number;
  [key: string]: unknown;
}

export interface PeakDayStats {
  peakWeekday: WeekdayOption;
  weekdayCounts: Record<number, number>;
  totalWeekdayTasks: number;
  peakHour: number | null;
  peakHourLabel: string;
  peakWindowLabel: string;
  hasActivity: boolean;
}

const smooth = curveCatmullRom.alpha(0.42);

/**
 * Calculates the day of the week when the user works most,
 * along with hourly breakdown metrics.
 */
export function calculatePeakDayStats(
  data: AppData | null,
  completions: CompletionRecord[] = [],
  hourlyData: Record<number, number> = {}
): PeakDayStats {
  const weekdayCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  // 1. Count from Supabase timestamped completions
  completions.forEach((c) => {
    try {
      const d = new Date(c.created_at);
      const day = d.getDay();
      weekdayCounts[day] = (weekdayCounts[day] || 0) + 1;
    } catch {
      // ignore date parse error
    }
  });

  // 2. Count from AppData days if completions are empty
  if (completions.length === 0 && data?.days) {
    Object.keys(data.days).forEach((dateStr) => {
      try {
        const d = parseISO(dateStr);
        const day = getDay(d);
        const info = getDayCompletionInfo(data, dateStr);
        weekdayCounts[day] = (weekdayCounts[day] || 0) + info.completedCount;
      } catch {
        // ignore date parse error
      }
    });
  }

  // Find the weekday with maximum task completions
  let bestDayIdx = 1; // default Monday
  let maxCount = -1;
  let totalTasks = 0;

  for (const w of WEEKDAYS) {
    const c = weekdayCounts[w.index] || 0;
    totalTasks += c;
    if (c > maxCount) {
      maxCount = c;
      bestDayIdx = w.index;
    }
  }

  // If tied or all 0, default to Tuesday (or Monday)
  if (maxCount <= 0) {
    bestDayIdx = 2; // Tuesday
  }

  const peakWeekday = WEEKDAYS.find((w) => w.index === bestDayIdx) || WEEKDAYS[0];

  // Find peak hour for peak day
  const peakDayHourlyCounts: Record<number, number> = {};
  for (let i = 0; i < 24; i++) peakDayHourlyCounts[i] = 0;

  completions.forEach((c) => {
    try {
      const d = new Date(c.created_at);
      if (d.getDay() === bestDayIdx) {
        const h = d.getHours();
        peakDayHourlyCounts[h] = (peakDayHourlyCounts[h] || 0) + 1;
      }
    } catch {
      // ignore
    }
  });

  let peakHour: number | null = null;
  let maxHourCount = 0;

  for (let h = 0; h < 24; h++) {
    const count = peakDayHourlyCounts[h];
    if (count > maxHourCount) {
      maxHourCount = count;
      peakHour = h;
    }
  }

  // Fallback to hourlyData if no completions on peak day
  if (peakHour === null && Object.values(hourlyData).some((v) => v > 0)) {
    let bestH = 14;
    let bestHCount = 0;
    Object.entries(hourlyData).forEach(([hStr, count]) => {
      const h = Number(hStr);
      if (count > bestHCount) {
        bestHCount = count;
        bestH = h;
      }
    });
    peakHour = bestH;
    maxHourCount = bestHCount;
  }

  const peakHourVal = peakHour ?? 14;
  const peakHourDate = new Date(2026, 0, 1, peakHourVal, 0);
  const peakHourEnd = new Date(2026, 0, 1, (peakHourVal + 2) % 24, 0);

  const peakHourLabel = format(peakHourDate, 'h a');
  const peakWindowLabel = `${format(peakHourDate, 'h a')} – ${format(peakHourEnd, 'h a')}`;

  return {
    peakWeekday,
    weekdayCounts,
    totalWeekdayTasks: totalTasks,
    peakHour: maxHourCount > 0 ? peakHourVal : null,
    peakHourLabel,
    peakWindowLabel,
    hasActivity: totalTasks > 0 || Object.values(hourlyData).some((v) => v > 0),
  };
}

export function WhenYouWorkComposedChart({
  data,
  completions = [],
  hourlyData = {},
  loading = false,
  className = '',
  onAddTask,
}: WhenYouWorkComposedChartProps) {
  const stats = useMemo(
    () => calculatePeakDayStats(data, completions, hourlyData),
    [data, completions, hourlyData]
  );

  // Selected weekday to inspect (defaults to the day when the user works most)
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(stats.peakWeekday.index);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  const activeWeekday = useMemo(
    () => WEEKDAYS.find((w) => w.index === selectedDayIdx) || stats.peakWeekday,
    [selectedDayIdx, stats.peakWeekday]
  );

  const activeWeekdayTasks = stats.weekdayCounts[activeWeekday.index] || 0;

  // Build hourly dataset for the selected weekday
  const chartData = useMemo<HourlyWorkPoint[]>(() => {
    const hourlyCounts: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourlyCounts[h] = 0;

    // Filter completions for the selected weekday
    let matchingCompletionsCount = 0;
    completions.forEach((c) => {
      try {
        const d = new Date(c.created_at);
        if (d.getDay() === activeWeekday.index) {
          const h = d.getHours();
          hourlyCounts[h] = (hourlyCounts[h] || 0) + 1;
          matchingCompletionsCount++;
        }
      } catch {
        // ignore
      }
    });

    // If no specific completion records for this weekday but hourlyData exists
    // and this is the peak weekday, apportion hourlyData
    if (
      matchingCompletionsCount === 0 &&
      activeWeekday.index === stats.peakWeekday.index &&
      Object.values(hourlyData).some((v) => v > 0)
    ) {
      Object.entries(hourlyData).forEach(([hStr, count]) => {
        const h = Number(hStr);
        if (h >= 0 && h < 24) {
          hourlyCounts[h] = count;
          matchingCompletionsCount += count;
        }
      });
    }

    // Determine active window: 6 AM to 10 PM (hours 6..22), expanded if tasks fall outside
    let startHour = 6;
    let endHour = 22;

    for (let h = 0; h < 24; h++) {
      if ((hourlyCounts[h] || 0) > 0) {
        if (h < startHour) startHour = Math.max(0, h - 1);
        if (h > endHour) endHour = Math.min(23, h + 1);
      }
    }

    const maxCount = Math.max(...Object.values(hourlyCounts), 0);
    if (maxCount === 0) {
      return [];
    }

    const points: HourlyWorkPoint[] = [];

    for (let h = startHour; h <= endHour; h++) {
      const taskVal = hourlyCounts[h] || 0;
      const prev1 = hourlyCounts[h - 1] || 0;
      const next1 = hourlyCounts[h + 1] || 0;
      const prev2 = hourlyCounts[h - 2] || 0;
      const next2 = hourlyCounts[h + 2] || 0;

      // Organic energy envelope that peaks around task concentrations
      const rawFlow = taskVal + 0.42 * (prev1 + next1) + 0.14 * (prev2 + next2);
      // Bound flow to be proportional with maxCount so the scale stays unified
      const flow = Math.round(Math.min(rawFlow, maxCount * 1.05) * 100) / 100;
      // Momentum flow line: smooth guidance curve
      const pace = Math.round((flow * 0.92 + taskVal * 0.08) * 100) / 100;

      const date = new Date(2026, 0, 1, h, 0, 0);

      points.push({
        date,
        hour: h,
        timeLabel: format(date, 'h a'),
        tasks: taskVal,
        flow,
        pace,
        focusPercent: maxCount > 0 ? Math.round((flow / maxCount) * 100) : 0,
      });
    }

    return points;
  }, [completions, hourlyData, activeWeekday.index, stats.peakWeekday.index]);

  const hasActivity = chartData.length > 0 && chartData.some((p) => p.tasks > 0);

  if (loading) {
    return (
      <div className={cn('w-full h-full min-h-[220px] flex items-center justify-center', className)}>
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-medium text-textMuted">Loading work pattern...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full h-full flex flex-col justify-between relative', className)}>
      {/* 1. HEADER & PEAK DAY SELECTOR */}
      <div className="flex items-start justify-between gap-3 relative z-20 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase">
              WHEN YOU WORK MOST
            </h2>
            {stats.hasActivity && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1 shadow-sm">
                <Flame className="w-2.5 h-2.5 text-emerald-400" />
                {stats.peakWeekday.short} Peak
              </span>
            )}
          </div>
          <p className="text-[11px] text-textMuted tracking-tight">
            Hourly rhythm on <span className="font-semibold text-textMain">{activeWeekday.name}s</span>
            {activeWeekdayTasks > 0 && (
              <span className="text-textMuted/70"> · {activeWeekdayTasks} {activeWeekdayTasks === 1 ? 'task' : 'tasks'}</span>
            )}
          </p>
        </div>

        {/* Day Selector Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsSelectorOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141414] border border-border/70 hover:border-textMuted/60 text-textMain text-[10px] font-semibold transition-colors"
          >
            <span>{activeWeekday.short}</span>
            <ChevronDown className="w-3 h-3 text-textMuted" />
          </button>

          {isSelectorOpen && (
            <div className="absolute right-0 top-full mt-1.5 bg-[#141414] border border-border/80 rounded-xl p-1 shadow-2xl z-50 flex flex-col min-w-[130px] backdrop-blur-md">
              {WEEKDAYS.map((w) => {
                const isPeak = w.index === stats.peakWeekday.index;
                const isSelected = w.index === activeWeekday.index;
                const count = stats.weekdayCounts[w.index] || 0;
                return (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => {
                      setSelectedDayIdx(w.index);
                      setIsSelectorOpen(false);
                    }}
                    className={cn(
                      'px-2.5 py-1.5 text-left rounded-lg text-[10px] flex items-center justify-between transition-colors',
                      isSelected
                        ? 'bg-accent/20 text-accent font-bold'
                        : 'text-textMuted hover:text-textMain hover:bg-white/[0.04]'
                    )}
                  >
                    <span>{w.name}</span>
                    <div className="flex items-center gap-1.5">
                      {count > 0 && (
                        <span className="text-[9px] text-textMuted/60 tabular-nums">({count})</span>
                      )}
                      {isPeak && <span className="text-[8px] text-emerald-400 uppercase font-bold">Peak</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. COMPOSED CHART BODY */}
      <div className="flex-1 w-full relative flex items-center justify-center min-h-[155px] my-1">
        {hasActivity ? (
          <div className="w-full h-full relative">
            <ComposedChart
              aspectRatio="auto"
              barSize={14}
              maxBarSize={20}
              className="w-full h-full min-h-[155px]"
              data={chartData as unknown as Record<string, unknown>[]}
              margin={{ top: 14, right: 14, bottom: 38, left: 14 }}
              xDataKey="date"
            >
              {/* Restrained subtle dashed guides, baseline omitted so ticks never intersect */}
              <Grid
                horizontal
                hideHorizontalEdgeLines
                stroke="rgba(255, 255, 255, 0.05)"
                strokeDasharray="3,3"
                strokeWidth={0.8}
                numTicksRows={4}
              />

              {/* Shaded Area: Smooth emerald focus volume envelope */}
              <Area
                curve={smooth}
                dataKey="flow"
                fill="rgba(34, 197, 94, 0.14)"
                fillOpacity={0.25}
                stroke="rgba(34, 197, 94, 0.45)"
                strokeWidth={1.4}
                fadeEdges
              />

              {/* SeriesBar: Completed Tasks at each hour */}
              <SeriesBar
                dataKey="tasks"
                fill="#22c55e"
                radius={4}
              />

              {/* Line: Fluid productivity momentum curve */}
              <Line
                curve={smooth}
                dataKey="pace"
                stroke="#94a3b8"
                strokeWidth={1.8}
                fadeEdges
              />

              {/* X-Axis: Hourly timestamps cleanly positioned with ample breathing space */}
              <XAxis
                formatTick={(d) => format(d, 'ha')}
                numTicks={5}
              />

              {/* Refined luxury Eustace tooltip */}
              <ChartTooltip
                indicatorColor="rgba(255, 255, 255, 0.18)"
                indicatorDasharray="2,2"
                panelStyle={{
                  backgroundColor: '#121212',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.85)',
                }}
                showCrosshair
                showDatePill={false}
                showDots={false}
                content={({ point }) => {
                  const p = point as unknown as HourlyWorkPoint;
                  return (
                    <div className="p-3 min-w-[155px] text-left select-none">
                      <div className="flex items-center justify-between gap-3 mb-2 pb-1.5 border-b border-border/60">
                        <span className="text-[11px] font-semibold text-textMain tracking-tight">
                          {p.timeLabel}
                        </span>
                        {p.tasks > 0 && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 text-xs">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[11px] text-textMuted flex items-center gap-1.5 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                            Completed
                          </span>
                          <span className="text-xs font-bold text-textMain tabular-nums">
                            {p.tasks} {p.tasks === 1 ? 'task' : 'tasks'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[11px] text-textMuted flex items-center gap-1.5 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#94a3b8]" />
                            Momentum
                          </span>
                          <span className="text-xs font-bold text-slate-300 tabular-nums">
                            {p.focusPercent}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
            </ComposedChart>
          </div>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-3 z-10 my-auto">
            <div className="w-9 h-9 rounded-full border border-border/70 bg-[#141414] flex items-center justify-center mb-2.5 shadow-md">
              <Clock className="w-4 h-4 text-textMuted/50" />
            </div>
            <p className="text-xs font-bold text-textMain tracking-tight">
              No completed tasks on {activeWeekday.name}s
            </p>
            <p className="text-[10px] text-textMuted/70 mt-1 max-w-[220px] leading-relaxed mb-3">
              {stats.hasActivity ? (
                <>Your peak activity is on <strong className="text-textMain">{stats.peakWeekday.name}s</strong> ({stats.weekdayCounts[stats.peakWeekday.index]} tasks).</>
              ) : (
                <>Complete tasks throughout the day to map your peak hourly rhythm.</>
              )}
            </p>
            <div className="flex items-center gap-2">
              {stats.hasActivity && activeWeekday.index !== stats.peakWeekday.index && (
                <button
                  type="button"
                  onClick={() => setSelectedDayIdx(stats.peakWeekday.index)}
                  className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                >
                  <span>View {stats.peakWeekday.short} Peak</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
              {onAddTask && (
                <button
                  type="button"
                  onClick={onAddTask}
                  className="text-[10px] font-semibold bg-[#161616] border border-border/70 hover:border-textMuted/60 px-2.5 py-1 rounded-lg text-textMain hover:bg-white/[0.04] transition-colors"
                >
                  Add Task
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. FOOTER LEGEND & PEAK WINDOW SUMMARY */}
      <div className="pt-2.5 border-t border-border/40 flex items-center justify-between text-[10px] relative z-10 mt-1">
        {/* Legend pills */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-textMuted">
            <span className="w-2 h-2 rounded-[2px] bg-[#22c55e]" />
            <span className="text-[9px] font-medium text-textMuted">Tasks</span>
          </div>
          <div className="flex items-center gap-1.5 text-textMuted">
            <span className="w-2.5 h-1.5 rounded-sm bg-emerald-500/30 border border-emerald-500/40" />
            <span className="text-[9px] font-medium text-textMuted">Focus Area</span>
          </div>
          <div className="flex items-center gap-1.5 text-textMuted">
            <span className="w-2.5 h-0.5 bg-[#94a3b8]" />
            <span className="text-[9px] font-medium text-textMuted">Momentum</span>
          </div>
        </div>

        {/* Peak focus indicator */}
        <div className="text-[9px] text-textMuted flex items-center gap-1 font-medium">
          {stats.peakHour !== null ? (
            <>
              <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>Peak: <strong className="text-textMain font-semibold">{stats.peakWindowLabel}</strong></span>
            </>
          ) : (
            <span>Peak window pending data</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default WhenYouWorkComposedChart;
