import { useState } from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { Check, ChevronLeft, ChevronRight, Plus, MoreVertical, Trash2, Edit2, Repeat, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { getTasksForDate, getDayCompletionInfo, parseTaskMetadata, serializeTaskMetadata, type AppData, type Task } from '../lib/dataManager';
import { AddTaskModal } from './AddTaskModal';

interface DailyViewProps {
  date: Date;
  setDate: (date: Date) => void;
  data: AppData;
  hook?: any;
}

export function DailyView({ date, setDate, data, hook }: DailyViewProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const dateStr = format(date, 'yyyy-MM-dd');
  const tasks = getTasksForDate(data, dateStr);
  const info = getDayCompletionInfo(data, dateStr);
  const dayData = data.days[dateStr] || { tasks: [], completedTaskIds: [] };

  const handleDetailedAddTask = (taskData: Omit<Task, 'id'>) => {
    if (hook?.addTask) {
      hook.addTask({ ...taskData, createdAt: taskData.createdAt || dateStr });
      return;
    }
  };

  const handleEditTask = async (updatedTask: Task, updateType?: 'single' | 'future' | 'all') => {
    if (!hook?.updateTask) return;

    if (updateType === 'single') {
      // Create exception for today
      await hook.skipTask(updatedTask.id, dateStr, true);
      const singleTask = { ...updatedTask, recurring: 'none' as const, createdAt: dateStr };
      await hook.addTask(singleTask);
    } else if (updateType === 'future') {
      // End old series yesterday
      const oldTask = data.recurringTasks.find(t => t.id === updatedTask.id);
      if (oldTask) {
        const oldMeta = parseTaskMetadata(oldTask);
        const yesterdayStr = format(subDays(date, 1), 'yyyy-MM-dd');
        oldMeta.endDate = yesterdayStr;
        await hook.updateTask({ ...oldTask, description: serializeTaskMetadata(oldMeta), metadata: oldMeta });
      }

      // Start new series today
      const newMeta = parseTaskMetadata(updatedTask);
      newMeta.startDate = dateStr;
      const newTask = {
        ...updatedTask,
        createdAt: dateStr,
        description: serializeTaskMetadata(newMeta),
        metadata: newMeta
      };
      await hook.addTask(newTask);
    } else {
      await hook.updateTask(updatedTask);
    }
  };

  const toggleTask = (taskId: string) => {
    if (hook?.toggleTaskCompletion) {
      hook.toggleTaskCompletion(taskId, dateStr);
    }
  };

  const updateNote = (note: string) => {
    if (hook?.updateNote) hook.updateNote(dateStr, note);
  };

  const toggleManualCompletion = () => {
    if (hook?.toggleManualCompletion) {
      hook.toggleManualCompletion(dateStr);
    }
  };

  // Prevent closing menu if clicking inside it
  const closeMenu = () => setActiveMenuId(null);

  const isCurrentDay = isToday(date);

  return (
    <div className="flex flex-col w-full animate-fade-in" onClick={closeMenu}>

      {/* Editorial Date Navigation */}
      <div className="flex items-center justify-between pb-6 mb-8 border-b border-border/20">
        <button
          onClick={() => setDate(subDays(date, 1))}
          className="flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-textMuted hover:text-textMain transition-colors uppercase py-2 pr-4"
        >
          <ChevronLeft size={14} className="opacity-50" /> Previous
        </button>

        <div className="flex flex-col items-center cursor-pointer group" onClick={() => setDate(new Date())}>
          <span className={cn(
            "text-xs font-bold tracking-[0.25em] transition-colors uppercase",
            isCurrentDay ? "text-textMain" : "text-textMuted group-hover:text-textMain"
          )}>
            {format(date, 'MMMM d, yyyy')}
          </span>
          {!isCurrentDay && (
            <span className="text-[9px] font-black tracking-widest text-accent uppercase mt-1 opacity-0 group-hover:opacity-100 transition-opacity absolute translate-y-5">
              Return to Today
            </span>
          )}
        </div>

        <button
          onClick={() => setDate(addDays(date, 1))}
          className="flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-textMuted hover:text-textMain transition-colors uppercase py-2 pl-4"
        >
          Next <ChevronRight size={14} className="opacity-50" />
        </button>
      </div>

      {/* Daily Context Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
        <div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-textMain leading-[1.1]">
            {format(date, 'EEEE')}
          </h2>
          <h3 className="text-xl md:text-2xl font-medium tracking-tight text-textMuted mt-1">
            {format(date, 'MMMM d')}
          </h3>
        </div>

        {tasks.length > 0 && (
          <div className="flex flex-col md:items-end gap-2">
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="block text-2xl font-bold text-textMain leading-none">{tasks.length}</span>
                <span className="text-[10px] font-bold tracking-widest text-textMuted uppercase mt-1 block">Tasks</span>
              </div>
              <div className="w-px h-8 bg-border/40" />
              <div className="text-right">
                <span className="block text-2xl font-bold text-accent leading-none">{info.completedCount}</span>
                <span className="text-[10px] font-bold tracking-widest text-accent/70 uppercase mt-1 block">Completed</span>
              </div>
            </div>

            {/* Minimal Progress Bar */}
            <div className="w-full md:w-32 h-1 bg-border/30 rounded-full mt-2 overflow-hidden flex">
              <div
                className="h-full bg-accent transition-all duration-500 ease-out rounded-full"
                style={{ width: `${tasks.length > 0 ? (info.completedCount / tasks.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Task List */}
      <div className="flex flex-col gap-3 relative min-h-[300px]">
        {tasks.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <h4 className="text-lg font-bold text-textMain tracking-tight">NOTHING PLANNED.</h4>
            <p className="text-textMuted text-sm mt-2 mb-8">A quiet day is still a choice.</p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-6 py-3 bg-textMain text-background rounded-full text-xs font-bold tracking-widest uppercase hover:scale-105 active:scale-95 transition-all shadow-xl"
            >
              + Add Task
            </button>

            {/* Mark Day Complete (Streak Saver) */}
            <button
              onClick={toggleManualCompletion}
              className={cn(
                "mt-12 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all",
                dayData.manualCompletion
                  ? "text-accent bg-accent/10"
                  : "text-textMuted hover:text-textMain border border-transparent hover:border-border/40"
              )}
            >
              {dayData.manualCompletion ? <><CheckCircle2 size={14} /> Day Completed</> : "Mark Day as Complete"}
            </button>
          </div>
        ) : (
          <>
            {/* Header / Add Task */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase">Agenda</span>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.15em] text-textMain uppercase hover:text-accent transition-colors py-1"
              >
                <Plus size={14} /> Add Task
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {tasks.map(task => {
                const isCompleted = dayData.completedTaskIds.includes(task.id);
                const isSkipped = parseTaskMetadata(task).skippedDates?.includes(dateStr);
                const isRecurring = task.recurring !== 'none';
                const meta = parseTaskMetadata(task);

                return (
                  <div
                    key={task.id}
                    className={cn(
                      "group relative flex items-start gap-4 p-4 rounded-xl transition-all duration-300",
                      isCompleted ? "bg-transparent opacity-50" : "bg-surface/30 hover:bg-surface/80 border border-transparent hover:border-border/30"
                    )}
                  >
                    {/* Custom Checkbox */}
                    <button
                      onClick={() => !isSkipped && toggleTask(task.id)}
                      disabled={isSkipped}
                      className="mt-0.5 flex-shrink-0 outline-none"
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 border-2",
                        isSkipped ? "border-transparent bg-transparent" :
                        isCompleted ? "bg-accent border-accent text-background" : "bg-transparent border-textMuted/40 group-hover:border-accent/50"
                      )}>
                        <Check size={12} strokeWidth={isCompleted ? 4 : 3} className={cn(
                          "transition-all duration-300",
                          isCompleted ? "opacity-100 scale-100" : "opacity-0 scale-50"
                        )} />
                      </div>
                    </button>

                    <div className="flex-1 min-w-0 flex flex-col justify-center pt-0.5">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-base font-medium transition-all duration-300 truncate",
                          isCompleted ? "text-textMuted line-through" : "text-textMain",
                          isSkipped ? "text-textMuted/50" : ""
                        )}>
                          {task.name}
                        </span>
                        {isRecurring && (
                          <Repeat size={12} className={cn("flex-shrink-0", isCompleted ? "text-textMuted/40" : "text-accent/60")} />
                        )}
                      </div>

                      {(task.category || meta.notes) && (
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-textMuted/70 truncate">
                          {task.category && (
                            <span className="font-bold tracking-wider uppercase text-[9px] px-1.5 py-0.5 bg-border/20 rounded">
                              {task.category}
                            </span>
                          )}
                          {meta.notes && (
                            <span className="truncate">{meta.notes}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions Menu */}
                    <div className="relative ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === task.id ? null : task.id); }}
                        className="p-1.5 text-textMuted hover:text-textMain transition-colors rounded-md hover:bg-border/30"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {activeMenuId === task.id && (
                        <div className="absolute right-0 top-8 w-40 bg-surface border border-border/40 rounded-xl shadow-2xl py-1 z-20 animate-in fade-in zoom-in-95 duration-100">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingTask(task); setActiveMenuId(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-textMain hover:bg-border/30 transition-colors"
                          >
                            <Edit2 size={14} /> Edit Task
                          </button>

                          {hook?.skipTask && !isCompleted && !isSkipped && (
                            <button
                              onClick={(e) => { e.stopPropagation(); hook.skipTask(task.id, dateStr, isRecurring); setActiveMenuId(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-textMuted hover:bg-border/30 transition-colors"
                            >
                              <ChevronRight size={14} /> Skip Today
                            </button>
                          )}

                          <div className="h-px w-full bg-border/30 my-1" />

                          <button
                            onClick={(e) => { e.stopPropagation(); setTaskToDelete(task); setActiveMenuId(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Subordinate Daily Note */}
      {tasks.length > 0 && (
        <div className="mt-16 pt-8 border-t border-border/20">
          <h3 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-4">Daily Note</h3>
          <textarea
            value={dayData.note || ''}
            onChange={(e) => updateNote(e.target.value)}
            placeholder="Record your thoughts, reflections, or end-of-day summary..."
            className="w-full h-24 bg-transparent border border-transparent hover:border-border/30 focus:border-textMuted/40 rounded-xl p-4 text-sm text-textMain placeholder-textMuted/30 outline-none transition-all resize-none"
          />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-surface border border-border/40 rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold tracking-widest text-textMuted uppercase mb-2">Delete Task?</h3>
            <p className="text-textMain text-sm mb-6">
              This will remove this task permanently.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setTaskToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-textMuted hover:text-textMain transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (hook?.deleteTask) hook.deleteTask(taskToDelete.id, dateStr, taskToDelete.recurring !== 'none');
                  setTaskToDelete(null);
                }}
                className="px-5 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-sm font-bold tracking-wide transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {(isAddModalOpen || editingTask) && (
        <AddTaskModal
          date={date}
          initialTask={editingTask || undefined}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingTask(null);
          }}
          onAdd={(task) => {
            handleDetailedAddTask(task);
            setIsAddModalOpen(false);
          }}
          onEdit={(task, updateType) => {
            handleEditTask(task, updateType);
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}
