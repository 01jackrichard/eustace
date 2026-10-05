import { useState } from 'react';
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfWeek } from 'date-fns';
import type { AppData } from '../lib/dataManager';
import { DayCell } from './DayCell';
import { MonthTooltip } from './MonthTooltip';

interface MonthCalendarProps {
  year: number;
  month: number; // 0-11
  data: AppData;
  onDayClick: (date: Date) => void;
  hideHeader?: boolean;
}

export function MonthCalendar({ year, month, data, onDayClick, hideHeader = false }: MonthCalendarProps) {
  const [headerRect, setHeaderRect] = useState<DOMRect | null>(null);

  const monthStart = new Date(year, month, 1);
  const monthEnd = endOfMonth(monthStart);

  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="flex flex-col group/month">
      {!hideHeader && (
        <>
          <div
            className="text-sm font-medium text-textMain mb-3 px-1 group-hover/month:text-accent transition-colors w-max cursor-default"
            onMouseEnter={(e) => setHeaderRect(e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setHeaderRect(null)}
          >
            {format(monthStart, 'MMMM')}
          </div>
          {headerRect && <MonthTooltip year={year} month={month} rect={headerRect} data={data} />}
        </>
      )}

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 w-max">
        {weekDays.map((day, i) => (
          <div key={`header-${i}`} className="text-[10px] text-textMuted text-center font-medium mb-1">
            {day}
          </div>
        ))}

        {days.map((day) => (
          <DayCell
            key={day.toISOString()}
            date={day}
            data={data}
            onDayClick={onDayClick}
            inCurrentMonth={isSameMonth(day, monthStart)}
          />
        ))}
      </div>
    </div>
  );
}
