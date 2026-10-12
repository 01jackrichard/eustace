/* eslint-disable react/purity */
import { useMemo } from 'react';
import type { AppData } from '../lib/dataManager';
import {
  format,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isAfter,
  startOfDay,
  getDayOfYear,
  getDaysInYear,
} from 'date-fns';
import { getDayCompletionInfo } from '../lib/dataManager';
import { cn } from '../lib/utils';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  HeatmapLegend,
  HeatmapInteractionProvider,
  type HeatmapColumn,
  type HeatmapLevelColors,
} from './charts/heatmap';

export interface ProductivityHeatmapProps {
  year: number;
  data: AppData | null;
  loading?: boolean;
  onDayClick?: (date: Date) => void;
}

const EUSTACE_HEATMAP_COLORS: HeatmapLevelColors = [
  '#161616', // Level 0: Inactive / no tasks
  'rgba(34, 197, 94, 0.22)', // Level 1: > 0% to < 25%
  'rgba(34, 197, 94, 0.45)', // Level 2: 25% to < 50%
  'rgba(34, 197, 94, 0.70)', // Level 3: 50% to < 75%
  '#22c55e', // Level 4: >= 75% or 100% completed
];

export function ProductivityHeatmap({
  year,
  data,
  loading = false,
  onDayClick,
}: ProductivityHeatmapProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const dayOfYear = useMemo(() => getDayOfYear(today), [today]);
  const daysInYear = useMemo(() => getDaysInYear(new Date(year, 0, 1)), [year]);
  const isCurrentYear = today.getFullYear() === year;

  const displayRange = useMemo(
    () => ({
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
    }),
    [year]
  );

  const { columns, dayInfoMap } = useMemo(() => {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    // GitHub/Eustace week starts on Monday
    const calendarStart = startOfWeek(startDate, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(endDate, { weekStartsOn: 1 });

    const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    // Group into Monday-through-Sunday chunks of 7 days
    const weekChunks: Date[][] = [];
    let currentWeek: Date[] = [];
    for (const d of allDays) {
      currentWeek.push(d);
      if (currentWeek.length === 7) {
        weekChunks.push(currentWeek);
        currentWeek = [];
      }
    }

    const infoMap = new Map<
      string,
      {
        info: ReturnType<typeof getDayCompletionInfo>;
        isFuture: boolean;
        level: number;
        date: Date;
      }
    >();

    const cols: HeatmapColumn[] = weekChunks.map((chunk, colIdx) => {
      // chunk is [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
      // Bklit's HeatmapChart with weekStartDay={1} rotates bins by 1:
      // [...bins.slice(1), ...bins.slice(0, 1)]
      // To ensure that after rotation row 0 is Mon, row 1 is Tue, ..., row 6 is Sun,
      // the input bins must be Sun-first: [Sun, Mon, Tue, Wed, Thu, Fri, Sat].
      const sun = chunk[6];
      const mon = chunk[0];
      const tue = chunk[1];
      const wed = chunk[2];
      const thu = chunk[3];
      const fri = chunk[4];
      const sat = chunk[5];

      const orderedDays = [sun, mon, tue, wed, thu, fri, sat];

      const bins = orderedDays.map((day, binIdx) => {
        const isInsideYear = day.getFullYear() === year;
        const dateStr = format(day, 'yyyy-MM-dd');
        const isFuture = isAfter(startOfDay(day), today);

        let level = 0;
        let completionInfo: ReturnType<typeof getDayCompletionInfo> = {
          completed: false,
          percent: 0,
          completedCount: 0,
          totalCount: 0,
        };

        if (isInsideYear && data) {
          completionInfo = getDayCompletionInfo(data, dateStr);
          if (completionInfo.percent > 0) level = 1;
          if (completionInfo.percent >= 25) level = 2;
          if (completionInfo.percent >= 50) level = 3;
          if (completionInfo.percent >= 75) level = 4;
          if (
            completionInfo.completedCount > 0 &&
            completionInfo.totalCount === 0 &&
            completionInfo.completed
          ) {
            level = 4;
          }
        }

        if (isInsideYear) {
          infoMap.set(dateStr, {
            info: completionInfo,
            isFuture,
            level,
            date: day,
          });
        }

        return {
          bin: binIdx,
          count: isInsideYear ? level : 0,
          date: day,
        };
      });

      return {
        bin: colIdx,
        bins,
      };
    });

    return { columns: cols, dayInfoMap: infoMap };
  }, [year, data, today]);

  return (
    <HeatmapInteractionProvider>
      <div className="w-full flex flex-col relative">
        <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
          <div className="min-w-[720px] xl:min-w-full">
            <HeatmapChart
              data={columns}
              layout="fluid"
              gap={3}
              weekStartDay={1}
              levelColors={EUSTACE_HEATMAP_COLORS}
              status={loading || !data ? 'loading' : 'ready'}
              showLoadingCells={true}
              animate={true}
              animationDuration={1200}
            >
              <HeatmapXAxis className="text-[10px] font-bold text-textMuted uppercase tracking-wider" />
              <HeatmapYAxis
                tickFilter="all"
                className="text-[9px] font-bold text-textMuted/60 uppercase tracking-tight"
              />
              <HeatmapCells
                cornerRadius={2}
                displayRange={displayRange}
                onCellClick={(bin) => onDayClick?.(bin.date)}
              />
              <HeatmapTooltip
                instant
                backgroundColor="#141414"
                className="border border-border/60 text-textMain rounded-xl shadow-2xl p-0"
                renderContent={({ date }) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const item = dayInfoMap.get(dateStr);
                  const isFuture = item?.isFuture ?? isAfter(startOfDay(date), today);
                  const info = item?.info ?? {
                    percent: 0,
                    completedCount: 0,
                    totalCount: 0,
                    completed: false,
                  };
                  const level = item?.level ?? 0;

                  return (
                    <div className="p-3.5 flex flex-col min-w-[200px]">
                      <div className="text-[11px] font-bold tracking-wide mb-2.5 text-textMain/90">
                        {format(date, 'EEEE, MMMM d, yyyy')}
                      </div>
                      {isFuture ? (
                        <div className="text-[10px] text-textMuted font-bold uppercase tracking-wider">
                          Future Date
                        </div>
                      ) : info.totalCount === 0 && info.completedCount === 0 ? (
                        <div className="text-[10px] text-textMuted font-bold uppercase tracking-wider">
                          0 tasks completed
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-[10px] text-textMuted uppercase font-bold tracking-wider">
                              Tasks Completed
                            </span>
                            <span className="text-[11px] font-bold text-textMain">
                              {info.completedCount} /{' '}
                              {info.totalCount === 0 ? info.completedCount : info.totalCount}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-[10px] text-textMuted uppercase font-bold tracking-wider">
                              Completion
                            </span>
                            <span
                              className={cn(
                                'text-[11px] font-bold',
                                level > 0
                                  ? 'text-accent drop-shadow-[0_0_4px_rgba(34,197,94,0.3)]'
                                  : 'text-textMain'
                              )}
                            >
                              {info.percent}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
            </HeatmapChart>
          </div>
        </div>

        {/* Bottom Strip: Progress & Interactive Legend */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
          <div className="flex items-center gap-4">
            {isCurrentYear ? (
              <>
                <div className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                  {year} PROGRESS
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 md:w-32 h-[4px] bg-[#161616] rounded-full overflow-hidden border border-border/40">
                    <div
                      className="h-full bg-textMuted/40"
                      style={{ width: `${(dayOfYear / daysInYear) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-textMain">
                    {dayOfYear} / {daysInYear} days
                  </span>
                  <span className="text-[10px] font-semibold text-textMuted/70">
                    ({daysInYear - dayOfYear} remaining)
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                  {year} PROGRESS
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 md:w-32 h-[4px] bg-[#161616] rounded-full overflow-hidden border border-border/40">
                    <div className="h-full bg-textMuted/40" style={{ width: '100%' }} />
                  </div>
                  <span className="text-[10px] font-bold text-textMain">
                    {daysInYear} / {daysInYear} days
                  </span>
                  <span className="text-[10px] font-semibold text-textMuted/70">
                    (0 remaining)
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <HeatmapLegend
              lessLabel="Less"
              moreLabel="More"
              cellSize={10}
              gap={3}
              cornerRadius={2}
              levelColors={EUSTACE_HEATMAP_COLORS}
              labelClassName="text-[9px] font-bold text-textMuted uppercase tracking-wider"
            />
          </div>
        </div>
      </div>
    </HeatmapInteractionProvider>
  );
}
