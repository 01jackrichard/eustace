import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ChevronDown, Clock, Plus, Repeat, Bell } from 'lucide-react';
import { format, addDays, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, parseISO } from 'date-fns';
import { getTaskIcon } from '../lib/iconRegistry';
import type { Task, TaskMetadata } from '../lib/dataManager';
import { parseTaskMetadata, serializeTaskMetadata } from '../lib/dataManager';
import { cn } from '../lib/utils';
import { IconPicker } from './IconPicker';
import { WheelTimePicker } from './ui/WheelTimePicker';

interface AddTaskModalProps {
  date: string; // YYYY-MM-DD
  initialTask?: Task;
  initialStartTime?: string; // HH:mm
  onClose: () => void;
  onAdd: (task: Omit<Task, 'id'>) => void;
  onEdit?: (task: Task, updateType?: 'single' | 'future' | 'all') => void;
}

function formatTime12(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24;
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m} ${period}`;
}

export const RECURRENCE_OPTIONS: Array<{ value: Task['recurring']; label: string }> = [
  { value: 'none', label: 'Off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export const REMINDER_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'None' },
  { value: 0, label: 'At time' },
  { value: 5, label: '5m before' },
  { value: 10, label: '10m before' },
  { value: 15, label: '15m before' },
  { value: 30, label: '30m before' },
  { value: 60, label: '1h before' },
];

export function getRecurrenceDescription(recurring: Task['recurring'], dateStr: string): string {
  if (recurring === 'none') return 'Occurs once on scheduled date';
  if (recurring === 'daily') return 'Repeats every day';
  try {
    const d = parseISO(dateStr);
    if (recurring === 'weekly') {
      return `Repeats weekly on ${format(d, 'EEEE')}`;
    }
    if (recurring === 'monthly') {
      const dayNum = d.getDate();
      return `Repeats on day ${dayNum} of every month (adjusted for shorter months)`;
    }
    if (recurring === 'yearly') {
      const isLeapDay = d.getMonth() === 1 && d.getDate() === 29;
      return `Repeats annually on ${format(d, 'MMMM d')}${isLeapDay ? ' (Feb 28 in non-leap years)' : ''}`;
    }
    if (recurring === 'weekdays') return 'Repeats every weekday (Mon–Fri)';
    if (recurring === 'custom') return 'Custom recurrence rule';
  } catch {
    // fallback
  }
  return `Repeats ${recurring}`;
}

interface DatePickerPopoverProps {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

// Anchored, non-overflowing Portal Date Picker Popover Component
function DatePickerPopover({ 
  selectedDate, 
  onSelect,
  onClose,
  anchorRef
}: DatePickerPopoverProps) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null);

  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popoverWidth = 280;
    const popoverHeight = 310;
    const padding = 12;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let placement: 'top' | 'bottom' = 'bottom';
    let top = rect.bottom + 6;

    if (spaceBelow < popoverHeight + padding && spaceAbove > spaceBelow) {
      placement = 'top';
      top = Math.max(padding, rect.top - popoverHeight - 6);
    }

    // Align right edge of popover with right edge of trigger button
    let left = rect.right - popoverWidth;

    // Clamp within viewport boundaries
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    setCoords({ top, left, placement });
  }, [anchorRef]);

  useEffect(() => {
    updatePosition();

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [updatePosition, onClose, anchorRef]);
  
  const handlePrev = () => setCurrentMonth(subDays(currentMonth, 1));
  const handleNext = () => setCurrentMonth(addDays(endOfMonth(currentMonth), 1));
  
  const days = eachDayOfInterval({ 
    start: startOfMonth(currentMonth), 
    end: endOfMonth(currentMonth) 
  });
  
  const firstDayOfWeek = currentMonth.getDay();
  const paddingDays = Array.from({ length: firstDayOfWeek }).map((_, i) => i);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Select end date"
      style={{
        position: 'fixed',
        top: coords ? `${coords.top}px` : undefined,
        left: coords ? `${coords.left}px` : undefined,
        zIndex: 150,
      }}
      className={cn(
        "w-[280px] max-w-[calc(100vw-24px)] bg-surface border border-border/70 rounded-2xl shadow-2xl p-4 select-none animate-in fade-in duration-150",
        coords?.placement === 'top' ? "slide-in-from-bottom-2" : "slide-in-from-top-2"
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-bold text-textMain tracking-wide text-xs">{format(currentMonth, 'MMMM yyyy')}</h4>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
            className="p-1 hover:bg-white/5 rounded text-textMuted hover:text-textMain transition-colors"
            aria-label="Previous month"
          >
            <ChevronDown size={14} className="rotate-90" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            className="p-1 hover:bg-white/5 rounded text-textMuted hover:text-textMain transition-colors"
            aria-label="Next month"
          >
            <ChevronDown size={14} className="-rotate-90" />
          </button>
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
                "aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition-colors",
                isSelected
                  ? "bg-accent text-background font-black"
                  : isT
                    ? "text-accent border border-accent/40"
                    : "text-textMain hover:bg-white/5"
              )}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

export function AddTaskModal({ date, initialTask, initialStartTime, onClose, onAdd, onEdit }: AddTaskModalProps) {
  const meta = initialTask ? parseTaskMetadata(initialTask) : {};

  const [name, setName] = useState(initialTask?.name || '');
  const [category, setCategory] = useState(initialTask?.category || '');
  
  // Custom Icon
  const [icon, setIcon] = useState<string | null>(meta.icon || null);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  
  // Date and Time
  const [taskDateStr] = useState(meta.startDate || date); // YYYY-MM-DD
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  
  // Time states: starts as Anytime by default unless initialTask has a time or initialStartTime is provided
  const initialTimeCandidate = meta.startTime || initialTask?.startTime || initialStartTime || null;
  const [timeMode, setTimeMode] = useState<'anytime' | 'set'>(initialTimeCandidate ? 'set' : 'anytime');
  const [startTime, setStartTime] = useState<string>(initialTimeCandidate || '09:00');
  const [isPickerExpanded, setIsPickerExpanded] = useState<boolean>(!initialTask && Boolean(initialStartTime));

  // Recurrence state: ONCE ('none') vs DAILY ('daily')
  // Preserve existing recurring value for legacy tasks (e.g. 'weekly', 'monthly', 'yearly', 'custom')
  const [recurring, setRecurring] = useState<Task['recurring']>(initialTask?.recurring || 'none');
  const initialReminderCandidate = typeof initialTask?.reminderMinutes === 'number'
    ? initialTask.reminderMinutes
    : (typeof meta.reminderMinutes === 'number' ? meta.reminderMinutes : null);
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(initialReminderCandidate);
  
  const [notes, setNotes] = useState(meta.notes || '');
  const [endDate, setEndDate] = useState(meta.endDate || '');

  const modalRef = useRef<HTMLDivElement>(null);
  const endDateTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isIconPickerOpen) {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current && !isIconPickerOpen) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isIconPickerOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const chosenStartTime = timeMode === 'set' && startTime ? startTime : undefined;
    const chosenReminder = timeMode === 'set' && chosenStartTime ? reminderMinutes : null;

    const metadata: TaskMetadata = {
      ...meta,
      notes: notes.trim() || undefined,
      startDate: taskDateStr,
      endDate: recurring !== 'none' && endDate ? endDate : undefined,
      startTime: chosenStartTime,
      reminderMinutes: chosenReminder !== null ? chosenReminder : undefined,
      icon: icon || undefined
    };

    if (!chosenStartTime) {
      delete metadata.startTime;
      delete metadata.reminderMinutes;
    }
    if (chosenReminder === null || chosenReminder === undefined) {
      delete metadata.reminderMinutes;
    }

    if ('priority' in metadata) delete metadata.priority;

    if (initialTask && onEdit) {
      onEdit({
        ...initialTask,
        name: name.trim(),
        category: category.trim() || undefined,
        recurring: recurring,
        description: serializeTaskMetadata(metadata),
        metadata,
        startTime: chosenStartTime
      }, recurring !== 'none' ? 'future' : 'single');
    } else {
      onAdd({
        name: name.trim(),
        category: category.trim() || undefined,
        recurring: recurring,
        createdAt: taskDateStr,
        description: serializeTaskMetadata(metadata),
        metadata,
        startTime: chosenStartTime,
        reminderMinutes: chosenReminder
      });
    }
  };

  const TaskIconComponent = useMemo(() => getTaskIcon(icon), [icon]);

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-background/85 md:p-4 backdrop-blur-md animate-in fade-in duration-200">
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-task-modal-title"
          className="w-full max-w-xl bg-surface border-t border-x md:border border-border/50 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-0 md:zoom-in-95 duration-200 pb-[env(safe-area-inset-bottom)] max-h-[92dvh] flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-border/20 flex items-center justify-between shrink-0 bg-surface">
            <h2 id="add-task-modal-title" className="text-[11px] font-black tracking-[0.25em] text-textMuted uppercase flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              {initialTask ? 'Edit Task' : 'New Task'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="text-textMuted hover:text-textMain transition-colors p-1.5 bg-white/5 hover:bg-white/10 rounded-full"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>

          <form id="task-form" onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-7">
            
            {/* Title, Category & Icon */}
            <div className="flex gap-4 items-start">
              <button
                type="button"
                onClick={() => setIsIconPickerOpen(true)}
                aria-label="Choose task icon"
                className="w-12 h-12 shrink-0 rounded-2xl border border-border/60 bg-surface hover:bg-white/5 hover:border-textMuted/60 transition-all flex items-center justify-center group text-textMuted hover:text-textMain shadow-inner mt-0.5"
                title="Choose Icon"
              >
                {TaskIconComponent ? <TaskIconComponent size={22} className="text-textMain group-hover:scale-110 transition-transform" /> : <Plus size={20} />}
              </button>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <input
                  type="text"
                  placeholder="Task title"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent border-none outline-none focus:outline-none text-2xl md:text-3xl font-bold tracking-tight text-textMain placeholder:text-textMuted/30 caret-accent selection:bg-accent/30 py-1 leading-normal"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Optional category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-transparent border-none outline-none focus:outline-none text-sm font-medium text-textMuted placeholder:text-textMuted/30 caret-accent selection:bg-accent/30 py-0.5"
                />
              </div>
            </div>

            <div className="h-px bg-border/20" />

            {/* TIME SECTION */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase flex items-center gap-2">
                  <Clock size={12} /> Time
                </span>
                {timeMode === 'set' && (
                  <button
                    type="button"
                    onClick={() => {
                      setTimeMode('anytime');
                      setIsPickerExpanded(false);
                    }}
                    className="text-[10px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 rounded-md text-textMuted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Clear (Anytime)
                  </button>
                )}
              </div>

              {/* Segmented Control: Anytime | Set Time */}
              <div className="grid grid-cols-2 p-1 bg-background border border-border/50 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setTimeMode('anytime');
                    setIsPickerExpanded(false);
                  }}
                  className={cn(
                    "py-2 text-xs font-bold tracking-wider rounded-lg transition-all duration-150 text-center select-none",
                    timeMode === 'anytime'
                      ? "bg-textMain text-background shadow-md font-black"
                      : "text-textMuted hover:text-textMain hover:bg-white/[0.04]"
                  )}
                >
                  Anytime
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimeMode('set');
                    setIsPickerExpanded(true);
                  }}
                  className={cn(
                    "py-2 text-xs font-bold tracking-wider rounded-lg transition-all duration-150 text-center select-none flex items-center justify-center gap-1.5",
                    timeMode === 'set'
                      ? "bg-textMain text-background shadow-md font-black"
                      : "text-textMuted hover:text-textMain hover:bg-white/[0.04]"
                  )}
                >
                  <Clock size={13} className={timeMode === 'set' ? "text-background" : "text-textMuted"} />
                  Set Time
                </button>
              </div>

              {/* Time Configuration Panel when 'Set Time' is active */}
              {timeMode === 'set' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {/* Prominent Scheduled Time Card */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                        <Clock size={15} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-textMuted">Scheduled Time</span>
                        <span className="text-base font-bold text-textMain font-mono tracking-tight">
                          {formatTime12(startTime)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPickerExpanded(!isPickerExpanded)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-textMain border border-border/40 transition-colors"
                      >
                        {isPickerExpanded ? 'Done' : 'Change'}
                      </button>
                    </div>
                  </div>

                  {/* Wheel Picker (revealed when expanded) */}
                  {isPickerExpanded && (
                    <div className="pt-1 animate-in fade-in zoom-in-95 duration-150">
                      <WheelTimePicker
                        value={startTime}
                        onChange={(newTime24) => setStartTime(newTime24)}
                      />
                    </div>
                  )}

                  {/* Reminder Offset Selector */}
                  <div className="pt-2.5 mt-2 border-t border-border/30 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.15em] text-textMuted uppercase">
                      <span className="flex items-center gap-1.5"><Bell size={11} className="text-accent" /> Reminder Notification</span>
                      {reminderMinutes !== null && (
                        <span className="text-accent normal-case tracking-normal font-semibold">
                          {REMINDER_OPTIONS.find(o => o.value === reminderMinutes)?.label || 'Custom'}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 p-1 bg-background/60 border border-border/40 rounded-xl">
                      {REMINDER_OPTIONS.map((opt) => (
                        <button
                          key={String(opt.value)}
                          type="button"
                          onClick={() => setReminderMinutes(opt.value)}
                          className={cn(
                            "py-1.5 text-[10px] font-bold rounded-lg transition-all duration-150 text-center select-none",
                            reminderMinutes === opt.value
                              ? "bg-accent text-white shadow-sm font-black"
                              : "text-textMuted hover:text-textMain hover:bg-white/[0.04]"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="h-px bg-border/20" />

            {/* RECURRENCE SECTION */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase flex items-center gap-2">
                  <Repeat size={12} /> Recurrence
                </label>
              </div>

              {/* Segmented Repeat Selector: Off | Daily | Weekly | Monthly | Yearly */}
              <div className="grid grid-cols-5 p-1 bg-background border border-border/50 rounded-xl gap-1">
                {RECURRENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRecurring(opt.value)}
                    className={cn(
                      "py-2 text-[11px] sm:text-xs font-bold tracking-wider rounded-lg transition-all duration-150 text-center select-none",
                      recurring === opt.value
                        ? "bg-textMain text-background shadow-md font-black"
                        : "text-textMuted hover:text-textMain hover:bg-white/[0.04]"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Recurrence Description / Cadence Rule */}
              <p className="text-[11px] text-textMuted/80 pl-1">
                {getRecurrenceDescription(recurring, taskDateStr)}
              </p>

              {/* If editing a legacy task with weekdays or custom not in the 5 options, preserve it cleanly */}
              {recurring !== 'none' && !RECURRENCE_OPTIONS.some(o => o.value === recurring) && (
                <div className="px-1 text-[11px] text-textMuted italic flex items-center justify-between">
                  <span>Preserving existing recurrence: <strong className="capitalize text-textMain not-italic font-bold">{recurring}</strong></span>
                </div>
              )}

              {/* Optional End Date Selector for Repeating Tasks */}
              {recurring !== 'none' && (
                <div className="flex items-center justify-between pt-2 border-t border-border/10 animate-in fade-in slide-in-from-top-1 duration-200">
                  <span className="text-[10px] font-bold tracking-widest text-textMuted uppercase">End Date</span>
                  <div className="relative flex items-center">
                    <button
                      ref={endDateTriggerRef}
                      type="button"
                      onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                      className="flex items-center gap-2 bg-surface border border-border/60 hover:border-textMuted text-xs font-medium rounded-lg px-3 py-1.5 transition-colors text-textMain"
                      aria-haspopup="dialog"
                      aria-expanded={isDatePickerOpen}
                    >
                      <span>
                        {endDate ? format(new Date(endDate + 'T12:00:00'), 'MMM d, yyyy') : "No end date (ongoing)"}
                      </span>
                      <ChevronDown size={13} className="text-textMuted" />
                    </button>
                    
                    {endDate && (
                      <button
                        type="button"
                        onClick={() => setEndDate('')}
                        className="ml-2 text-[10px] text-textMuted hover:text-red-400 transition-colors underline"
                      >
                        clear
                      </button>
                    )}

                    {isDatePickerOpen && (
                      <DatePickerPopover 
                        selectedDate={endDate ? new Date(endDate + 'T12:00:00') : new Date(taskDateStr + 'T12:00:00')}
                        onSelect={(d) => { setEndDate(format(d, 'yyyy-MM-dd')); setIsDatePickerOpen(false); }}
                        onClose={() => setIsDatePickerOpen(false)}
                        anchorRef={endDateTriggerRef}
                      />
                    )}
                  </div>
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
                className="w-full bg-surface border border-border/60 rounded-xl p-3 text-sm font-medium text-textMain placeholder:text-textMuted/30 focus:outline-none focus:border-textMuted/60 transition-colors resize-none"
              />
            </div>
          </form>

          {/* Footer Action */}
          <div className="p-6 border-t border-border/20 shrink-0 bg-surface">
            <button
              type="submit"
              form="task-form"
              disabled={!name.trim()}
              className="w-full bg-accent text-background font-black text-xs uppercase tracking-[0.2em] py-4 rounded-xl hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent/10"
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
