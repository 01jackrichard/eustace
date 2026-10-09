import { useState, useEffect, useRef } from 'react';
import { X, Check, ChevronDown, Clock } from 'lucide-react';
import { format, addDays, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import * as Icons from 'lucide-react';
import type { Task, TaskMetadata } from '../lib/dataManager';
import { parseTaskMetadata, serializeTaskMetadata } from '../lib/dataManager';
import { cn } from '../lib/utils';
import { IconPicker } from './IconPicker';

interface AddTaskModalProps {
  date: string; // YYYY-MM-DD
  initialTask?: Task;
  initialStartTime?: string; // HH:mm
  onClose: () => void;
  onAdd: (task: Omit<Task, 'id'>) => void;
  onEdit?: (task: Task, updateType?: 'single' | 'future' | 'all') => void;
}

// Generate 15-minute intervals for time picker
const generateTimeOptions = () => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = h.toString().padStart(2, '0');
      const mm = m.toString().padStart(2, '0');
      const val = `${hh}:${mm}`;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hr12 = h % 12 || 12;
      const label = `${hr12.toString().padStart(2, '0')}:${mm} ${ampm}`;
      options.push({ val, label });
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

// Interactive Date Picker Popover Component
function DatePickerPopover({ 
  selectedDate, 
  onSelect
}: { 
  selectedDate: Date, 
  onSelect: (date: Date) => void
}) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));
  
  const handlePrev = () => setCurrentMonth(subDays(currentMonth, 1));
  const handleNext = () => setCurrentMonth(addDays(endOfMonth(currentMonth), 1));
  
  const days = eachDayOfInterval({ 
    start: startOfMonth(currentMonth), 
    end: endOfMonth(currentMonth) 
  });
  
  // Pad the beginning so the first day of the month aligns correctly (0 = Sunday, 1 = Monday)
  // Assuming week starts on Sunday for this picker:
  const firstDayOfWeek = currentMonth.getDay();
  const paddingDays = Array.from({ length: firstDayOfWeek }).map((_, i) => i);

  return (
    <div className="absolute top-full left-0 mt-2 z-50 bg-surface border border-border/60 rounded-xl shadow-xl p-4 w-72 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Click outside to close (handled by a generic wrapper in main component) */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-bold text-textMain tracking-wide">{format(currentMonth, 'MMMM yyyy')}</h4>
        <div className="flex items-center gap-1">
          <button type="button" onClick={(e) => { e.stopPropagation(); handlePrev(); }} className="p-1 hover:bg-white/5 rounded"><ChevronDown size={16} className="rotate-90" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); handleNext(); }} className="p-1 hover:bg-white/5 rounded"><ChevronDown size={16} className="-rotate-90" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-2 text-center text-[10px] font-bold text-textMuted">
        <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {paddingDays.map(i => <div key={`pad-${i}`} />)}
        {days.map(day => {
          const isSelected = isSameDay(day, selectedDate);
          const isT = isToday(day);
          return (
            <button
              key={day.toString()}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(day); }}
              className={cn(
                "aspect-square rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                isSelected ? "bg-accent text-background font-bold" : isT ? "text-accent border border-accent/30" : "text-textMain hover:bg-white/5"
              )}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AddTaskModal({ date, initialTask, initialStartTime, onClose, onAdd, onEdit }: AddTaskModalProps) {
  const meta = initialTask ? parseTaskMetadata(initialTask) : {};

  const [name, setName] = useState(initialTask?.name || '');
  const [category, setCategory] = useState(initialTask?.category || '');
  
  // Custom Icon & Color
  const [icon, setIcon] = useState<string | null>(meta.icon || null);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  
  // Date and Time
  const [taskDateStr] = useState(meta.startDate || date); // YYYY-MM-DD
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  
  const [hasTime, setHasTime] = useState<boolean>(!!meta.startTime || !!initialStartTime);
  const [startTime, setStartTime] = useState(meta.startTime || initialStartTime || '09:00');
  const [endTime, setEndTime] = useState(meta.endTime || '');

  const [recurring, setRecurring] = useState<'none' | 'daily'>(
    initialTask?.recurring === 'daily' ? 'daily' : 'none'
  );
  const [notes, setNotes] = useState(meta.notes || '');
  
  const [endDate, setEndDate] = useState(meta.endDate || '');
  const [showEndDateError, setShowEndDateError] = useState(false);
  const [timeError, setTimeError] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isIconPickerOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, isIconPickerOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isDatePickerOpen && !(e.target as Element).closest('.date-picker-container')) {
        setIsDatePickerOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isDatePickerOpen]);

  // Clear errors when fields change
  useEffect(() => {
    if (endDate) setShowEndDateError(false);
  }, [endDate]);

  useEffect(() => {
    if (hasTime && startTime && endTime) {
      if (endTime < startTime) {
        setTimeError('End time must be after start time.');
      } else {
        setTimeError('');
      }
    } else {
      setTimeError('');
    }
  }, [startTime, endTime, hasTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (recurring === 'daily' && !endDate) {
      setShowEndDateError(true);
      return;
    }

    if (timeError) return;

    const metadata: TaskMetadata = {
      ...meta,
      notes: notes.trim() || undefined,
      startDate: taskDateStr,
      endDate: recurring === 'daily' ? endDate : undefined,
      startTime: hasTime && startTime ? startTime : undefined,
      endTime: hasTime && endTime ? endTime : undefined,
      icon: icon || undefined
    };

    if ('priority' in metadata) delete metadata.priority;

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
        createdAt: taskDateStr, // use the explicitly chosen date
        description: serializeTaskMetadata(metadata),
        metadata
      });
    }
  };

  const SelectedIcon = icon ? (Icons as any)[icon] : null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-background/80 md:p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          ref={modalRef}
          className="w-full max-w-xl bg-surface border-t border-x md:border border-border/40 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-0 md:zoom-in-95 duration-200 pb-[env(safe-area-inset-bottom)] max-h-[90dvh] flex flex-col"
        >
          <div className="px-6 py-5 border-b border-border/20 flex items-center justify-between shrink-0">
            <h2 className="text-[11px] font-bold tracking-[0.2em] text-textMuted uppercase">
              {initialTask ? 'Edit Task' : 'New Task'}
            </h2>
            <button onClick={onClose} className="text-textMuted hover:text-textMain transition-colors p-1 bg-white/5 hover:bg-white/10 rounded-full">
              <X size={16} />
            </button>
          </div>

          <form id="task-form" onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-6">
            
            {/* Title and Icon */}
            <div className="flex gap-4 items-start">
              <button
                type="button"
                onClick={() => setIsIconPickerOpen(true)}
                className="w-12 h-12 shrink-0 rounded-xl border border-border/60 bg-background/50 hover:bg-white/5 hover:border-textMuted transition-all flex items-center justify-center group text-textMuted"
                title="Choose Icon"
              >
                {SelectedIcon ? <SelectedIcon size={22} className="text-textMain group-hover:scale-110 transition-transform" /> : <Icons.Plus size={20} />}
              </button>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  placeholder="Task title"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent text-xl md:text-2xl font-bold text-textMain placeholder:text-textMuted/40 focus:outline-none mb-2"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Optional category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-textMuted placeholder:text-textMuted/40 focus:outline-none"
                />
              </div>
            </div>

            <div className="h-px bg-border/20" />

            {/* TIME ROW */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-8">
              {/* TIME */}
              <div className="space-y-3 flex-1 min-w-0">
                <label className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase flex items-center gap-2">
                    <Clock size={12} /> Time
                  </span>
                  <button
                    type="button"
                    onClick={() => setHasTime(!hasTime)}
                    className={cn(
                      "text-[10px] font-bold tracking-[0.1em] uppercase px-2 py-0.5 rounded transition-colors",
                      hasTime ? "bg-accent/20 text-accent" : "bg-surface border border-border/60 text-textMuted"
                    )}
                  >
                    {hasTime ? 'Enabled' : 'Disabled'}
                  </button>
                </label>
                
                {hasTime ? (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="relative flex-1">
                      <select
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full appearance-none bg-background border border-border/60 text-textMain text-sm font-medium rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-textMuted transition-colors"
                      >
                        {TIME_OPTIONS.map(opt => <option key={`start-${opt.val}`} value={opt.val}>{opt.label}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none" />
                    </div>
                    <span className="text-textMuted text-xs font-bold uppercase">to</span>
                    <div className="relative flex-1">
                      <select
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full appearance-none bg-background border border-border/60 text-textMain text-sm font-medium rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-textMuted transition-colors"
                      >
                        <option value="">None</option>
                        {TIME_OPTIONS.map(opt => <option key={`end-${opt.val}`} value={opt.val}>{opt.label}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none" />
                    </div>
                  </div>
                ) : (
                  <div className="h-[38px] flex items-center text-sm font-bold tracking-widest text-textMuted/40 uppercase">
                    Anytime
                  </div>
                )}
                {timeError && (
                  <p className="text-xs text-red-400 font-medium animate-in fade-in">{timeError}</p>
                )}
              </div>
            </div>

            <div className="h-px bg-border/20" />

            {/* RECURRENCE */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase">Recurrence</label>
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
                    
                    <div className="relative flex-1 date-picker-container">
                      <button
                        type="button"
                        onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                        className={cn(
                          "w-full flex items-center justify-between bg-background border text-sm font-medium tracking-wide rounded-lg px-3 py-2 transition-colors",
                          showEndDateError ? "border-red-500/50" : "border-border/60 hover:border-textMuted"
                        )}
                      >
                        <span className={endDate ? "text-textMain" : "text-textMuted"}>
                          {endDate ? format(new Date(endDate + 'T12:00:00'), 'MMM d, yyyy') : "Select end date"}
                        </span>
                        <ChevronDown size={14} className="text-textMuted" />
                      </button>
                      
                      {isDatePickerOpen && (
                        <DatePickerPopover 
                          selectedDate={endDate ? new Date(endDate + 'T12:00:00') : new Date(taskDateStr + 'T12:00:00')}
                          onSelect={(d) => { setEndDate(format(d, 'yyyy-MM-dd')); setIsDatePickerOpen(false); }}
                          
                        />
                      )}
                    </div>
                  </div>
                  {showEndDateError && (
                    <p className="text-xs text-red-400 font-medium pl-24 animate-in fade-in">Please select an end date.</p>
                  )}
                </div>
              )}
            </div>

            <div className="h-px bg-border/20" />

            {/* NOTES */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase">Notes</label>
              <textarea
                placeholder="Add optional details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full bg-background border border-border/60 rounded-lg p-3 text-sm font-medium text-textMain placeholder:text-textMuted/40 focus:outline-none focus:border-textMuted transition-colors resize-none"
              />
            </div>
          </form>

          <div className="p-6 border-t border-border/20 shrink-0 bg-surface">
            <button
              type="submit"
              form="task-form"
              disabled={!name.trim() || !!timeError}
              className="w-full bg-accent text-background font-black text-xs uppercase tracking-[0.15em] py-3.5 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
            >
              <Check size={16} strokeWidth={3} />
              {initialTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>

      {isIconPickerOpen && (
        <IconPicker 
          selectedIcon={icon}
          onSelect={(iconName) => {
            setIcon(iconName);
            setIsIconPickerOpen(false);
          }}
          onClose={() => setIsIconPickerOpen(false)}
        />
      )}
    </>
  );
}
