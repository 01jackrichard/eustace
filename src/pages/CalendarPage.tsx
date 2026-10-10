import { SmoothInput } from '../components/ui/SmoothInput';
/* eslint-disable react-compiler/react-compiler, react/purity, react-hooks/exhaustive-deps, react/set-state-in-effect */
import { useState, useMemo, useRef, useEffect } from 'react';
import { Loader2, ChevronLeft, ChevronRight, ChevronDown, Check, Search } from 'lucide-react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, isToday, startOfWeek, endOfWeek,
  subYears, addYears, eachMonthOfInterval, startOfYear, endOfYear,
  parseISO, differenceInDays, startOfDay
} from 'date-fns';
import { cn } from '../lib/utils';
import { useProductivityData } from '../hooks/useProductivityData';
import { DayPlanner } from '../components/DayPlanner';

export function CalendarPage() {
  const [view, setView] = useState<'month' | 'year' | 'day'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedTaskId, setSelectedTaskId] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);

  const hook = useProductivityData(currentDate.getFullYear());
  const { data, loading } = hook;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePrev = () => setCurrentDate(prev => view === 'year' ? subYears(prev, 1) : subMonths(prev, 1));
  const handleNext = () => setCurrentDate(prev => view === 'year' ? addYears(prev, 1) : addMonths(prev, 1));

  // Extract all unique tasks for the filter
  const allTasks = useMemo(() => {
    if (!data) return [];
    const tasksMap = new Map();
    data.recurringTasks.forEach(t => tasksMap.set(t.id, t));
    Object.values(data.days).forEach(day => {
      day.tasks.forEach(t => tasksMap.set(t.id, t));
    });
    return Array.from(tasksMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const selectedTaskName = useMemo(() => {
    if (selectedTaskId === 'ALL') return 'ALL TASKS';
    return allTasks.find(t => t.id === selectedTaskId)?.name || 'UNKNOWN TASK';
  }, [selectedTaskId, allTasks]);

  const filteredTasks = useMemo(() => {
    if (!filterSearch) return allTasks;
    return allTasks.filter(t => t.name.toLowerCase().includes(filterSearch.toLowerCase()));
  }, [allTasks, filterSearch]);

  // Aggregate completions by date
  const completionsByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!data) return map;

    Object.entries(data.days).forEach(([dateStr, dayData]) => {
      const completed = dayData.completedTaskIds;
      if (completed.length > 0) {
        if (selectedTaskId === 'ALL') {
          map.set(dateStr, completed);
        } else if (completed.includes(selectedTaskId)) {
          map.set(dateStr, [selectedTaskId]);
        }
      }
    });
    return map;
  }, [data, selectedTaskId]);

  const yearStats = useMemo(() => {
    if (view !== 'year') return null;
    const sortedDates = Array.from(completionsByDate.keys()).sort();
    const completedDays = sortedDates.length;

    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    let lastDate: Date | null = null;

    for (const dateStr of sortedDates) {
      const date = parseISO(dateStr);
      if (!lastDate) {
        tempStreak = 1;
      } else {
        const diff = differenceInDays(date, lastDate);
        if (diff === 1) {
          tempStreak++;
        } else if (diff > 1) {
          if (tempStreak > bestStreak) bestStreak = tempStreak;
          tempStreak = 1;
        }
      }
      lastDate = date;
    }
    if (tempStreak > bestStreak) bestStreak = tempStreak;

    if (lastDate) {
      const diffToToday = differenceInDays(startOfDay(new Date()), startOfDay(lastDate));
      if (diffToToday <= 1) currentStreak = tempStreak;
    }

    return { completedDays, currentStreak, bestStreak };
  }, [completionsByDate, view]);

  const renderMonthGrid = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    return (
      <div className="w-full animate-in fade-in duration-300">
        <div className="grid grid-cols-7 mb-4">
          {weekDays.map(day => (
            <div key={day} className="text-center text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayCompletions = completionsByDate.get(dateStr) || [];
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isDayToday = isToday(day);

            let marker = null;

            if (selectedTaskId === 'ALL') {
              const count = dayCompletions.length;
              if (count > 0) {
                let opacity = 'opacity-20';
                if (count > 2) opacity = 'opacity-50';
                if (count > 4) opacity = 'opacity-90';
                marker = <div className={cn("absolute inset-2 md:inset-3 rounded-md bg-accent mix-blend-screen transition-opacity", opacity)} />;
              }
            } else {
              if (dayCompletions.length > 0) {
                marker = <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_rgba(34,197,94,0.4)]" />;
              }
            }

            return (
              <button
                key={dateStr}
                onClick={() => {
                  setSelectedDate(day);
                  setView('day');
                }}
                className={cn(
                  "relative flex flex-col items-center justify-start p-2 aspect-square md:aspect-auto md:h-20 lg:h-24 rounded-lg border transition-all duration-200 overflow-hidden group",
                  !isCurrentMonth ? "opacity-20 border-transparent hover:opacity-50" : "bg-surface border-border/40 hover:border-border/80 cursor-pointer",
                  isSelected && "ring-1 ring-accent border-transparent",
                  isDayToday && !isSelected && "border-textMuted/40"
                )}
              >
                <span className={cn(
                  "text-xs md:text-sm font-medium z-10",
                  !isCurrentMonth ? "text-textMuted" : (isDayToday ? "text-accent font-bold" : "text-textMain")
                )}>
                  {format(day, 'd')}
                </span>
                {marker}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderYearGrid = () => {
    const months = eachMonthOfInterval({ start: startOfYear(currentDate), end: endOfYear(currentDate) });

    return (
      <div className="w-full animate-in fade-in duration-300">
        {yearStats && (
          <div className="flex flex-wrap gap-6 md:gap-12 mb-10 pb-6 border-b border-border/40">
            <div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase mb-1">Completed Days</div>
              <div className="text-2xl font-black text-textMain">{yearStats.completedDays}</div>
            </div>
            {selectedTaskId !== 'ALL' && (
              <>
                <div>
                  <div className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase mb-1">Current Streak</div>
                  <div className="text-2xl font-black text-textMain">{yearStats.currentStreak} <span className="text-sm font-normal text-textMuted ml-1">days</span></div>
                </div>
                <div>
                  <div className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase mb-1">Best Streak</div>
                  <div className="text-2xl font-black text-textMain">{yearStats.bestStreak} <span className="text-sm font-normal text-textMuted ml-1">days</span></div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-12">
          {months.map(monthDate => {
            const mStart = startOfMonth(monthDate);
            const mEnd = endOfMonth(monthDate);
            const mDays = eachDayOfInterval({ start: startOfWeek(mStart), end: endOfWeek(mEnd) });

            return (
              <button
                key={monthDate.toString()}
                className="flex flex-col group cursor-pointer text-left"
                onClick={() => {
                  setCurrentDate(monthDate);
                  setView('month');
                }}
              >
                <h3 className="text-[11px] font-bold tracking-[0.2em] text-textMuted uppercase mb-3 group-hover:text-textMain transition-colors">
                  {format(monthDate, 'MMMM')}
                </h3>
                <div className="grid grid-cols-7 gap-1 w-full max-w-[200px]">
                  {mDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayCompletions = completionsByDate.get(dateStr) || [];
                    const isCurrentMonth = isSameMonth(day, monthDate);

                    let bg = 'bg-transparent';
                    if (isCurrentMonth) {
                      bg = 'bg-border/40';
                      if (selectedTaskId === 'ALL') {
                        const count = dayCompletions.length;
                        if (count === 1) bg = 'bg-accent/30';
                        else if (count <= 3) bg = 'bg-accent/60';
                        else if (count > 3) bg = 'bg-accent';
                      } else if (dayCompletions.length > 0) {
                        bg = 'bg-accent';
                      }
                    }

                    return (
                      <div
                        key={dateStr}
                        className={cn(
                          "aspect-square rounded-[2px]",
                          bg,
                          isCurrentMonth && bg === 'bg-border/40' && "group-hover:bg-border/80 transition-colors"
                        )}
                      />
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in min-h-[100dvh] pb-24 flex flex-col">
      {/* TOP CONTROLS ROW */}
      <div className="max-w-[1400px] w-full mx-auto px-4 md:px-8 pt-6 md:pt-10 flex-shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8 md:mb-12">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-textMain uppercase">CALENDAR</h1>
            <p className="text-textMuted mt-2 text-sm leading-relaxed">Your completion history.</p>
          </div>

          {view !== 'day' && (
            <div className="flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* TASK FILTER POPOVER */}
              <div className="relative z-30" ref={filterRef}>
                <button
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="w-48 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-surface border border-border/60 hover:border-textMuted/40 transition-all text-sm font-bold text-textMain tracking-wide shadow-sm"
                >
                  <span className="truncate">{selectedTaskName}</span>
                  <ChevronDown size={14} className={cn("text-textMuted transition-transform shrink-0", isFilterOpen && "rotate-180")} />
                </button>

                {isFilterOpen && (
                  <div className="absolute top-full right-0 mt-2 w-64 max-h-[50vh] flex flex-col bg-surface border border-border/80 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    {allTasks.length > 5 && (
                      <div className="p-2 border-b border-border/40 shrink-0">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                          <SmoothInput
                            type="text"
                            placeholder="Find task..."
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                            className="w-full bg-background border border-border/60 rounded-lg pl-9 pr-3 py-2 text-xs text-textMain placeholder:text-textMuted/50 focus:outline-none focus:border-textMuted"
                          />
                        </div>
                      </div>
                    )}
                    <div className="overflow-y-auto flex-1 p-1">
                      <button
                        onClick={() => { setSelectedTaskId('ALL'); setIsFilterOpen(false); setFilterSearch(''); }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold tracking-wide flex items-center justify-between transition-colors",
                          selectedTaskId === 'ALL' ? "bg-background text-textMain" : "text-textMuted hover:bg-white/5 hover:text-textMain"
                        )}
                      >
                        ALL TASKS
                        {selectedTaskId === 'ALL' && <Check size={14} className="text-accent" />}
                      </button>
                      <div className="h-px bg-border/40 mx-2 my-1 shrink-0" />
                      {filteredTasks.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedTaskId(t.id); setIsFilterOpen(false); setFilterSearch(''); }}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors",
                            selectedTaskId === t.id ? "bg-background text-textMain font-bold" : "text-textMuted hover:bg-white/5 hover:text-textMain"
                          )}
                        >
                          <span className="truncate pr-4">{t.name}</span>
                          {selectedTaskId === t.id && <Check size={14} className="text-accent shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* MONTH / YEAR SWITCH */}
              <div className="flex items-center bg-surface border border-border/60 rounded-xl p-1 shadow-sm">
                <button
                  onClick={() => setView('month')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[11px] font-bold tracking-widest transition-all",
                    view === 'month' ? "bg-background text-textMain shadow-sm border border-border/40" : "text-textMuted hover:text-textMain"
                  )}
                >
                  MONTH
                </button>
                <button
                  onClick={() => setView('year')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[11px] font-bold tracking-widest transition-all",
                    view === 'year' ? "bg-background text-textMain shadow-sm border border-border/40" : "text-textMuted hover:text-textMain"
                  )}
                >
                  YEAR
                </button>
              </div>

              {/* DATE NAVIGATION */}
              <div className="flex items-center justify-between bg-surface px-2 py-1.5 rounded-xl border border-border/60 shadow-sm">
                <button onClick={handlePrev} className="p-1.5 text-textMuted hover:text-textMain hover:bg-white/5 transition-colors rounded-lg">
                  <ChevronLeft size={16} />
                </button>
                <div className="w-32 text-center font-bold text-xs tracking-widest text-textMain select-none uppercase">
                  {view === 'month' ? format(currentDate, 'MMMM yyyy') : format(currentDate, 'yyyy')}
                </div>
                <button onClick={handleNext} className="p-1.5 text-textMuted hover:text-textMain hover:bg-white/5 transition-colors rounded-lg">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="max-w-[1400px] w-full mx-auto px-4 md:px-8 flex-1 flex">
        {loading && !data ? (
          <div className="flex-1 flex flex-col items-center justify-center text-textMuted gap-4 h-64">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
            <p className="text-sm font-medium tracking-wide">Loading history...</p>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            {view === 'day' && data ? (
              <div className="w-full max-w-[800px] animate-in fade-in slide-in-from-bottom-4 duration-300">
                <DayPlanner
                  date={selectedDate}
                  data={data}
                  selectedTaskId={selectedTaskId}
                  onClose={() => setView('month')}
                  onChangeDate={setSelectedDate}
                  hook={hook}
                />
              </div>
            ) : (
              <div className="w-full max-w-[980px]">
                <div className="mb-6 md:mb-8 text-center md:text-left">
                  <h2 className="text-xl md:text-2xl font-black text-textMain tracking-tight uppercase">
                    {selectedTaskId !== 'ALL' && <span className="text-textMuted font-bold mr-3">{selectedTaskName}</span>}
                    {view === 'month' ? format(currentDate, 'MMMM yyyy') : format(currentDate, 'yyyy')}
                  </h2>
                </div>
                {view === 'month' ? renderMonthGrid() : renderYearGrid()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
