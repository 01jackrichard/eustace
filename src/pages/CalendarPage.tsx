import { useState, useMemo } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Search, Plus, Check, Filter, X } from 'lucide-react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, isToday, startOfWeek, endOfWeek,
  subYears, addYears, eachMonthOfInterval, startOfYear, endOfYear,
  addDays, subDays
} from 'date-fns';
import { cn } from '../lib/utils';
import { useProductivityData } from '../hooks/useProductivityData';
import { DayPlanner } from '../components/DayPlanner';
import { AddTaskModal } from '../components/AddTaskModal';
import { getTasksForDate, parseTaskMetadata } from '../lib/dataManager';
import type { Task } from '../lib/dataManager';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function CalendarPage() {
  const [view, setView] = useState<'day' | 'month' | 'year'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set(['ALL']));
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [moreTasksDate, setMoreTasksDate] = useState<Date | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const hook = useProductivityData(currentDate.getFullYear());
  const { data, loading } = hook;

  const handlePrev = () => {
    if (view === 'year') setCurrentDate(prev => subYears(prev, 1));
    else if (view === 'month') setCurrentDate(prev => startOfMonth(subMonths(prev, 1)));
    else if (view === 'day') {
      const prevDay = subDays(selectedDate, 1);
      setCurrentDate(prevDay);
      setSelectedDate(prevDay);
    }
  };
  
  const handleNext = () => {
    if (view === 'year') setCurrentDate(prev => addYears(prev, 1));
    else if (view === 'month') setCurrentDate(prev => startOfMonth(addMonths(prev, 1)));
    else if (view === 'day') {
      const nextDay = addDays(selectedDate, 1);
      setCurrentDate(nextDay);
      setSelectedDate(nextDay);
    }
  };

  const handleSetToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // Build task list
  const allTasks = useMemo(() => {
    if (!data) return [];
    const tasksMap = new Map();
    data.recurringTasks.forEach(t => tasksMap.set(t.id, t));
    Object.values(data.days).forEach(day => {
      day.tasks.forEach(t => tasksMap.set(t.id, t));
    });
    return Array.from(tasksMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (taskId === 'ALL') {
        next.clear();
        next.add('ALL');
      } else {
        next.delete('ALL');
        if (next.has(taskId)) {
          next.delete(taskId);
          if (next.size === 0) next.add('ALL');
        } else {
          next.add(taskId);
        }
      }
      return next;
    });
  };

  const renderMiniCalendar = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="text-sm font-bold text-textMain tracking-wide">{format(currentDate, 'MMMM yyyy')}</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentDate(startOfMonth(subMonths(currentDate, 1)))} className="text-textMuted hover:text-textMain"><ChevronLeft size={16}/></button>
            <button onClick={() => setCurrentDate(startOfMonth(addMonths(currentDate, 1)))} className="text-textMuted hover:text-textMain"><ChevronRight size={16}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 mb-2">
          {weekDays.map((d, i) => <div key={i} className="text-center text-[10px] font-bold text-textMuted">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {days.map(day => {
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelected = isSameDay(day, selectedDate);
            const isDayToday = isToday(day);
            return (
              <button
                key={day.toISOString()}
                onClick={() => {
                  setSelectedDate(day);
                  setCurrentDate(day);
                }}
                className={cn(
                  "h-7 w-7 rounded-full mx-auto flex items-center justify-center text-xs transition-colors",
                  !isCurrentMonth && "opacity-30",
                  isSelected && "bg-accent text-background font-bold",
                  isDayToday && !isSelected && "bg-surface text-accent font-bold ring-1 ring-inset ring-accent/30",
                  !isSelected && !isDayToday && "hover:bg-surface text-textMain"
                )}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMonthGrid = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <div className="flex flex-col h-full bg-background">
        <div className="grid grid-cols-7 border-b border-border/40 shrink-0">
          {weekDays.map(day => (
            <div key={day} className="py-2 text-center text-[11px] font-semibold text-textMuted uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>
        <div 
          className="flex-1 grid grid-cols-7 gap-px bg-border/40 overflow-y-auto"
          style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(100px, 1fr))` }}
        >
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayTasks = data ? getTasksForDate(data, dateStr) : [];
            const dayCompletions = data?.days[dateStr]?.completedTaskIds || [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelected = isSameDay(day, selectedDate);
            const isDayToday = isToday(day);
            
            // Filter tasks for chips based on selected left-panel filter
            const filteredByPanel = dayTasks.filter(t => selectedTasks.has('ALL') || selectedTasks.has(t.id));
            const completedTasks = filteredByPanel.filter(t => dayCompletions.includes(t.id));

            return (
              <div
                key={dateStr}
                onClick={() => {
                  setSelectedDate(day);
                  setCurrentDate(day);
                  setView('day');
                }}
                className={cn(
                  "bg-background p-1.5 md:p-2 flex flex-col gap-1 cursor-pointer hover:bg-surface/30 transition-colors group relative min-h-0",
                  !isCurrentMonth && "opacity-60",
                  isSelected && "ring-1 ring-inset ring-accent z-10"
                )}
              >
                <div className="flex justify-start items-center mb-1 shrink-0">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                    isDayToday ? "bg-accent text-background font-bold" : "text-textMain",
                    !isCurrentMonth && !isDayToday && "text-textMuted"
                  )}>
                    {format(day, 'd')}
                  </div>
                </div>
                
                {/* Task Bars */}
                <div className="flex flex-col gap-[3px] overflow-hidden flex-1 mt-0">
                  {completedTasks.slice(0, 2).map(task => {
                    const meta = parseTaskMetadata(task);

                    return (
                      <div 
                        key={task.id} 
                        className="relative flex flex-col justify-center px-2 py-1 rounded-[4px] overflow-hidden transition-colors shrink-0 max-w-full text-left bg-surface/40 text-textMain hover:bg-surface/80"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTask(task);
                        }}
                      >
                        {/* Left accent stripe */}
                        <div className="absolute left-0 top-0 bottom-0 w-[2.5px] bg-accent/70" />

                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate text-[11px] font-medium leading-tight">
                            {task.name}
                          </span>
                        </div>
                        {meta.startTime && (
                          <span className="truncate text-[9.5px] text-textMuted leading-tight mt-[1px]">
                            {meta.startTime}{meta.endTime ? `–${meta.endTime}` : ''}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {completedTasks.length > 2 && (
                    <button 
                      className="text-[10px] md:text-[11px] text-textMuted font-medium px-1.5 py-0.5 hover:text-textMain hover:bg-surface/50 rounded-[4px] transition-colors shrink-0 max-w-full text-left truncate"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMoreTasksDate(day);
                      }}
                    >
                      +{completedTasks.length - 2} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderYearGrid = () => {
    // We'll keep the Year view compact and history-focused
    const months = eachMonthOfInterval({ start: startOfYear(currentDate), end: endOfYear(currentDate) });

    return (
      <div className="absolute inset-0 overflow-y-auto" ref={(el) => { if (el) el.scrollTop = 0; }}>
        <div className="w-full p-4 md:p-6 lg:p-8 animate-in fade-in duration-300 max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {months.map(monthDate => {
              const mStart = startOfMonth(monthDate);
              const mEnd = endOfMonth(monthDate);
              const mDays = eachDayOfInterval({ start: startOfWeek(mStart), end: endOfWeek(mEnd) });

              return (
                <button
                  key={monthDate.toString()}
                  className="flex flex-col group cursor-pointer text-left bg-surface/20 p-3 md:p-4 rounded-xl border border-border/40 hover:border-border/80 transition-colors"
                  onClick={() => {
                    setCurrentDate(monthDate);
                    setView('month');
                  }}
                >
                  <h3 className="text-[10px] md:text-xs font-bold tracking-[0.2em] text-textMain uppercase mb-3">
                    {format(monthDate, 'MMMM')}
                  </h3>
                  <div className="grid grid-cols-7 gap-0.5 w-full">
                    {mDays.map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const dayCompletions = data?.days[dateStr]?.completedTaskIds || [];
                      const isCurrentMonth = isSameMonth(day, monthDate);
                      
                      let bg = 'bg-transparent';
                      if (isCurrentMonth) {
                        bg = 'bg-border/30';
                        if (dayCompletions.length > 0) {
                          bg = 'bg-accent/40';
                          if (dayCompletions.length > 2) bg = 'bg-accent/70';
                          if (dayCompletions.length > 4) bg = 'bg-accent';
                        }
                      }

                      return (
                        <div
                          key={dateStr}
                          className={cn(
                            "aspect-square rounded-[2px]",
                            bg,
                            isCurrentMonth && bg === 'bg-border/30' && "group-hover:bg-border/60 transition-colors"
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
      </div>
    );
  };

  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 h-[calc(100dvh-56px-60px)] md:h-[100dvh] flex flex-col md:flex-row bg-background">
      
              {/* MOBILE FILTER BUTTON & DRAWER */}
        {isFilterOpen && (
          <div className="md:hidden fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border/40 shrink-0 pt-[calc(16px+env(safe-area-inset-top))]">
              <h2 className="text-sm font-bold tracking-widest uppercase text-textMain">Calendar Filters</h2>
              <button onClick={() => setIsFilterOpen(false)} className="p-2 bg-surface/50 rounded-full text-textMuted hover:text-textMain transition-colors"><X size={18} /></button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-6 pb-[env(safe-area-inset-bottom)]">
              {/* Search */}
              <div className="relative shrink-0">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                <input 
                  type="text" 
                  placeholder="Search tasks..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-surface border border-border/60 rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-accent text-textMain shadow-sm"
                />
              </div>

              {/* Task Filters */}
              <div className="flex-1 min-h-0 flex flex-col">
                <h3 className="text-xs font-bold text-textMain mb-3 px-1 uppercase tracking-wider">My Tasks</h3>
                <div className="flex-1 overflow-y-auto pr-2 space-y-1">
                  <button
                    onClick={() => toggleTaskSelection('ALL')}
                    className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-surface text-left transition-colors group"
                  >
                    <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", selectedTasks.has('ALL') ? "bg-accent border-accent" : "border-border group-hover:border-textMuted")}>
                      {selectedTasks.has('ALL') && <Check size={12} className="text-background" />}
                    </div>
                    <span className="text-sm font-medium text-textMain truncate">All Tasks</span>
                  </button>
                  {allTasks.map(task => (
                    <button
                      key={task.id}
                      onClick={() => toggleTaskSelection(task.id)}
                      className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-surface text-left transition-colors group"
                    >
                      <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", selectedTasks.has(task.id) && !selectedTasks.has('ALL') ? "bg-accent border-accent" : "border-border group-hover:border-textMuted")}>
                        {selectedTasks.has(task.id) && !selectedTasks.has('ALL') && <Check size={12} className="text-background" />}
                      </div>
                      <span className="text-sm text-textMuted truncate">{task.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DESKTOP LEFT PANEL */}
        <div className="hidden md:flex flex-col w-[260px] flex-shrink-0 border-r border-border/40 p-6 gap-6 overflow-y-auto bg-surface/10">
          <h1 className="text-2xl font-black text-textMain tracking-tight">CALENDAR</h1>
          
          {/* Search */}
          <div className="relative shrink-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <input 
              type="text" 
              placeholder="Search tasks..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-border/60 rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-accent text-textMain shadow-sm"
            />
          </div>

          {/* Mini Calendar */}
          <div className="shrink-0">
            {renderMiniCalendar()}
          </div>

          {/* Task Filters / My Calendars */}
          <div className="flex-1 flex flex-col min-h-0">
            <h3 className="text-xs font-bold text-textMain mb-3 px-1 uppercase tracking-wider">My Tasks</h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-1 scrollbar-thin">
              <button
                onClick={() => toggleTaskSelection('ALL')}
                className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-surface text-left transition-colors group"
              >
                <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", selectedTasks.has('ALL') ? "bg-accent border-accent" : "border-border group-hover:border-textMuted")}>
                  {selectedTasks.has('ALL') && <Check size={12} className="text-background" />}
                </div>
                <span className="text-sm font-medium text-textMain truncate">All Tasks</span>
              </button>
              {allTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => toggleTaskSelection(task.id)}
                  className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-surface text-left transition-colors group"
                >
                  <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", selectedTasks.has(task.id) && !selectedTasks.has('ALL') ? "bg-accent border-accent" : "border-border group-hover:border-textMuted")}>
                    {selectedTasks.has(task.id) && !selectedTasks.has('ALL') && <Check size={12} className="text-background" />}
                  </div>
                  <span className="text-sm text-textMuted truncate">{task.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Add Task Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="w-full bg-accent text-background hover:bg-accent/90 transition-colors py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md shrink-0"
          >
            <Plus size={16} />
            Add Task
          </button>
        </div>
{/* MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative h-full overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-50 bg-background/50 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        )}
        
        {/* TOOLBAR */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 md:p-4 border-b border-border/40 shrink-0 gap-4 sm:gap-0">
          <div className="flex items-center gap-3 md:gap-6 w-full sm:w-auto justify-between sm:justify-start">
            <h2 className="text-lg md:text-xl font-bold text-textMain min-w-[120px] md:min-w-[160px]">
              {view === 'day' 
                ? format(selectedDate, 'MMM d, yyyy') 
                : false 
                  ? `${format(startOfWeek(currentDate), 'MMM d')} - ${format(endOfWeek(currentDate), 'MMM d, yyyy')}` 
                  : view === 'year'
                    ? format(currentDate, 'yyyy')
                    : format(currentDate, 'MMMM yyyy')}
            </h2>
            <div className="flex items-center gap-1 md:gap-2">`n                <button onClick={() => setIsFilterOpen(true)} className="md:hidden p-1.5 rounded-md border border-border/60 hover:bg-surface transition-all text-textMain"><Filter size={18}/></button>
              <button onClick={handleSetToday} className="px-3 py-1.5 text-xs font-bold border border-border/60 rounded-md hover:bg-surface transition-colors hidden md:block uppercase tracking-wider">
                Today
              </button>
              <div className="flex items-center gap-1">
                <button onClick={handlePrev} className="p-1.5 rounded-md border border-transparent hover:border-border/60 hover:bg-surface transition-all"><ChevronLeft size={18}/></button>
                <button onClick={handleNext} className="p-1.5 rounded-md border border-transparent hover:border-border/60 hover:bg-surface transition-all"><ChevronRight size={18}/></button>
              </div>
            </div>
          </div>
          
          <div className="relative flex w-full sm:w-auto bg-surface/30 p-[3px] rounded-[10px] border border-border/40" role="tablist">
            {['day', 'month', 'year'].map(v => {
              const isActive = view === v;
              return (
                <button
                  key={v}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setView(v as any)}
                  className={cn(
                    "relative px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-[7px] transition-colors z-10 min-w-[70px] flex-1 sm:flex-none text-center outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    isActive ? "text-textMain" : "text-textMuted hover:text-textMain/80"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="calendarViewIndicator"
                      className="absolute inset-0 bg-surface/80 border border-border/40 rounded-[7px] shadow-sm"
                      initial={false}
                      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                      style={{ zIndex: -1 }}
                    />
                  )}
                  {v}
                </button>
              );
            })}
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {view === 'month' && (
              <motion.div
                key="month"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: "easeIn" } }}
                className="absolute inset-0"
              >
                {renderMonthGrid()}
              </motion.div>
            )}
            {view === 'day' && data && (
              <motion.div
                key="day"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: "easeIn" } }}
                className="absolute inset-0 overflow-y-auto px-4 md:px-8 pt-4"
              >
                 <DayPlanner 
                    date={selectedDate}
                    data={data}
                    selectedTaskId={selectedTasks.has('ALL') ? 'ALL' : Array.from(selectedTasks)[0]}
                    onClose={() => setView('month')}
                    onChangeDate={d => { setSelectedDate(d); setCurrentDate(d); }}
                    hook={hook}
                 />
              </motion.div>
            )}
            {view === 'year' && (
              <motion.div
                key="year"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: "easeIn" } }}
                className="absolute inset-0"
              >
                {renderYearGrid()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {(isAddModalOpen || editingTask) && (
        <AddTaskModal
          date={format(selectedDate, 'yyyy-MM-dd')}
          initialTask={editingTask || undefined}
          onClose={() => { setIsAddModalOpen(false); setEditingTask(null); }}
          onAdd={async (t) => { await hook.addTask(t); setIsAddModalOpen(false); }}
          onEdit={async (t, updateType) => {
             if (updateType === 'single') {
               await hook.skipTask(t.id, format(selectedDate, 'yyyy-MM-dd'), true);
               await hook.addTask({ ...t, recurring: 'none', createdAt: format(selectedDate, 'yyyy-MM-dd') });
             } else {
               await hook.updateTask(t);
             }
             setEditingTask(null);
          }}
        />
      )}

      {/* More Tasks Popover */}
      {moreTasksDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setMoreTasksDate(null)}>
          <div className="bg-surface border border-border/60 rounded-2xl p-4 md:p-6 w-full max-w-sm shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] tracking-widest font-bold text-textMuted uppercase">{format(moreTasksDate, 'EEEE · MMMM d')}</h3>
              <button onClick={() => setMoreTasksDate(null)} className="text-textMuted hover:text-textMain p-1"><Icons.X size={16} /></button>
            </div>
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-2">
              {(() => {
                const dayTasks = data ? getTasksForDate(data, format(moreTasksDate, 'yyyy-MM-dd')) : [];
                const filteredByPanel = dayTasks.filter(t => selectedTasks.has('ALL') || selectedTasks.has(t.id));
                const dayCompletions = data?.days[format(moreTasksDate, 'yyyy-MM-dd')]?.completedTaskIds || [];
                const completedTasks = filteredByPanel.filter(t => dayCompletions.includes(t.id));

                return completedTasks.map(task => {
                  const meta = parseTaskMetadata(task);

                  return (
                    <button
                      key={task.id}
                      onClick={() => {
                        setEditingTask(task);
                        setMoreTasksDate(null);
                      }}
                      className="relative flex flex-col justify-center px-3 py-2 rounded-lg overflow-hidden transition-colors shrink-0 w-full text-left bg-surface/40 text-textMain border border-border/40 hover:bg-surface/80 hover:border-border/60"
                    >
                      {/* Left accent stripe */}
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent/70" />

                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate text-sm font-medium leading-tight">
                          {task.name}
                        </span>
                      </div>
                      {meta.startTime && (
                        <span className="truncate text-xs text-textMuted leading-tight mt-1">
                          {meta.startTime}{meta.endTime ? `–${meta.endTime}` : ''}
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
            <button
              onClick={() => {
                setSelectedDate(moreTasksDate);
                setView('day');
                setMoreTasksDate(null);
              }}
              className="mt-2 w-full py-2.5 rounded-xl border border-border/60 text-sm font-bold text-textMain hover:bg-surface transition-colors"
            >
              Open Day Planner
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



