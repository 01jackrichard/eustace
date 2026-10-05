import { format, getDaysInMonth } from 'date-fns';
import type { AppData } from '../lib/dataManager';
import { getDayCompletionInfo } from '../lib/dataManager';
import { MonthCalendar } from './MonthCalendar';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface MonthDetailModalProps {
  year: number;
  month: number;
  data: AppData;
  onDayClick: (date: Date) => void;
  onClose: () => void;
}

export function MonthDetailModal({ year, month, data, onDayClick, onClose }: MonthDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  const monthStart = new Date(year, month, 1);
  const daysInMonth = getDaysInMonth(monthStart);

  // Calculate month specific stats
  const monthPrefix = format(monthStart, 'yyyy-MM');
  let monthCompleted = 0;
  for (let i = 1; i <= daysInMonth; i++) {
    const dStr = `${monthPrefix}-${i.toString().padStart(2, '0')}`;
    if (getDayCompletionInfo(data, dStr).completed) monthCompleted++;
  }
  const completionPercent = Math.round((monthCompleted / daysInMonth) * 100);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => {
      window.addEventListener('click', handleClickOutside);
    }, 10);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
      <div
        ref={modalRef}
        className="bg-surface border border-border rounded-2xl p-6 md:p-8 max-w-sm w-full shadow-2xl relative animate-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="month-dialog-title"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-textMuted hover:text-textMain bg-background hover:bg-surfaceHover rounded-full transition-colors"
          aria-label="Close dialog"
        >
          <X size={16} />
        </button>

        <h2 id="month-dialog-title" className="text-xl font-bold tracking-tight mb-6">
          {format(monthStart, 'MMMM yyyy').toUpperCase()}
        </h2>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div>
            <div className="text-xs text-textMuted font-medium tracking-wider mb-1">TOTAL DAYS</div>
            <div className="text-xl font-semibold">{daysInMonth}</div>
          </div>
          <div>
            <div className="text-xs text-textMuted font-medium tracking-wider mb-1">COMPLETED</div>
            <div className="text-xl font-semibold text-accent">{monthCompleted}</div>
          </div>
          <div>
            <div className="text-xs text-textMuted font-medium tracking-wider mb-1">COMPLETION</div>
            <div className="text-xl font-semibold">{completionPercent}%</div>
          </div>
        </div>

        <div className="flex justify-center bg-background border border-border/50 rounded-xl p-6">
          <MonthCalendar
            year={year}
            month={month}
            data={data}
            onDayClick={onDayClick}
          />
        </div>
      </div>
    </div>
  );
}
