import { useState, useMemo, useEffect, useRef } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, ArrowLeft, Check, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import type { AppData, Task } from '../lib/dataManager';
import { getTasksForDate, parseTaskMetadata } from '../lib/dataManager';
import { AddTaskModal } from './AddTaskModal';

interface DayPlannerProps {
  date: Date;
  data: AppData;
  selectedTaskId: string;
  onClose: () => void;
  onChangeDate: (date: Date) => void;
  hook: any;
}

const HOUR_HEIGHT = 80; // 80px per hour

export function DayPlanner({ date, data, selectedTaskId, onClose, onChangeDate, hook }: DayPlannerProps) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const allDayTasks = getTasksForDate(data, dateStr);
  const completedIds = useMemo(() => new Set(data.days[dateStr]?.completedTaskIds || []), [data, dateStr]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | undefined>(undefined);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Group tasks
  const { timedTasks, untimedTasks } = useMemo(() => {
    const timed: Array<{task: Task, startH: number, startM: number, endH: number, endM: number}> = [];
    const untimed: Task[] = [];

    allDayTasks.forEach(task => {
      const meta = parseTaskMetadata(task);
      if (meta.startTime) {
        const [sh, sm] = meta.startTime.split(':').map(Number);
        let eh = sh + 1;
        let em = sm;
        if (meta.endTime) {
          const [parsedEh, parsedEm] = meta.endTime.split(':').map(Number);
          eh = parsedEh;
          em = parsedEm;
        }
        timed.push({ task, startH: sh, startM: sm, endH: eh, endM: em });
      } else {
        untimed.push(task);
      }
    });

    return { timedTasks: timed, untimedTasks: untimed };
  }, [allDayTasks]);

  // Auto-scroll to nearest task or current time
  useEffect(() => {
    if (scrollRef.current) {
      const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
      let targetHour = 8; // Default 8 AM

      if (isToday) {
        targetHour = new Date().getHours();
      } else if (timedTasks.length > 0) {
        targetHour = Math.min(...timedTasks.map(t => t.startH));
      }

      // Scroll to target hour minus a bit of padding
      scrollRef.current.scrollTop = Math.max(0, (targetHour - 1) * HOUR_HEIGHT);
    }
  }, [dateStr, timedTasks]);

  const handleTimeSlotClick = (hour: number, e: React.MouseEvent) => {
    // Only trigger if clicking on the empty background, not a task
    if ((e.target as HTMLElement).closest('.task-block')) return;

    const timeStr = `${hour.toString().padStart(2, '0')}:00`;
    setSelectedTimeSlot(timeStr);
    setIsAddModalOpen(true);
  };

  const handleEditTask = async (updatedTask: Task, updateType?: 'single' | 'future' | 'all') => {
    if (updateType === 'single') {
      await hook.skipTask(updatedTask.id, dateStr, true);
      const singleTask = { ...updatedTask, recurring: 'none' as const, createdAt: dateStr };
      await hook.addTask(singleTask);
    } else {
      await hook.updateTask(updatedTask);
    }
    setEditingTask(null);
  };

  const formatAmPm = (hour: number) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  };

  return (
    <div className="flex flex-col h-full bg-background md:bg-transparent">
      {/* HEADER */}
      <div className="flex flex-col gap-4 mb-6 sticky top-0 bg-background md:bg-transparent z-20 pb-4 border-b border-border/40">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase hover:text-textMain transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          Back to Month
        </button>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase mb-1">
              {format(date, 'EEEE')}
            </div>
            <div className="text-2xl md:text-3xl font-black text-textMain tracking-tight uppercase">
              {format(date, 'MMMM d, yyyy')}
            </div>
          </div>

          <div className="flex items-center gap-1 bg-surface px-1 py-1 rounded-xl border border-border/60 shadow-sm">
            <button onClick={() => onChangeDate(subDays(date, 1))} className="p-2 text-textMuted hover:text-textMain hover:bg-white/5 transition-colors rounded-lg">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => onChangeDate(addDays(date, 1))} className="p-2 text-textMuted hover:text-textMain hover:bg-white/5 transition-colors rounded-lg">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* PLANNER CONTENT */}
      <div className="flex-1 overflow-y-auto min-h-[500px] relative scroll-smooth pr-2" ref={scrollRef}>

        {/* TIME AXIS */}
        <div className="relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
          {/* Current Time Indicator */}
          {dateStr === format(new Date(), 'yyyy-MM-dd') && (
            <div
              className="absolute left-0 right-0 z-10 flex items-center gap-4 pointer-events-none"
              style={{ top: `${(new Date().getHours() + new Date().getMinutes() / 60) * HOUR_HEIGHT}px` }}
            >
              <div className="text-[10px] font-bold text-accent tracking-widest w-16 text-right">NOW</div>
              <div className="flex-1 h-px bg-accent/50 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
            </div>
          )}

          {/* Hour Lines */}
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 flex items-start gap-4 group cursor-pointer"
              style={{ top: `${i * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
              onClick={(e) => handleTimeSlotClick(i, e)}
            >
              <div className="text-[10px] font-bold tracking-widest text-textMuted w-16 text-right pt-2 select-none group-hover:text-textMain transition-colors">
                {formatAmPm(i)}
              </div>
              <div className="flex-1 border-t border-border/30 h-full group-hover:border-border/60 transition-colors relative" />
            </div>
          ))}

          {/* Task Blocks */}
          {timedTasks.map(({ task, startH, startM, endH, endM }) => {
            const isCompleted = completedIds.has(task.id);
            const isSelectedFilter = selectedTaskId !== 'ALL' && task.id === selectedTaskId;
            const top = (startH + startM / 60) * HOUR_HEIGHT;
            let height = ((endH + endM / 60) - (startH + startM / 60)) * HOUR_HEIGHT;
            if (height < 30) height = 30; // min height

            return (
              <div
                key={task.id}
                className={cn(
                  "task-block absolute left-24 right-4 md:right-8 rounded-xl border p-3 flex flex-col justify-start cursor-pointer hover:border-textMuted/60 transition-all overflow-hidden",
                  isCompleted
                    ? "bg-surface/80 border-border/60"
                    : "bg-surface border-border/40 shadow-sm",
                  isSelectedFilter && "ring-1 ring-accent border-transparent"
                )}
                style={{ top: `${top + 1}px`, height: `${height - 2}px` }}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTask(task);
                }}
              >
                <div className="flex items-start gap-3">
                  <button
                    className={cn(
                      "mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-all",
                      isCompleted
                        ? "bg-accent border-accent text-background"
                        : "border-textMuted/50 hover:border-textMain"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      hook.toggleTaskCompletion(task.id, dateStr);
                    }}
                  >
                    {isCompleted && <Check size={10} strokeWidth={4} />}
                  </button>
                  <div className="min-w-0">
                    <div className={cn(
                      "text-sm font-bold truncate tracking-wide",
                      isCompleted ? "text-textMuted line-through" : "text-textMain"
                    )}>
                      {task.name}
                    </div>
                    {height >= 60 && (
                      <div className="text-[10px] font-bold tracking-widest text-textMuted uppercase mt-1">
                        {startH.toString().padStart(2, '0')}:{startM.toString().padStart(2, '0')} - {endH.toString().padStart(2, '0')}:{endM.toString().padStart(2, '0')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* UNTIMED TASKS */}
        <div className="mt-12 mb-24 pl-24 pr-4 md:pr-8">
          <div className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase mb-4 flex items-center justify-between">
            <span>Anytime</span>
            <button
              onClick={() => { setSelectedTimeSlot(undefined); setIsAddModalOpen(true); }}
              className="hover:text-textMain transition-colors flex items-center gap-1"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          {untimedTasks.length > 0 ? (
            <div className="flex flex-col gap-2">
              {untimedTasks.map(task => {
                const isCompleted = completedIds.has(task.id);
                const isSelectedFilter = selectedTaskId !== 'ALL' && task.id === selectedTaskId;

                return (
                  <div
                    key={task.id}
                    className={cn(
                      "task-block rounded-xl border p-3 flex items-center gap-3 cursor-pointer hover:border-textMuted/60 transition-all",
                      isCompleted ? "bg-surface/50 border-border/30" : "bg-surface border-border/40",
                      isSelectedFilter && "ring-1 ring-accent border-transparent"
                    )}
                    onClick={() => setEditingTask(task)}
                  >
                    <button
                      className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-all",
                        isCompleted
                          ? "bg-accent border-accent text-background"
                          : "border-textMuted/50 hover:border-textMain"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        hook.toggleTaskCompletion(task.id, dateStr);
                      }}
                    >
                      {isCompleted && <Check size={10} strokeWidth={4} />}
                    </button>
                    <div className={cn(
                      "text-sm font-bold truncate tracking-wide",
                      isCompleted ? "text-textMuted line-through" : "text-textMain"
                    )}>
                      {task.name}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 px-4 rounded-xl border border-dashed border-border/60 flex items-center justify-center">
              <span className="text-xs font-bold tracking-widest text-textMuted uppercase text-center">
                No unscheduled tasks
              </span>
            </div>
          )}
        </div>
      </div>

      {(isAddModalOpen || editingTask) && (
        <AddTaskModal
          date={date}
          initialTask={editingTask || undefined}
          initialStartTime={selectedTimeSlot}
          onClose={() => { setIsAddModalOpen(false); setEditingTask(null); setSelectedTimeSlot(undefined); }}
          onAdd={(task) => { hook.addTask(task); setIsAddModalOpen(false); }}
          onEdit={handleEditTask}
        />
      )}
    </div>
  );
}
