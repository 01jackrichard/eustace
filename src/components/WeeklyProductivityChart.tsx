import { useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import { format, subDays, startOfDay } from 'date-fns';
import type { AppData } from '../lib/dataManager';
import { getDayCompletionInfo } from '../lib/dataManager';
import { BarChart } from './charts/bar-chart';
import { Bar } from './charts/bar';
import { BarXAxis } from './charts/bar-x-axis';
import { Grid } from './charts/grid';
import { ChartTooltip } from './charts/tooltip/chart-tooltip';

export interface WeeklyChartDataPoint {
  name: string;
  date: Date;
  dateStr: string;
  percent: number;
  completed: number;
  total: number;
  isCurrentDay: boolean;
}

interface WeeklyProductivityChartProps {
  data: AppData | null;
  className?: string;
}

export function WeeklyProductivityChart({ data, className }: WeeklyProductivityChartProps) {
  const shouldReduceMotion = useReducedMotion();

  // Exactly seven consecutive calendar dates ending today in chronological order
  const daysData = useMemo<WeeklyChartDataPoint[]>(() => {
    if (!data) return [];

    const today = startOfDay(new Date());
    const result: WeeklyChartDataPoint[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const weekday = format(date, 'EEE');
      const info = getDayCompletionInfo(data, dateStr);
      const isCurrentDay = i === 0;

      result.push({
        name: weekday,
        date,
        dateStr,
        percent: info.percent,
        completed: info.completedCount,
        total: info.totalCount,
        isCurrentDay,
      });
    }

    return result;
  }, [data]);

  // Reveal signature only updates when the 7-day data or dates change
  const revealSignature = useMemo(() => {
    if (daysData.length === 0) return 'empty';
    return daysData.map(d => `${d.dateStr}:${d.completed}/${d.total}:${d.percent}`).join('|');
  }, [daysData]);

  if (!data || daysData.length === 0) {
    return (
      <div className="flex-1 w-full min-h-[130px] flex items-center justify-center">
        <BarChart
          aspectRatio="auto"
          className="w-full h-full min-h-[130px]"
          data={[]}
          status="loading"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-full min-h-[130px] flex flex-col justify-end relative">
      <BarChart
        aspectRatio="auto"
        barGap={0.32}
        className={className || "w-full flex-1 h-full min-h-[130px]"}
        data={daysData as unknown as Record<string, unknown>[]}
        enterTransition={
          shouldReduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 220, damping: 24 }
        }
        margin={{ top: 10, right: 10, bottom: 26, left: 10 }}
        revealSignature={revealSignature}
        xDataKey="name"
        yDomain={[0, 100]}
      >
        {/* Restrained baseline and subtle dashed guides */}
        <Grid
          highlightRowStroke="rgba(255, 255, 255, 0.12)"
          highlightRowStrokeWidth={1}
          highlightRowValues={[0]}
          horizontal
          rowTickValues={[0, 50, 100]}
          stroke="rgba(255, 255, 255, 0.05)"
          strokeDasharray="3,3"
          strokeWidth={0.8}
        />

        {/* 7 proportional vertical bars with subtle emerald emphasis for current day */}
        <Bar
          animate={!shouldReduceMotion}
          dataKey="percent"
          fadedOpacity={0.35}
          fill={(d) => (d.isCurrentDay ? '#22c55e' : 'rgba(34, 197, 94, 0.72)')}
          lineCap={6}
          minBarHeight={0}
          stroke="#22c55e"
        />

        {/* Chronological weekday labels with current-day highlight */}
        <BarXAxis maxLabels={7} showAllLabels tickerHalfWidth={24} />

        {/* Refined Eustace near-black tooltip */}
        <ChartTooltip
          indicatorColor="rgba(255, 255, 255, 0.15)"
          indicatorDasharray="2,2"
          panelStyle={{
            backgroundColor: '#121212',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            borderRadius: '12px',
            boxShadow: '0 12px 32px -4px rgba(0, 0, 0, 0.85)',
          }}
          showCrosshair
          showDatePill={false}
          showDots={false}
          content={({ point }) => {
            const item = point as unknown as WeeklyChartDataPoint;
            const fullDate = format(item.date, 'EEEE, MMM d');
            const hasTasks = item.total > 0;

            return (
              <div className="p-3 min-w-[160px] text-left select-none">
                <div className="flex items-center justify-between gap-3 mb-2 pb-1.5 border-b border-border/60">
                  <span className="text-[11px] font-semibold text-textMain tracking-tight">
                    {fullDate}
                  </span>
                  {item.isCurrentDay && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-accent bg-accent/15 px-1.5 py-0.5 rounded">
                      Today
                    </span>
                  )}
                </div>

                {hasTasks ? (
                  <div className="flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[11px] text-textMuted font-medium">Completion</span>
                      <span className="text-xs font-bold text-accent tabular-nums">
                        {item.percent}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[11px] text-textMuted font-medium">Tasks</span>
                      <span className="text-xs font-semibold text-textMain tabular-nums">
                        {item.completed} / {item.total}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[11px] text-textMuted font-medium">Tasks</span>
                      <span className="text-[11px] text-textMuted font-medium">0 scheduled</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[11px] text-textMuted font-medium">Rate</span>
                      <span className="text-[11px] text-textMuted font-medium">—</span>
                    </div>
                  </div>
                )}
              </div>
            );
          }}
        />
      </BarChart>
    </div>
  );
}
