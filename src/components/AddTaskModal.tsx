import { useState, useEffect, useRef } from 'react';
import { X, Calendar as Clock, AlignLeft, Flag, Settings2, Repeat, } from 'lucide-react';
import { format } from 'date-fns';
import { RRule } from 'rrule';
import type { Task, TaskMetadata } from '../lib/dataManager';
import { parseTaskMetadata, serializeTaskMetadata } from '../lib/dataManager';
import { cn } from '../lib/utils';

interface AddTaskModalProps {
  date: Date;
  initialTask?: Task;
  onClose: () => void;
  onAdd: (task: Omit<Task, 'id'>) => void;
  onEdit?: (task: Task, updateType?: 'single' | 'future' | 'all') => void;
}

export function AddTaskModal({ date, initialTask, onClose, onAdd, onEdit }: AddTaskModalProps) {
  const meta = initialTask ? parseTaskMetadata(initialTask) : {};
  
  const [name, setName] = useState(initialTask?.name || '');
  const [category, setCategory] = useState(initialTask?.category || '');
  const [duration, setDuration] = useState(initialTask?.duration || '');
  const [recurring, setRecurring] = useState(initialTask?.recurring || 'none');
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [notes, setNotes] = useState(meta.notes || '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'none'>(meta.priority || 'none');
  const [startDate, setStartDate] = useState(meta.startDate || format(date, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(meta.endDate || '');
  const [customDays, setCustomDays] = useState<number[]>([]);
  
  const [editMode, setEditMode] = useState<'single' | 'future' | 'all'>('all');

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialTask && meta.rrule) {
      try {
        const rule = RRule.fromString(meta.rrule);
        if (rule.options.byweekday) {
          setCustomDays(rule.options.byweekday.map((w: any) => w.weekday ?? w));
        }
      } catch (e) {}
    }
  }, [initialTask]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

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

  const toggleDay = (day: number) => {
    setCustomDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    let finalRecurring = recurring;
    let rruleStr = '';
    
    if (recurring === 'custom') {
      if (customDays.length === 0) {
        finalRecurring = 'none';
      } else {
        const byweekday = customDays.map(d => [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU][d]);
        const rule = new RRule({
          freq: RRule.WEEKLY,
          byweekday
        });
        rruleStr = rule.toString();
      }
    }

    const metadata: TaskMetadata = {
      ...meta,
      notes: notes.trim() || undefined,
      priority: priority !== 'none' ? priority : undefined,
      startDate: startDate || format(date, 'yyyy-MM-dd'),
      endDate: endDate || undefined,
      rrule: rruleStr || undefined
    };

    if (initialTask && onEdit) {
      onEdit({
        ...initialTask,
        name: name.trim(),
        category: category.trim() || undefined,
        duration: duration.trim() || undefined,
        recurring: finalRecurring,
        description: serializeTaskMetadata(metadata),
        metadata
      }, editMode);
    } else {
      onAdd({
        name: name.trim(),
        category: category.trim() || undefined,
        duration: duration.trim() || undefined,
        recurring: finalRecurring,
        createdAt: startDate || format(date, 'yyyy-MM-dd'),
        description: serializeTaskMetadata(metadata),
        metadata
      });
    }
    
    onClose();
  };

  const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div 
        ref={modalRef}
        className="bg-surface border border-border rounded-2xl max-w-lg w-full shadow-2xl relative animate-pop flex flex-col my-auto"
      >
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <h2 className="text-base font-bold text-textMain tracking-tight">
            {initialTask ? 'EDIT TASK' : 'NEW TASK'}
          </h2>
          <button 
            onClick={onClose}
            className="text-textMuted hover:text-textMain transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
          
          {/* Core Fields */}
          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Task name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-transparent text-xl font-bold text-textMain placeholder-textMuted/40 border-none outline-none focus:ring-0 p-0"
              autoFocus
            />
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-background border border-border/60 px-3 py-1.5 rounded-lg focus-within:border-accent/50 transition-colors">
                <span className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Cat</span>
                <input
                  type="text"
                  placeholder="e.g. Study"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-textMain placeholder-textMuted/40 border-none outline-none w-20 p-0"
                />
              </div>
              
              <div className="flex items-center gap-2 bg-background border border-border/60 px-3 py-1.5 rounded-lg focus-within:border-accent/50 transition-colors">
                <Clock size={12} className="text-textMuted" />
                <input
                  type="text"
                  placeholder="e.g. 60 min"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-textMain placeholder-textMuted/40 border-none outline-none w-20 p-0"
                />
              </div>
            </div>
          </div>

          {/* Advanced Toggle */}
          <button 
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs font-semibold text-textMuted hover:text-textMain transition-colors w-max"
          >
            <Settings2 size={14} />
            {showAdvanced ? 'HIDE ADVANCED' : 'SHOW ADVANCED OPTIONS'}
          </button>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="flex flex-col gap-5 pt-4 border-t border-border/50 animate-fade-in">
              
              {/* Note */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold tracking-widest text-textMuted uppercase flex items-center gap-1.5">
                  <AlignLeft size={12} /> Description / Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add details..."
                  className="w-full bg-background border border-border/60 rounded-lg p-3 text-sm text-textMain placeholder-textMuted/40 outline-none focus:border-textMuted transition-colors resize-none h-20"
                />
              </div>

              {/* Priority */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold tracking-widest text-textMuted uppercase flex items-center gap-1.5">
                  <Flag size={12} /> Priority
                </label>
                <div className="flex gap-2">
                  {(['none', 'low', 'medium', 'high'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={cn(
                        "px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider border transition-colors",
                        priority === p 
                          ? p === 'high' ? "bg-red-500/20 text-red-400 border-red-500/30" 
                          : p === 'medium' ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                          : p === 'low' ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                          : "bg-surfaceHover text-textMain border-border"
                          : "bg-transparent text-textMuted border-transparent hover:bg-surface"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recurrence */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold tracking-widest text-textMuted uppercase flex items-center gap-1.5">
                  <Repeat size={12} /> Repeat
                </label>
                <select 
                  value={recurring}
                  onChange={(e) => setRecurring(e.target.value as any)}
                  className="w-full bg-background border border-border/60 rounded-lg p-2.5 text-sm font-semibold text-textMain outline-none focus:border-textMuted transition-colors appearance-none"
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Every day</option>
                  <option value="weekdays">Every weekday (Mon-Fri)</option>
                  <option value="weekly">Every week</option>
                  <option value="custom">Custom weekdays...</option>
                </select>

                {recurring === 'custom' && (
                  <div className="flex items-center gap-1 mt-2">
                    {daysOfWeek.map((d, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={cn(
                          "flex-1 py-1.5 text-xs font-bold rounded border transition-colors",
                          customDays.includes(i)
                            ? "bg-textMain text-background border-textMain"
                            : "bg-background text-textMuted border-border/60 hover:border-textMuted"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Start/End Dates */}
              {recurring !== 'none' && (
                <div className="flex gap-4">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[10px] font-bold tracking-widest text-textMuted uppercase">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-background border border-border/60 rounded-lg p-2.5 text-sm font-semibold text-textMain outline-none focus:border-textMuted transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[10px] font-bold tracking-widest text-textMuted uppercase">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-background border border-border/60 rounded-lg p-2.5 text-sm font-semibold text-textMain outline-none focus:border-textMuted transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Edit Mode Selection for Recurring tasks */}
              {initialTask && initialTask.recurring !== 'none' && (
                <div className="flex flex-col gap-2 mt-2 p-3 bg-background/50 rounded-lg border border-border/40">
                  <label className="text-[10px] font-bold tracking-widest text-textMuted uppercase">Apply Changes To</label>
                  <select 
                    value={editMode}
                    onChange={(e) => setEditMode(e.target.value as any)}
                    className="w-full bg-transparent text-sm font-semibold text-textMain outline-none"
                  >
                    <option value="single">This occurrence only (Creates exception)</option>
                    <option value="future">This and future occurrences</option>
                    <option value="all">Entire recurring series</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50 mt-auto">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold tracking-wide text-textMuted hover:text-textMain transition-colors uppercase"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={!name.trim()}
              className="px-6 py-2 bg-textMain text-background rounded-lg text-sm font-bold tracking-wide uppercase hover:bg-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {initialTask ? 'Save Changes' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
