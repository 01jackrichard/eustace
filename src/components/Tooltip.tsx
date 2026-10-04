import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { getDayCompletionInfo, type AppData } from '../lib/dataManager';
import { cn } from '../lib/utils';

interface TooltipProps {
  date: Date;
  rect: DOMRect;
  data: AppData;
}

export function Tooltip({ date, rect, data }: TooltipProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  const dateStr = format(date, 'yyyy-MM-dd');
  const info = getDayCompletionInfo(data, dateStr);

  useEffect(() => {
    // Calculate tooltip position centered above the element
    const tooltipWidth = 160; 
    const tooltipHeight = 70; // approx
    
    let top = rect.top - tooltipHeight - 10;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    // Edge adjustment
    if (top < 10) top = rect.bottom + 10; // Flip below if too high
    if (left < 10) left = 10;
    if (left + tooltipWidth > window.innerWidth - 10) left = window.innerWidth - tooltipWidth - 10;

    setPosition({ top: top + window.scrollY, left: left + window.scrollX });
    setMounted(true);
  }, [rect]);

  if (!mounted) return null;

  return createPortal(
    <div 
      className="absolute z-[100] animate-pop pointer-events-none flex flex-col items-center"
      style={{ top: position.top, left: position.left }}
    >
      <div className="bg-surface border border-border rounded-lg shadow-xl px-4 py-3 min-w-[160px]">
        <div className="text-sm font-medium text-textMain mb-1">
          {format(date, 'MMMM d, yyyy')}
        </div>
        <div className={cn("text-xs flex items-center gap-1.5", info.completed ? "text-accent" : "text-textMuted")}>
          {info.completed ? "✓ Completed" : "Not completed"}
        </div>
        <div className="text-xs text-textMuted mt-1">
          {info.totalCount > 0 ? `${info.completedCount} / ${info.totalCount} tasks` : 'No tasks'}
        </div>
      </div>
      {/* Tooltip Arrow */}
      {rect.top - position.top > 0 && (
        <div className="w-3 h-3 bg-surface border-b border-r border-border transform rotate-45 -mt-[7px]" />
      )}
    </div>,
    document.body
  );
}
