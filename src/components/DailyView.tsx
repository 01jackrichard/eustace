import { useState } from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { Check, ChevronLeft, ChevronRight, Plus, MoreVertical, Trash2, Copy, Repeat, Edit2, XCircle, Flag, AlignLeft } from 'lucide-react';
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
  const [newTaskName, setNewTaskName] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
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
      await hook.addTask({ ...updatedTask, createdAt: dateStr, description: serializeTaskMetadata(newMeta), metadata: newMeta });
    } else {
      // Normal update
      await hook.updateTask(updatedTask);
    }
  };

  const handleAddTask = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTaskName.trim()) return;

    if (hook?.addTask) {
      hook.addTask({ name: newTaskName.trim(), recurring: 'none', createdAt: dateStr });
      setNewTaskName('');
      return;
    }
  };

  const toggleTask = (taskId: string) => {
    if (hook?.toggleTaskCompletion) {
      hook.toggleTaskCompletion(taskId, dateStr);
      return;
    }
  };

  const skipTask = (taskId: string, isRecurring: boolean) => {
    if (hook?.skipTask) {
      hook.skipTask(taskId, dateStr, isRecurring);
      setActiveMenuId(null);
    }
  };

  const deleteTask = (taskId: string, isRecurring: boolean) => {
    if (hook?.deleteTask) {
      hook.deleteTask(taskId, dateStr, isRecurring);
      setActiveMenuId(null);
    }
  };

  const duplicateTask = (task: Task) => {
    if (hook?.addTask) {
      hook.addTask({
        name: `${task.name} (Copy)`,
        category: task.category,
        duration: task.duration,
        recurring: 'none',
        createdAt: dateStr
      });
      setActiveMenuId(null);
    }
  };

  const toggleManualCompletion = () => {
    if (hook?.toggleManualCompletion) {
      hook.toggleManualCompletion(dateStr);
      return;
    }
  };

  const updateNote = (note: string) => {
    if (hook?.updateNote) {
      hook.updateNote(dateStr, note);
      return;
    }
  };

  return (
    <div className="flex flex-col gap-5 w-full animate-fade-in">
      
      {/* Date Navigation */}
      <div className="flex items-center justify-between pb-2 border-b border-border/40">
        <button 
          onClick={() => setDate(subDays(date, 1))}
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-textMuted hover:text-textMain transition-colors px-2 py-1.5 -ml-2 rounded hover:bg-surface/50 uppercase"
        >
          <ChevronLeft size={14} /> Previous
        </button>
        
        <div className="flex flex-col items-center">
          {!isToday(date) && (
            <button 
              onClick={() => setDate(new Date())}
              className="text-[10px] font-bold tracking-widest text-accent hover:text-accentHover transition-colors uppercase mb-0.5"
            >
              TODAY
            </button>
          )}
          <h2 className="text-base font-bold text-textMain tracking-tight leading-tight">
            {format(date, 'MMMM d, yyyy')}
          </h2>
        </div>

        <button 
          onClick={() => setDate(addDays(date, 1))}
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-textMuted hover:text-textMain transition-colors px-2 py-1.5 -mr-2 rounded hover:bg-surface/50 uppercase"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        
        {/* Main Content Area */}
        <div className="bg-surface border border-border/60 rounded-2xl p-6 sm:p-8 shadow-sm">
          
          {/* Header Stats */}
          <div className="flex items-end justify-between gap-6 mb-6">
            <div>
              <h3 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-1">TODAY'S TASKS</h3>
              <p className="text-lg font-bold text-textMain tracking-tight leading-none">{format(date, 'EEEE, MMMM d')}</p>
            </div>
            
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <div className="text-[10px] font-bold tracking-wider text-textMuted uppercase">
                  {info.totalCount > 0 ? `${info.completedCount} / ${info.totalCount} tasks` : '0 / 0 tasks'}
                </div>
                <div className={cn("text-xs font-bold", info.completed ? "text-accent" : "text-textMain")}>
                  {info.percent}%
                </div>
              </div>
              <div className="w-32 h-1.5 bg-background rounded-full overflow-hidden border border-border/50">
                <div 
                  className={cn("h-full transition-all duration-500 ease-out", info.completed ? "bg-accent shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-textMuted/40")}
                  style={{ width: `${info.percent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Task List */}
          <div className="flex flex-col gap-1.5 mb-6">
            {tasks.map(task => {
              const meta = parseTaskMetadata(task);
              const isCompleted = dayData.completedTaskIds.includes(task.id);
              const isSkipped = (task.recurring !== 'none' && meta.skippedDates?.includes(dateStr)) || meta.status === 'skipped';
              
              let priorityColor = "";
              if (meta.priority === 'high') priorityColor = "text-red-500";
              else if (meta.priority === 'medium') priorityColor = "text-yellow-500";
              else if (meta.priority === 'low') priorityColor = "text-blue-500";
              
              return (
                <div 
                  key={task.id} 
                  className={cn(
                    "group flex flex-col px-3 py-2.5 rounded-lg border transition-all duration-200",
                    isCompleted ? "bg-background/50 border-border/30 opacity-60" : 
                    isSkipped ? "bg-background/30 border-dashed border-border/40 opacity-50" : 
                    "bg-background border-border/60 hover:border-textMuted/40 hover:-translate-y-[1px] hover:shadow-sm"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <button 
                      onClick={() => !isSkipped && toggleTask(task.id)}
                      disabled={isSkipped}
                      className={cn("flex items-center gap-3 flex-1 text-left", isSkipped && "cursor-not-allowed")}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-[4px] flex items-center justify-center border transition-all duration-200",
                        isSkipped ? "border-transparent bg-transparent" :
                        isCompleted ? "bg-accent border-accent text-background scale-95" : "bg-surface border-textMuted/40 text-transparent group-hover:border-textMain"
                      )}>
                        {isSkipped ? <XCircle size={14} className="text-textMuted" /> : <Check size={12} strokeWidth={3} className={isCompleted ? "opacity-100" : "opacity-0"} />}
                      </div>
                      <div className="flex flex-col">
                        <span className={cn(
                          "font-semibold transition-all text-sm tracking-tight leading-tight flex items-center gap-2",
                          isCompleted ? "line-through text-textMuted" : 
                          isSkipped ? "line-through text-textMuted/60" : "text-textMain"
                        )}>
                          {task.name}
                          {priorityColor && <Flag size={10} className={priorityColor} fill="currentColor" />}
                        </span>
                        {task.category && (
                          <span className="text-[9px] text-textMuted uppercase tracking-wider mt-0.5">{task.category}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-auto mr-1">
                        {meta.notes && <AlignLeft size={10} className="text-textMuted/50" />}
                        {task.recurring !== 'none' && (
                          <Repeat size={10} className="text-textMuted/70" />
                        )}
                        {task.duration && (
                          <span className="text-[10px] font-medium text-textMuted">
                            {task.duration}
                          </span>
                        )}
                      </div>
                    </button>

                    <div className="relative ml-2">
                      <button 
                        onClick={() => setActiveMenuId(activeMenuId === task.id ? null : task.id)}
                        className="p-1 text-textMuted hover:text-textMain rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      >
                        <MoreVertical size={14} />
                      </button>
                      
                      {activeMenuId === task.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActiveMenuId(null)} />
                          <div className="absolute right-0 top-full mt-1 w-36 bg-surface border border-border rounded-lg shadow-xl z-50 overflow-hidden py-1 animate-pop">
                            <button onClick={() => { setEditingTask(task); setActiveMenuId(null); }} className="w-full text-left px-3 py-1.5 text-xs font-medium text-textMuted hover:text-textMain hover:bg-surface/50 flex items-center gap-2 transition-colors">
                              <Edit2 size={12} /> Edit Task
                            </button>
                            {!isSkipped && !isCompleted && (
                              <button onClick={() => skipTask(task.id, task.recurring !== 'none')} className="w-full text-left px-3 py-1.5 text-xs font-medium text-textMuted hover:text-yellow-400 hover:bg-surface/50 flex items-center gap-2 transition-colors">
                                <XCircle size={12} /> Skip Today
                              </button>
                            )}
                            {task.recurring !== 'none' && (
                              <button onClick={() => {
                                handleEditTask({ ...task }, 'future'); // ends yesterday conceptually
                                setActiveMenuId(null);
                              }} className="w-full text-left px-3 py-1.5 text-xs font-medium text-textMuted hover:text-red-400 hover:bg-surface/50 flex items-center gap-2 transition-colors">
                                <XCircle size={12} /> End Recurrence
                              </button>
                            )}
                            <button onClick={() => duplicateTask(task)} className="w-full text-left px-3 py-1.5 text-xs font-medium text-textMuted hover:text-textMain hover:bg-surface/50 flex items-center gap-2 transition-colors border-t border-border/50 mt-1 pt-1.5">
                              <Copy size={12} /> Duplicate
                            </button>
                            <button onClick={() => deleteTask(task.id, task.recurring !== 'none')} className="w-full text-left px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 transition-colors">
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {meta.notes && (
                    <div className={cn("text-xs text-textMuted/70 mt-2 pl-7 pr-8 line-clamp-2", isSkipped && "hidden")}>
                      {meta.notes}
                    </div>
                  )}
                </div>
              );
            })}

            {tasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-background/50 border border-dashed border-border/60 rounded-xl mb-2">
                <div className="text-sm font-semibold text-textMain mb-1">No tasks planned yet</div>
                <div className="text-xs text-textMuted mb-4">Add something meaningful today.</div>
                <button 
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-2 text-xs font-semibold bg-textMain text-background px-4 py-2 rounded-lg hover:bg-white transition-transform hover:scale-105 active:scale-95"
                >
                  <Plus size={14} strokeWidth={2.5} /> Add task
                </button>
              </div>
            )}

            {/* Quick Add */}
            {tasks.length > 0 && (
              <form onSubmit={handleAddTask} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-transparent focus-within:border-border/60 focus-within:bg-background transition-all group">
                <button type="submit" disabled={!newTaskName.trim()} className="w-4 h-4 rounded-[4px] flex items-center justify-center text-textMuted hover:text-textMain hover:bg-surface transition-colors disabled:opacity-50">
                  <Plus size={12} strokeWidth={3} />
                </button>
                <input 
                  type="text"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  placeholder="Add a task..."
                  className="bg-transparent border-none outline-none text-sm font-medium text-textMain placeholder-textMuted/50 flex-1 py-1"
                />
                <button type="button" onClick={() => setIsAddModalOpen(true)} className="text-[9px] font-bold tracking-widest uppercase text-textMuted hover:text-textMain px-2 py-1 rounded bg-surface opacity-0 group-focus-within:opacity-100 transition-opacity">
                  Advanced
                </button>
              </form>
            )}
          </div>

          {/* Daily Note Area */}
          <div className="pt-4 border-t border-border/40">
            <h3 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-3">DAILY NOTE</h3>
            <textarea 
              value={dayData.note || ''}
              onChange={(e) => updateNote(e.target.value)}
              placeholder="Record your thoughts, reflections, or end-of-day summary..."
              className="w-full h-24 bg-background border border-border/60 rounded-xl p-3 text-sm text-textMain placeholder-textMuted/40 outline-none focus:border-textMuted transition-colors resize-none"
            />
          </div>

        </div>

        {tasks.length === 0 && (
          <button 
            onClick={toggleManualCompletion}
            className={cn(
              "flex items-center justify-center gap-2 w-full py-3 rounded-xl border text-sm font-bold tracking-wide uppercase transition-all",
              dayData.manualCompletion 
                ? "bg-accent/10 border-accent/20 text-accent hover:bg-accent/20" 
                : "bg-surface border-border/60 text-textMuted hover:text-textMain hover:border-textMuted/40"
            )}
          >
            {dayData.manualCompletion ? <><Check size={16} /> Day Completed</> : "Mark Day as Complete"}
          </button>
        )}
      </div>

      {(isAddModalOpen || editingTask) && (
        <AddTaskModal 
          date={date}
          initialTask={editingTask || undefined}
          onClose={() => { setIsAddModalOpen(false); setEditingTask(null); }}
          onAdd={handleDetailedAddTask}
          onEdit={handleEditTask}
        />
      )}
    </div>
  );
}
