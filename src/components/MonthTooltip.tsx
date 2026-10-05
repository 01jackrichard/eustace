import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, getDaysInMonth } from 'date-fns';
import { getDayCompletionInfo, type AppData } from '../lib/dataManager';

interface MonthTooltipProps {
  year: number;
  month: number;
  rect: DOMRect;
  data: AppData;
}

export function MonthTooltip({ year, month, rect, data }: MonthTooltipProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  const monthStart = new Date(year, month, 1);
  const daysInMonth = getDaysInMonth(monthStart);
  const monthPrefix = format(monthStart, 'yyyy-MM');

  let completedDays = 0;
  let totalTasks = 0;
  let tasksCompleted = 0;
  let currentRun = 0;
  let bestStreak = 0;

  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${monthPrefix}-${i.toString().padStart(2, '0')}`;
    const info = getDayCompletionInfo(data, dateStr);

    if (info.completed) {
      completedDays++;
      currentRun++;
      if (currentRun > bestStreak) bestStreak = currentRun;
    } else {
      currentRun = 0;
    }

    tasksCompleted += info.completedCount;
    totalTasks += info.totalCount;
  }

  const completionPercent = Math.round((completedDays / daysInMonth) * 100);
  const incompleteDays = daysInMonth - completedDays;

  useEffect(() => {
    const tooltipWidth = 220;
    let top = rect.top;
    let left = rect.right + 16;

    if (left + tooltipWidth > window.innerWidth - 10) {
      left = rect.left - tooltipWidth - 16; // Show on left if no space
    }
    if (top < 10) top = 10;

    setPosition({ top: top + window.scrollY, left: left + window.scrollX });
    setMounted(true);
  }, [rect]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="absolute z-[100] animate-pop pointer-events-none"
      style={{ top: position.top, left: position.left }}
    >
      <div className="bg-surface border border-border rounded-xl shadow-2xl p-5 min-w-[220px]">
        <div className="text-sm font-bold text-textMain mb-3 tracking-wide">
          {format(monthStart, 'MMMM yyyy').toUpperCase()}
        </div>

        <div className="flex flex-col gap-2 mb-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-accent flex items-center gap-1.5">✓ Completed</span>
            <span className="font-medium text-textMain">{completedDays} days</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-textMuted flex items-center gap-1.5">✕ Incomplete</span>
            <span className="font-medium text-textMain">{incompleteDays} days</span>
          </div>
        </div>

        <div className="h-px w-full bg-border my-3" />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-[10px] text-textMuted uppercase tracking-wider mb-0.5">Completion</div>
            <div className="text-base font-semibold text-textMain">{completionPercent}%</div>
          </div>
          <div>
            <div className="text-[10px] text-textMuted uppercase tracking-wider mb-0.5">🔥 Best Streak</div>
            <div className="text-base font-semibold text-textMain">{bestStreak} days</div>
          </div>
        </div>

        <div className="h-px w-full bg-border my-3" />

        <div className="flex items-center justify-between">
          <span className="text-xs text-textMuted font-medium uppercase tracking-wider">Tasks</span>
          <span className="text-sm font-semibold text-textMain">{tasksCompleted} / {totalTasks}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
