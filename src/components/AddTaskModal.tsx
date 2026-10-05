import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import type { Task, TaskMetadata } from '../lib/dataManager';
import { parseTaskMetadata, serializeTaskMetadata } from '../lib/dataManager';

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
  const [recurring, setRecurring] = useState<'none' | 'daily'>(
    initialTask?.recurring === 'daily' ? 'daily' : 'none'
  );
  const [notes, setNotes] = useState(meta.notes || '');
  const [endDate, setEndDate] = useState(meta.endDate || '');
  const [showEndDateError, setShowEndDateError] = useState(false);

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
      endDate: recurring === 'daily' ? endDate : undefined
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-surface border border-border/40 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        <div className="px-6 py-5 border-b border-border/20 flex items-center justify-between">
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

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Main Task Input */}
          <div>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full bg-transparent text-xl font-medium text-textMain placeholder-textMuted/40 outline-none"
            />
          </div>

          <div className="flex flex-col gap-4">
            {/* Category */}
            <div className="flex items-center gap-3 border-b border-border/20 pb-2">
              <span className="text-[11px] font-bold tracking-widest text-textMuted uppercase w-20">Category</span>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Work, Health, Reading..."
                className="flex-1 bg-transparent text-sm text-textMain placeholder-textMuted/30 outline-none"
              />
            </div>

            {/* Notes */}
            <div className="flex items-start gap-3 border-b border-border/20 pb-2">
              <span className="text-[11px] font-bold tracking-widest text-textMuted uppercase w-20 pt-1">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional details..."
                rows={2}
                className="flex-1 bg-transparent text-sm text-textMain placeholder-textMuted/30 outline-none resize-none"
              />
            </div>

            {/* Repeat */}
            <div className="flex items-center gap-3 pb-2 border-b border-border/20 transition-all">
              <span className="text-[11px] font-bold tracking-widest text-textMuted uppercase w-20">Repeat</span>
              <select
                value={recurring}
                onChange={(e) => {
                  setRecurring(e.target.value as 'none' | 'daily');
                  if (e.target.value === 'none') setShowEndDateError(false);
                }}
                className="bg-transparent text-sm text-textMain outline-none cursor-pointer appearance-none flex-1"
              >
                <option value="none" className="bg-surface text-textMain">Does not repeat</option>
                <option value="daily" className="bg-surface text-textMain">Every day</option>
              </select>
            </div>

            {/* End Date (Conditional) */}
            {recurring === 'daily' && (
              <div className="flex items-center gap-3 pb-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <span className="text-[11px] font-bold tracking-widest text-textMuted uppercase w-20">Ends</span>
                <input
                  type="date"
                  min={taskStartDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-sm text-textMain outline-none cursor-pointer flex-1 [color-scheme:dark]"
                />
              </div>
            )}
          </div>

          <div className="pt-4 flex items-center justify-between">
            <div>
              {showEndDateError && (
                <span className="text-xs text-accent font-medium animate-in fade-in">
                  Choose an end date.
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-textMuted hover:text-textMain transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-6 py-2 bg-textMain text-background text-sm font-bold tracking-wide rounded-lg hover:bg-textMain/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {initialTask ? 'Save Changes' : 'Add Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
