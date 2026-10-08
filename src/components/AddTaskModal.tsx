import { useState, useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import { format } from 'date-fns';
import type { Task, TaskMetadata } from '../lib/dataManager';
import { parseTaskMetadata, serializeTaskMetadata } from '../lib/dataManager';
import { cn } from '../lib/utils';

interface AddTaskModalProps {
  date: Date;
  initialTask?: Task;
  initialStartTime?: string; // HH:mm
  onClose: () => void;
  onAdd: (task: Omit<Task, 'id'>) => void;
  onEdit?: (task: Task, updateType?: 'single' | 'future' | 'all') => void;
}

export function AddTaskModal({ date, initialTask, initialStartTime, onClose, onAdd, onEdit }: AddTaskModalProps) {
  const meta = initialTask ? parseTaskMetadata(initialTask) : {};

  const [name, setName] = useState(initialTask?.name || '');
  const [category, setCategory] = useState(initialTask?.category || '');
  const [recurring, setRecurring] = useState<'none' | 'daily'>(
    initialTask?.recurring === 'daily' ? 'daily' : 'none'
  );
  const [notes, setNotes] = useState(meta.notes || '');
  const [endDate, setEndDate] = useState(meta.endDate || '');
  const [showEndDateError, setShowEndDateError] = useState(false);

  // Time handling
  const [hasTime, setHasTime] = useState<boolean>(!!meta.startTime || !!initialStartTime);
  const [startTime, setStartTime] = useState(meta.startTime || initialStartTime || '09:00');
  const [endTime, setEndTime] = useState(meta.endTime || '');

  const modalRef = useRef<HTMLDivElement>(null);

  const taskStartDate = meta.startDate || format(date, 'yyyy-MM-dd');

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Clear end date error if user selects one
  useEffect(() => {
    if (endDate) setShowEndDateError(false);
  }, [endDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (recurring === 'daily' && !endDate) {
      setShowEndDateError(true);
      return;
    }

    const metadata: TaskMetadata = {
      ...meta,
      notes: notes.trim() || undefined,
      startDate: taskStartDate,
      endDate: recurring === 'daily' ? endDate : undefined,
      startTime: hasTime && startTime ? startTime : undefined,
      endTime: hasTime && endTime ? endTime : undefined,
    };

    // Remove legacy priority from metadata if it exists to clean it up over time
    if ('priority' in metadata) {
      delete metadata.priority;
    }

    if (initialTask && onEdit) {
      onEdit({
        ...initialTask,
        name: name.trim(),
        category: category.trim() || undefined,
        recurring: recurring,
        description: serializeTaskMetadata(metadata),
        metadata
      }, recurring === 'daily' ? 'future' : 'single');
    } else {
      onAdd({
        name: name.trim(),
        category: category.trim() || undefined,
        recurring: recurring,
        createdAt: format(date, 'yyyy-MM-dd'),
        description: serializeTaskMetadata(metadata),
        metadata
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-background/80 md:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-surface border-t border-x md:border border-border/40 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-0 md:zoom-in-95 duration-200 pb-[env(safe-area-inset-bottom)] max-h-[90dvh] flex flex-col"
      >
        <div className="px-6 py-5 border-b border-border/20 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold tracking-widest text-textMuted uppercase">
            {initialTask ? 'Edit Task' : 'New Task'}
          </h2>
          <button
            onClick={onClose}
            className="text-textMuted hover:text-textMain transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        <form id="task-form" onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="space-y-4">
            <input
              type="text"
              placeholder="What needs to be done?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-transparent text-xl font-medium text-textMain placeholder:text-textMuted/40 focus:outline-none"
              autoFocus
            />

            <input
              type="text"
              placeholder="Category (optional)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-transparent text-sm text-textMuted placeholder:text-textMuted/40 focus:outline-none"
            />
          </div>

          <div className="h-px bg-border/20" />

          {/* TIME SECTION */}
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer group w-fit" onClick={() => setHasTime(!hasTime)}>
              <div className={cn(
                "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                hasTime ? "bg-accent border-accent text-background" : "border-border/60 group-hover:border-textMuted"
              )}>
                {hasTime && <Check size={14} strokeWidth={3} />}
              </div>
              <span className="text-sm font-bold tracking-widest text-textMuted uppercase">Set Time</span>
            </label>

            {hasTime && (
              <div className="flex items-center gap-4 pl-8 animate-in fade-in slide-in-from-top-2 duration-200">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="bg-background border border-border/60 text-textMain text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-textMuted transition-colors"
                  required
                />
                <span className="text-textMuted text-sm">to</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="bg-background border border-border/60 text-textMain text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-textMuted transition-colors"
                  placeholder="Optional"
                />
              </div>
            )}
          </div>

          <div className="h-px bg-border/20" />

          <div className="space-y-3">
            <label className="text-[11px] font-bold tracking-widest text-textMuted uppercase">Recurrence</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRecurring('none')}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-bold tracking-widest transition-colors border",
                  recurring === 'none'
                    ? "bg-textMain text-background border-textMain"
                    : "bg-surface border-border/60 text-textMuted hover:border-textMuted/40"
                )}
              >
                ONCE
              </button>
              <button
                type="button"
                onClick={() => setRecurring('daily')}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-bold tracking-widest transition-colors border",
                  recurring === 'daily'
                    ? "bg-textMain text-background border-textMain"
                    : "bg-surface border-border/60 text-textMuted hover:border-textMuted/40"
                )}
              >
                DAILY
              </button>
            </div>

            {recurring === 'daily' && (
              <div className="flex flex-col gap-2 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold tracking-widest text-textMuted uppercase w-20">Ends</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={taskStartDate}
                    className={cn(
                      "flex-1 bg-background border text-textMain text-sm rounded-lg px-3 py-2 focus:outline-none transition-colors",
                      showEndDateError ? "border-red-500/50" : "border-border/60 focus:border-textMuted"
                    )}
                  />
                </div>
                {showEndDateError && (
                  <p className="text-xs text-red-400 pl-24 animate-in fade-in">Please select an end date.</p>
                )}
              </div>
            )}
          </div>

          <div className="h-px bg-border/20" />

          <div className="space-y-2">
            <label className="text-[11px] font-bold tracking-widest text-textMuted uppercase">Notes</label>
            <textarea
              placeholder="Add details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-background border border-border/60 rounded-lg p-3 text-sm text-textMain placeholder:text-textMuted/40 focus:outline-none focus:border-textMuted transition-colors resize-none"
            />
          </div>
        </form>

        <div className="p-6 border-t border-border/20 shrink-0">
          <button
            type="submit"
            form="task-form"
            disabled={!name.trim()}
            className="w-full bg-accent text-background font-bold text-sm tracking-wide py-3.5 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {initialTask ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
