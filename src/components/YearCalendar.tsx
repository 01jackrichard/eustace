import { useState } from 'react';
import type { AppData } from '../lib/dataManager';
import { MonthCalendar } from './MonthCalendar';
import { differenceInDays, endOfYear, startOfYear, format } from 'date-fns';
import { MonthDetailModal } from './MonthDetailModal';

interface YearCalendarProps {
  year: number;
  data: AppData;
  onDayClick: (date: Date) => void;
}

export function YearCalendar({ year, data, onDayClick }: YearCalendarProps) {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const months = Array.from({ length: 12 }, (_, i) => i);
  
  const today = new Date();
  const isCurrentYear = today.getFullYear() === year;
  
  let yearProgress = 0;
  let remainingDays = 0;
  
  if (isCurrentYear) {
    const start = startOfYear(today);
    const end = endOfYear(today);
    const totalDays = differenceInDays(end, start) + 1;
    const passedDays = differenceInDays(today, start) + 1;
    remainingDays = totalDays - passedDays;
    yearProgress = (passedDays / totalDays) * 100;
  } else if (year < today.getFullYear()) {
    yearProgress = 100;
    remainingDays = 0;
  } else {
    yearProgress = 0;
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    remainingDays = differenceInDays(end, start) + 1;
  }

  return (
    <>
      <div className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4 hidden">
          <h2 className="text-xl font-bold tracking-tight">{year} OVERVIEW</h2>
          
          {isCurrentYear && (
            <div className="flex items-center gap-4 text-sm w-full sm:w-auto">
              <div className="flex-grow sm:w-48 h-2 bg-background rounded-full overflow-hidden border border-border">
                <div 
                  className="h-full bg-textMuted/40 rounded-full transition-all duration-1000"
                  style={{ width: `${yearProgress}%` }}
                />
              </div>
              <span className="text-textMuted whitespace-nowrap">
                {remainingDays} days remaining
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-10">
          {months.map(month => (
            <div key={`${year}-${month}`} className="flex flex-col items-center sm:items-start group">
              <button 
                onClick={() => setSelectedMonth(month)}
                className="text-sm font-medium text-textMain mb-3 px-1 hover:text-accent transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                aria-label={`View details for ${format(new Date(year, month, 1), 'MMMM')}`}
              >
                {format(new Date(year, month, 1), 'MMMM')}
              </button>
              <MonthCalendar 
                year={year} 
                month={month} 
                data={data} 
                onDayClick={onDayClick} 
                hideHeader={true}
              />
            </div>
          ))}
        </div>
      </div>

      {selectedMonth !== null && (
        <MonthDetailModal
          year={year}
          month={selectedMonth}
          data={data}
          onDayClick={onDayClick}
          onClose={() => setSelectedMonth(null)}
        />
      )}
    </>
  );
}
