import { memo, useState } from 'react';
import { format, isFuture, isToday } from 'date-fns';
import { cn } from '../lib/utils';
import type { AppData } from '../lib/dataManager';
import { getDayCompletionInfo } from '../lib/dataManager';
import { Tooltip } from './Tooltip';

interface DayCellProps {
  date: Date;
  data: AppData;
  onDayClick: (date: Date) => void;
  inCurrentMonth: boolean;
}

export const DayCell = memo(({ date, data, onDayClick, inCurrentMonth }: DayCellProps) => {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dateStr = format(date, 'yyyy-MM-dd');
  const info = getDayCompletionInfo(data, dateStr);
  const today = isToday(date);
  const future = isFuture(date);

  if (!inCurrentMonth) {
    return <div className="w-[14px] h-[14px] sm:w-4 sm:h-4 opacity-0 pointer-events-none" />;
  }

  // Calculate intensity based on percent
  let intensityClass = "bg-surface border border-border/50 hover:border-textMuted/50 hover:bg-surfaceHover";
  if (info.percent > 0) {
    if (info.percent < 25) intensityClass = "bg-accent/20 border-accent/20 hover:bg-accent/30";
    else if (info.percent < 50) intensityClass = "bg-accent/40 border-accent/40 hover:bg-accent/50";
    else if (info.percent < 75) intensityClass = "bg-accent/60 border-accent/60 hover:bg-accent/70";
    else if (info.percent < 100) intensityClass = "bg-accent/80 border-accent/80 hover:bg-accent/90";
    else intensityClass = "bg-accent hover:bg-accentHover shadow-[0_0_8px_rgba(34,197,94,0.3)]";
  }

  return (
    <>
      <button
        onClick={() => {
          if (!future) onDayClick(date);
        }}
        onMouseEnter={(e) => setRect(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setRect(null)}
        disabled={future}
        className={cn(
          "w-[14px] h-[14px] sm:w-4 sm:h-4 rounded-[3px] sm:rounded-sm transition-all duration-200 relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          intensityClass,
          today && !info.completed && "ring-1 ring-textMuted ring-offset-1 ring-offset-background outline outline-1 outline-textMuted/30",
          today && info.completed && "ring-1 ring-accent ring-offset-1 ring-offset-background outline outline-1 outline-accent/30 scale-110",
          future && "opacity-20 cursor-not-allowed hover:bg-surface hover:border-border/50"
        )}
        aria-label={`${format(date, 'MMMM d, yyyy')}${info.completed ? ', completed' : ''}`}
      />
      {rect && <Tooltip date={date} rect={rect} data={data} />}
    </>
  );
});

DayCell.displayName = 'DayCell';
