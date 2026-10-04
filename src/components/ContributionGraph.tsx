import { useMemo } from 'react';
import type { AppData } from '../lib/dataManager';
import { format, eachDayOfInterval, startOfWeek, endOfWeek, isToday, isAfter, startOfDay, getDayOfYear, getDaysInYear } from 'date-fns';
import { getDayCompletionInfo } from '../lib/dataManager';
import { cn } from '../lib/utils';

interface ContributionGraphProps {
  year: number;
  data: AppData;
  onDayClick: (date: Date) => void;
}

export function ContributionGraph({ year, data, onDayClick }: ContributionGraphProps) {
  const heatmapData = useMemo(() => {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    
    // GitHub style week starts on Monday
    const calendarStart = startOfWeek(startDate, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(endDate, { weekStartsOn: 1 });
    
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    
    // Group into columns of 7 days (Mon-Sun)
    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];
    
    days.forEach(day => {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });
    
    // Month labels: find the week index where a month first appears
    const monthLabels: { label: string, colIndex: number }[] = [];
    weeks.forEach((week, index) => {
      // Find the first day of the month that belongs to the selected year
      const firstOfMonth = week.find(d => d.getFullYear() === year && d.getDate() === 1);
      if (firstOfMonth) {
        monthLabels.push({ label: format(firstOfMonth, 'MMM'), colIndex: index });
      }
    });

    return { weeks, monthLabels };
  }, [year]);

  const today = startOfDay(new Date());
  const dayOfYear = getDayOfYear(today);
  const daysInYear = getDaysInYear(new Date(year, 0, 1));
  const isCurrentYear = today.getFullYear() === year;

  // The grid has 1 row for month labels, 7 rows for days = 8 rows total.
  // Col 1 is weekday labels. Col 2...N are weeks.
  return (
    <div className="w-full flex flex-col relative">
      <div className="w-full overflow-x-auto pb-6 custom-scrollbar">
        <div className="min-w-full">
          
          <div 
            className="grid gap-[3px] sm:gap-[4px]"
            style={{
              gridTemplateRows: '20px repeat(7, min-content)',
              gridTemplateColumns: `max-content repeat(${heatmapData.weeks.length}, minmax(8px, 1fr))`
            }}
          >
            {/* Month Labels (Row 1) */}
            {heatmapData.monthLabels.map(({ label, colIndex }) => (
              <div 
                key={label}
                className="relative flex items-end"
                style={{ gridRow: 1, gridColumn: colIndex + 2 }} // +2 because col 1 is weekday labels
              >
                <span className="absolute bottom-1 left-0 text-[10px] font-bold text-textMuted uppercase tracking-wider whitespace-nowrap">
                  {label}
                </span>
              </div>
            ))}

            {/* Weekday Labels (Col 1, Rows 2-8) */}
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((dayStr, idx) => (
              <div 
                key={dayStr}
                className="flex items-center justify-end pr-2"
                style={{ gridRow: idx + 2, gridColumn: 1 }}
              >
                <span className="text-[9px] font-bold text-textMuted/60 uppercase leading-none">{dayStr}</span>
              </div>
            ))}

            {/* Cells */}
            {heatmapData.weeks.map((week, wIdx) => (
              week.map((day, dIdx) => {
                const isInsideYear = day.getFullYear() === year;
                
                // If it's padding from previous/next year, render an invisible cell to maintain the grid
                if (!isInsideYear) {
                  return (
                    <div 
                      key={day.toISOString()} 
                      style={{ gridRow: dIdx + 2, gridColumn: wIdx + 2 }}
                      className="w-full aspect-square bg-transparent opacity-0 pointer-events-none" 
                    />
                  );
                }

                const dateStr = format(day, 'yyyy-MM-dd');
                const info = getDayCompletionInfo(data, dateStr);
                const isTodayFlag = isToday(day);
                const isFutureFlag = isAfter(startOfDay(day), today);
                
                let level = 0;
                if (info.percent > 0) level = 1;
                if (info.percent >= 25) level = 2;
                if (info.percent >= 50) level = 3;
                if (info.percent >= 75) level = 4;
                if (info.completedCount > 0 && info.totalCount === 0 && info.completed) level = 4;

                return (
                  <div 
                    key={dateStr} 
                    style={{ gridRow: dIdx + 2, gridColumn: wIdx + 2 }}
                    className="w-full aspect-square relative group/cell"
                  >
                    <button
                      onClick={() => onDayClick(day)}
                      className={cn(
                        "w-full h-full rounded-[2px] transition-all duration-300 block",
                        isFutureFlag ? "bg-[#0a0a0a] border border-border/10 group-hover/cell:border-border/30" :
                        level === 0 ? "bg-[#161616] border border-border/30 group-hover/cell:border-textMuted/60" :
                        level === 1 ? "bg-accent/20 border border-accent/20 group-hover/cell:border-accent/60 group-hover/cell:scale-110" :
                        level === 2 ? "bg-accent/40 border border-accent/40 group-hover/cell:border-accent group-hover/cell:scale-110" :
                        level === 3 ? "bg-accent/70 border border-accent/70 group-hover/cell:border-accent group-hover/cell:scale-110 shadow-[0_0_8px_rgba(34,197,94,0.25)]" :
                        "bg-accent border border-accent group-hover/cell:bg-accentHover group-hover/cell:scale-110 shadow-[0_0_12px_rgba(34,197,94,0.4)]",
                        isTodayFlag ? "ring-[1.5px] ring-offset-[1.5px] ring-offset-[#101010] ring-textMain/40 z-10" : ""
                      )}
                    />
                    
                    {/* Tooltip */}
                    <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 mb-1 w-max bg-[#141414] border border-border/60 text-textMain rounded-xl p-3.5 opacity-0 group-hover/cell:opacity-100 transition-all duration-200 pointer-events-none shadow-2xl z-50 transform group-hover/cell:-translate-y-1 scale-95 group-hover/cell:scale-100">
                      <div className="text-[11px] font-bold tracking-wide mb-2.5 text-textMain/90">{format(day, 'EEEE, MMMM d, yyyy')}</div>
                      {isFutureFlag ? (
                         <div className="text-[10px] text-textMuted font-bold uppercase tracking-wider">Future Date</div>
                      ) : info.totalCount === 0 && info.completedCount === 0 ? (
                         <div className="text-[10px] text-textMuted font-bold uppercase tracking-wider">0 tasks completed</div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-[10px] text-textMuted uppercase font-bold tracking-wider">Tasks Completed</span>
                            <span className="text-[11px] font-bold text-textMain">{info.completedCount} / {info.totalCount === 0 ? info.completedCount : info.totalCount}</span>
                          </div>
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-[10px] text-textMuted uppercase font-bold tracking-wider">Completion</span>
                            <span className={cn("text-[11px] font-bold", level > 0 ? "text-accent drop-shadow-[0_0_4px_rgba(34,197,94,0.3)]" : "text-textMain")}>{info.percent}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ))}
          </div>

        </div>
      </div>
      
      {/* Bottom Strip: Progress & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
        <div className="flex items-center gap-4">
          {isCurrentYear ? (
            <>
              <div className="text-[10px] font-bold text-textMuted uppercase tracking-wider">{year} PROGRESS</div>
              <div className="flex items-center gap-2">
                <div className="w-24 md:w-32 h-[4px] bg-[#161616] rounded-full overflow-hidden border border-border/40">
                  <div className="h-full bg-textMuted/40" style={{ width: `${(dayOfYear / daysInYear) * 100}%` }} />
                </div>
                <span className="text-[10px] font-bold text-textMain">{dayOfYear} / {daysInYear} days</span>
                <span className="text-[10px] font-semibold text-textMuted/70">({daysInYear - dayOfYear} remaining)</span>
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] font-bold text-textMuted uppercase tracking-wider">{year} PROGRESS</div>
              <div className="flex items-center gap-2">
                <div className="w-24 md:w-32 h-[4px] bg-[#161616] rounded-full overflow-hidden border border-border/40">
                  <div className="h-full bg-textMuted/40" style={{ width: '100%' }} />
                </div>
                <span className="text-[10px] font-bold text-textMain">{daysInYear} / {daysInYear} days</span>
                <span className="text-[10px] font-semibold text-textMuted/70">(0 remaining)</span>
              </div>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] font-bold text-textMuted uppercase tracking-wider mr-1">Less</span>
          <div className="w-[10px] h-[10px] rounded-[2px] bg-[#161616] border border-border/30" />
          <div className="w-[10px] h-[10px] rounded-[2px] bg-accent/20 border border-accent/20" />
          <div className="w-[10px] h-[10px] rounded-[2px] bg-accent/40 border border-accent/40" />
          <div className="w-[10px] h-[10px] rounded-[2px] bg-accent/70 border border-accent/70" />
          <div className="w-[10px] h-[10px] rounded-[2px] bg-accent border border-accent shadow-[0_0_8px_rgba(34,197,94,0.3)]" />
          <span className="text-[9px] font-bold text-textMuted uppercase tracking-wider ml-1">More</span>
        </div>
      </div>
    </div>
  );
}
