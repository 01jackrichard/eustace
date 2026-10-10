import { useState, useMemo, useEffect, useRef } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, ArrowLeft, Check, Plus, MoreVertical, Edit2, Trash2, CheckCircle2, Circle, Activity, BookOpen, Coffee, Moon, Code, Briefcase, Zap, Heart } from 'lucide-react';
import { cn } from '../lib/utils';
import type { AppData, Task } from '../lib/dataManager';
import { getTasksForDate, parseTaskMetadata } from '../lib/dataManager';
import { calculateTaskGeometry } from '../lib/timeUtils';
import { AddTaskModal } from './AddTaskModal';

interface DayPlannerProps {
  date: Date;
  data: AppData;
  selectedTaskId: string;
  onClose: () => void;
  onChangeDate: (date: Date) => void;
  hook: any;
}

import * as Icons from 'lucide-react';

// Heuristic to pick an icon based on task title
function getTaskIconAndColor(task: Task, isCompleted: boolean) {
  const meta = parseTaskMetadata(task);
  const t = task.name.toLowerCase();
  
  let Icon: any = Circle;
  let color = "text-textMuted";
  let bg = "bg-surface";
  let border = "border-border/60";

  if (meta.icon && (Icons as any)[meta.icon]) {
    Icon = (Icons as any)[meta.icon];
    color = "text-accent"; // Selected custom icon gets accent color by default
    bg = "bg-accent/10";
    border = "border-accent/20";
  } else if (t.includes('workout') || t.includes('gym') || t.includes('exercise') || t.includes('run') || t.includes('swim')) {
    Icon = Activity; color = "text-orange-400"; bg = "bg-orange-500/10"; border = "border-orange-500/20";
  } else if (t.includes('study') || t.includes('read') || t.includes('learn') || t.includes('french')) {
    Icon = BookOpen; color = "text-blue-400"; bg = "bg-blue-500/10"; border = "border-blue-500/20";
  } else if (t.includes('code') || t.includes('dsa') || t.includes('dev') || t.includes('program')) {
    Icon = Code; color = "text-cyan-400"; bg = "bg-cyan-500/10"; border = "border-cyan-500/20";
  } else if (t.includes('food') || t.includes('breakfast') || t.includes('lunch') || t.includes('dinner') || t.includes('coffee')) {
    Icon = Coffee; color = "text-amber-400"; bg = "bg-amber-500/10"; border = "border-amber-500/20";
  } else if (t.includes('sleep') || t.includes('rest') || t.includes('nap')) {
    Icon = Moon; color = "text-indigo-400"; bg = "bg-indigo-500/10"; border = "border-indigo-500/20";
  } else if (t.includes('work') || t.includes('meeting') || t.includes('call')) {
    Icon = Briefcase; color = "text-emerald-400"; bg = "bg-emerald-500/10"; border = "border-emerald-500/20";
  } else if (t.includes('health') || t.includes('meditate') || t.includes('care')) {
    Icon = Heart; color = "text-rose-400"; bg = "bg-rose-500/10"; border = "border-rose-500/20";
  } else {
    Icon = Zap; color = "text-textMuted"; bg = "bg-surface"; border = "border-border/60";
  }

  if (isCompleted) {
    Icon = CheckCircle2;
    color = "text-textMuted";
    bg = "bg-surface/50";
    border = "border-border/40";
  }

  return { Icon, color, bg, border };
}

function formatTime(h: number, m: number) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  const min = m.toString().padStart(2, '0');
  return `${hr.toString().padStart(2, '0')}:${min} ${ampm}`;
}

export function DayPlanner({ date, data, selectedTaskId, onClose, onChangeDate, hook }: DayPlannerProps) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const isCurrentDay = dateStr === format(new Date(), 'yyyy-MM-dd');
  const allDayTasks = getTasksForDate(data, dateStr);
  const completedIds = useMemo(() => new Set(data.days[dateStr]?.completedTaskIds || []), [data, dateStr]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Group and sort tasks
  const { timedTasks, untimedTasks } = useMemo(() => {
    const timed: Array<{task: Task, startH: number, startM: number, endH: number, endM: number, start: number, end: number}> = [];
    const untimed: Task[] = [];

    allDayTasks.forEach(task => {
      const meta = parseTaskMetadata(task);
      const geom = calculateTaskGeometry(meta.startTime, meta.endTime);
      if (geom) {
        timed.push({ 
          task, 
          startH: geom.startH, 
          startM: geom.startM, 
          endH: geom.endH, 
          endM: geom.endM, 
          start: geom.startDecimal, 
          end: geom.endDecimal 
        });
      } else {
        untimed.push(task);
      }
    });

    // Sort timed tasks strictly chronologically
    timed.sort((a, b) => a.start - b.start || a.end - b.end);

    return { timedTasks: timed, untimedTasks: untimed };
  }, [allDayTasks]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background relative animate-in fade-in duration-300">
      
      {/* HEADER */}
      <div className="shrink-0 p-4 md:p-6 border-b border-border/40 flex flex-col gap-4 sticky top-0 bg-background/95 backdrop-blur-xl z-30">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase hover:text-textMain transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          Month
        </button>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-accent uppercase mb-1">
              Day Planner
            </div>
            <div className="text-xl md:text-2xl font-black text-textMain tracking-tight uppercase flex items-center gap-3">
              {format(date, 'EEEE')}
              <span className="text-textMuted/40 font-normal">|</span>
              <span className="text-textMuted font-bold">{format(date, 'MMM d, yyyy')}</span>
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

      {/* TIMELINE CONTENT */}
      <div className="flex-1 overflow-y-auto min-h-[500px] relative scroll-smooth p-4 md:p-8" ref={scrollRef}>
        <div className="max-w-3xl mx-auto w-full relative">
          
          {/* SCHEDULED TIMELINE */}
          {timedTasks.length > 0 ? (
            <div className="relative flex flex-col gap-6 md:gap-8 mb-12">
              
              {/* THE VERTICAL RAIL */}
              <div className="absolute top-4 bottom-4 left-[4.5rem] md:left-[5.5rem] w-px bg-border/40 z-0"></div>

              {timedTasks.map(({ task, startH, startM, endH, endM }) => {
                const isCompleted = completedIds.has(task.id);
                const isSelectedFilter = selectedTaskId !== 'ALL' && task.id === selectedTaskId;
                const { Icon, color, bg, border } = getTaskIconAndColor(task, isCompleted);
                
                return (
                  <div key={task.id} className="relative flex items-start gap-4 md:gap-6 w-full z-10 group">
                    
                    {/* Time Label */}
                    <div className="w-[4rem] md:w-[5rem] shrink-0 text-right pt-[14px]">
                      <span className={cn(
                        "text-[10px] md:text-[11px] font-bold tracking-widest",
                        isCompleted ? "text-textMuted/50" : "text-textMuted"
                      )}>
                        {formatTime(startH, startM)}
                      </span>
                    </div>

                    {/* Circular Marker */}
                    <div className="shrink-0 relative pt-[8px]">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center relative z-10 border transition-colors duration-300",
                        bg, border
                      )}>
                        <Icon size={14} className={color} strokeWidth={2.5} />
                      </div>
                    </div>

                    {/* Task Card */}
                    <div 
                      className={cn(
                        "flex-1 min-w-0 bg-surface/30 border rounded-2xl p-4 md:p-5 transition-all duration-300 relative",
                        isCompleted ? "border-border/30 opacity-70" : "border-border/60 shadow-sm hover:border-textMuted/40",
                        isSelectedFilter && "ring-1 ring-accent border-transparent"
                      )}
                    >
                      {/* Action Menu Toggle */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === task.id ? null : task.id); }}
                        className="absolute top-3 right-3 p-1.5 text-textMuted hover:text-textMain hover:bg-surface rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {/* Action Menu Dropdown */}
                      {activeMenuId === task.id && (
                        <div className="absolute top-10 right-3 w-40 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                          <button
                            onClick={(e) => { e.stopPropagation(); isCurrentDay && hook.toggleTaskCompletion(task.id, dateStr); setActiveMenuId(null); }} disabled={!isCurrentDay} title={!isCurrentDay ? 'Tasks can only be completed on their scheduled date.' : ''}
                            className={cn("w-full text-left px-4 py-2.5 text-sm font-medium text-textMain hover:bg-white/5 flex items-center gap-2", !isCurrentDay && "opacity-50 cursor-not-allowed")}
                          >
                            <Check size={14} className="text-accent" /> {isCompleted ? 'Mark Undone' : 'Mark Done'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingTask(task); setActiveMenuId(null); }}
                            className={cn("w-full text-left px-4 py-2.5 text-sm font-medium text-textMain hover:bg-white/5 flex items-center gap-2", !isCurrentDay && "opacity-50 cursor-not-allowed")}
                          >
                            <Edit2 size={14} className="text-textMuted" /> Edit Task
                          </button>
                          <div className="h-px bg-border/60 mx-2" />
                          <button
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (window.confirm('Delete this task?')) {
                                hook.deleteTask(task.id); 
                              }
                              setActiveMenuId(null); 
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}

                      <div className="pr-8">
                        <h3 className={cn(
                          "text-base md:text-lg font-bold leading-tight mb-1 tracking-wide",
                          isCompleted ? "text-textMuted line-through" : "text-textMain"
                        )}>
                          {task.name}
                        </h3>
                        <div className="text-[11px] font-bold tracking-widest text-textMuted/70 uppercase">
                          {formatTime(startH, startM)} — {formatTime(endH, endM)}
                        </div>
                        {task.metadata?.notes && (
                          <div className="mt-3 text-sm text-textMuted whitespace-pre-wrap leading-relaxed border-l-2 border-border/40 pl-3">
                            {task.metadata.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center opacity-60">
               <div className="w-12 h-12 rounded-full border border-dashed border-border flex items-center justify-center text-textMuted mb-4">
                 <Moon size={20} />
               </div>
               <span className="text-xs font-bold tracking-widest text-textMuted uppercase">No Scheduled Events</span>
            </div>
          )}

          {/* ANYTIME TASKS */}
          <div className="mt-12 mb-24">
            <div className="flex items-center gap-4 mb-6">
              <div className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase">
                Anytime
              </div>
              <div className="flex-1 h-px bg-border/40" />
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="hover:text-textMain text-textMuted transition-colors flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase"
              >
                <Plus size={12} /> Add
              </button>
            </div>

            {untimedTasks.length > 0 ? (
              <div className="flex flex-col gap-3 ml-[4.5rem] md:ml-[5.5rem] pl-4 md:pl-6 border-l border-border/40">
                {untimedTasks.map(task => {
                  const isCompleted = completedIds.has(task.id);
                  const isSelectedFilter = selectedTaskId !== 'ALL' && task.id === selectedTaskId;

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "rounded-xl border p-3 md:p-4 flex items-start gap-3 md:gap-4 transition-all relative group",
                        isCompleted ? "bg-surface/30 border-border/30 opacity-70" : "bg-surface/50 border-border/60 hover:border-textMuted/40 shadow-sm",
                        isSelectedFilter && "ring-1 ring-accent border-transparent"
                      )}
                    >
                      <button
                        className={cn(
                          "mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-all",
                          isCompleted
                            ? "bg-accent border-accent text-background"
                            : "border-textMuted/50 hover:border-textMain"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          hook.toggleTaskCompletion(task.id, dateStr);
                        }}
                      >
                        {isCompleted && <Check size={12} strokeWidth={4} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={cn(
                          "text-sm font-bold truncate tracking-wide",
                          isCompleted ? "text-textMuted line-through" : "text-textMain"
                        )}>
                          {task.name}
                        </div>
                        {task.metadata?.notes && (
                          <div className="mt-2 text-xs text-textMuted whitespace-pre-wrap leading-relaxed line-clamp-2">
                            {task.metadata.notes}
                          </div>
                        )}
                      </div>

                      {/* Action Menu Toggle */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === task.id ? null : task.id); }}
                        className="p-1 text-textMuted hover:text-textMain hover:bg-surface rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {/* Action Menu Dropdown */}
                      {activeMenuId === task.id && (
                        <div className="absolute top-10 right-3 w-40 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                          <button
                            onClick={(e) => { e.stopPropagation(); isCurrentDay && hook.toggleTaskCompletion(task.id, dateStr); setActiveMenuId(null); }} disabled={!isCurrentDay} title={!isCurrentDay ? 'Tasks can only be completed on their scheduled date.' : ''}
                            className={cn("w-full text-left px-4 py-2.5 text-sm font-medium text-textMain hover:bg-white/5 flex items-center gap-2", !isCurrentDay && "opacity-50 cursor-not-allowed")}
                          >
                            <Check size={14} className="text-accent" /> {isCompleted ? 'Mark Undone' : 'Mark Done'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingTask(task); setActiveMenuId(null); }}
                            className={cn("w-full text-left px-4 py-2.5 text-sm font-medium text-textMain hover:bg-white/5 flex items-center gap-2", !isCurrentDay && "opacity-50 cursor-not-allowed")}
                          >
                            <Edit2 size={14} className="text-textMuted" /> Edit Task
                          </button>
                          <div className="h-px bg-border/60 mx-2" />
                          <button
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (window.confirm('Delete this task?')) {
                                hook.deleteTask(task.id); 
                              }
                              setActiveMenuId(null); 
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 px-4 rounded-xl border border-dashed border-border/60 flex items-center justify-center">
                <span className="text-xs font-bold tracking-widest text-textMuted uppercase text-center">
                  No anytime tasks
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {(isAddModalOpen || editingTask) && (
        <AddTaskModal
          date={dateStr}
          initialTask={editingTask || undefined}
          onClose={() => { setIsAddModalOpen(false); setEditingTask(null); }}
          onAdd={async (t) => { await hook.addTask(t); setIsAddModalOpen(false); }}
          onEdit={async (t, updateType) => {
             if (updateType === 'single') {
               await hook.skipTask(t.id, dateStr, true);
               await hook.addTask({ ...t, recurring: 'none', createdAt: dateStr });
             } else {
               await hook.updateTask(t);
             }
             setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}
