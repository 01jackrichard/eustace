import { useState, useEffect, useRef, useCallback, type WheelEvent as ReactWheelEvent } from 'react';
import { cn } from '../../lib/utils';

export interface WheelTimePickerProps {
  value?: string; // HH:mm 24-hour format (e.g. '09:00', '17:30')
  onChange: (time24: string) => void;
  disabled?: boolean;
  className?: string;
}

const ITEM_HEIGHT = 44; // px per row
const VISIBLE_ITEMS = 3; // 3 visible rows (1 above, center, 1 below)
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS; // 132px

// Parse 24-hour 'HH:mm' string to 12-hour components
export function parse24HourTo12(time24?: string): { hour12: number; minute: number; period: 'AM' | 'PM' } {
  if (!time24 || !time24.includes(':')) {
    const now = new Date();
    const h = now.getHours();
    const m = Math.floor(now.getMinutes() / 5) * 5;
    return {
      hour12: h % 12 || 12,
      minute: m % 60,
      period: h >= 12 ? 'PM' : 'AM'
    };
  }

  const [hStr, mStr] = time24.split(':');
  const h24 = parseInt(hStr, 10);
  const minute = parseInt(mStr, 10) || 0;
  const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 || 12;

  return {
    hour12: Math.min(Math.max(hour12, 1), 12),
    minute: Math.min(Math.max(minute, 0), 59),
    period
  };
}

// Convert 12-hour components to 'HH:mm' 24-hour string
export function convert12To24(hour12: number, minute: number, period: 'AM' | 'PM'): string {
  let h24: number;
  if (period === 'AM') {
    h24 = hour12 === 12 ? 0 : hour12;
  } else {
    h24 = hour12 === 12 ? 12 : hour12 + 12;
  }
  const hh = h24.toString().padStart(2, '0');
  const mm = minute.toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export const DIGIT_ENTRY_TIMEOUT_MS = 800;

export interface MinuteDigitEntryResult {
  newMinute: number;
  newPendingPrefix: string | null;
  shouldSetTimer: boolean;
}

/**
 * Pure state machine for minute-digit keyboard input:
 * 1. Single digits 0–5 can start a two-digit minute: immediately jump to the tens value (4 -> 40),
 *    set pending prefix '4', and start 800ms timer.
 * 2. Digits 6–9 cannot be valid tens digits (60–99 > 59): immediately jump to single-digit value (6 -> 06),
 *    with no pending prefix.
 * 3. A second digit entered within the 800ms window combines with prefix (4 + 7 -> 47).
 */
export function processMinuteDigitEntry(
  key: string,
  currentPendingPrefix: string | null
): MinuteDigitEntryResult | null {
  if (key < '0' || key > '9') return null;

  if (currentPendingPrefix === null) {
    if (key >= '0' && key <= '5') {
      const targetMinute = parseInt(key, 10) * 10;
      return {
        newMinute: targetMinute,
        newPendingPrefix: key,
        shouldSetTimer: true
      };
    } else {
      const targetMinute = parseInt(key, 10);
      return {
        newMinute: targetMinute,
        newPendingPrefix: null,
        shouldSetTimer: false
      };
    }
  } else {
    const combined = parseInt(currentPendingPrefix + key, 10);
    const clamped = Math.max(0, Math.min(59, combined));
    return {
      newMinute: clamped,
      newPendingPrefix: null,
      shouldSetTimer: false
    };
  }
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS: ('AM' | 'PM')[] = ['AM', 'PM'];

export function WheelTimePicker({ value, onChange, disabled, className }: WheelTimePickerProps) {
  const parsed = parse24HourTo12(value);
  const [selectedHour, setSelectedHour] = useState(parsed.hour12);
  const [selectedMinute, setSelectedMinute] = useState(parsed.minute);
  const [selectedPeriod, setSelectedPeriod] = useState(parsed.period);

  const hourColRef = useRef<HTMLDivElement>(null);
  const minuteColRef = useRef<HTMLDivElement>(null);
  const periodColRef = useRef<HTMLDivElement>(null);

  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Intelligent minute digit entry refs
  const pendingMinutePrefixRef = useRef<string | null>(null);
  const digitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingMinuteDigit = useCallback(() => {
    if (digitTimeoutRef.current) {
      clearTimeout(digitTimeoutRef.current);
      digitTimeoutRef.current = null;
    }
    pendingMinutePrefixRef.current = null;
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (digitTimeoutRef.current) clearTimeout(digitTimeoutRef.current);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // Sync internal state when external value changes
  useEffect(() => {
    clearPendingMinuteDigit();
    const next = parse24HourTo12(value);
    setSelectedHour(next.hour12);
    setSelectedMinute(next.minute);
    setSelectedPeriod(next.period);
  }, [value, clearPendingMinuteDigit]);

  // Center column to specific index
  const scrollTo = useCallback((col: HTMLDivElement | null, index: number, smooth = true) => {
    if (!col) return;
    const targetTop = index * ITEM_HEIGHT;
    col.scrollTo({
      top: targetTop,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }, []);

  // Initial alignment on mount and value changes
  useEffect(() => {
    if (isUserScrollingRef.current) return;
    const hourIdx = HOURS.indexOf(selectedHour);
    const minuteIdx = MINUTES.indexOf(selectedMinute);
    const periodIdx = PERIODS.indexOf(selectedPeriod);

    scrollTo(hourColRef.current, hourIdx >= 0 ? hourIdx : 0, false);
    scrollTo(minuteColRef.current, minuteIdx >= 0 ? minuteIdx : 0, false);
    scrollTo(periodColRef.current, periodIdx >= 0 ? periodIdx : 0, false);
  }, [selectedHour, selectedMinute, selectedPeriod, scrollTo]);

  // Handle scroll events with snapping detection
  const handleScroll = (
    col: HTMLDivElement | null,
    items: number[] | string[],
    setter: (val: any) => void
  ) => {
    if (!col || disabled) return;
    // Any direct wheel or touch scroll immediately cancels pending digit prefix
    clearPendingMinuteDigit();
    isUserScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

    scrollTimeoutRef.current = setTimeout(() => {
      const scrollTop = col.scrollTop;
      const index = Math.round(scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(index, items.length - 1));
      const chosen = items[clamped];

      setter(chosen);

      // Trigger change callback with new complete time
      let newHour = selectedHour;
      let newMinute = selectedMinute;
      let newPeriod = selectedPeriod;

      if (typeof chosen === 'number') {
        if (items === HOURS) newHour = chosen;
        else if (items === MINUTES) newMinute = chosen;
      } else {
        newPeriod = chosen as 'AM' | 'PM';
      }

      const formatted24 = convert12To24(newHour, newMinute, newPeriod);
      onChange(formatted24);

      // Snap neatly to item center
      scrollTo(col, clamped, true);
      isUserScrollingRef.current = false;
    }, 80);
  };

  // Prevent wheel events from propagating to parent modal
  const handleColumnWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const handleItemClick = (
    col: HTMLDivElement | null,
    index: number,
    val: any,
    setter: (v: any) => void,
    type: 'hour' | 'minute' | 'period'
  ) => {
    if (disabled) return;
    // Direct selection cancels any pending keyboard sequence immediately
    clearPendingMinuteDigit();
    setter(val);
    scrollTo(col, index, true);

    const newH = type === 'hour' ? val : selectedHour;
    const newM = type === 'minute' ? val : selectedMinute;
    const newP = type === 'period' ? val : selectedPeriod;
    onChange(convert12To24(newH, newM, newP));
  };

  const handleMinuteKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      e.stopPropagation();

      const result = processMinuteDigitEntry(e.key, pendingMinutePrefixRef.current);
      if (!result) return;

      if (digitTimeoutRef.current) {
        clearTimeout(digitTimeoutRef.current);
        digitTimeoutRef.current = null;
      }

      pendingMinutePrefixRef.current = result.newPendingPrefix;
      if (result.shouldSetTimer) {
        digitTimeoutRef.current = setTimeout(() => {
          pendingMinutePrefixRef.current = null;
          digitTimeoutRef.current = null;
        }, DIGIT_ENTRY_TIMEOUT_MS);
      }

      setSelectedMinute(result.newMinute);
      scrollTo(minuteColRef.current, result.newMinute, true);
      onChange(convert12To24(selectedHour, result.newMinute, selectedPeriod));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      clearPendingMinuteDigit();
      const next = Math.max(0, selectedMinute - 1);
      setSelectedMinute(next);
      scrollTo(minuteColRef.current, next, true);
      onChange(convert12To24(selectedHour, next, selectedPeriod));
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      clearPendingMinuteDigit();
      const next = Math.min(59, selectedMinute + 1);
      setSelectedMinute(next);
      scrollTo(minuteColRef.current, next, true);
      onChange(convert12To24(selectedHour, next, selectedPeriod));
      return;
    }

    if (e.key === 'PageUp') {
      e.preventDefault();
      clearPendingMinuteDigit();
      const next = Math.max(0, selectedMinute - 5);
      setSelectedMinute(next);
      scrollTo(minuteColRef.current, next, true);
      onChange(convert12To24(selectedHour, next, selectedPeriod));
      return;
    }

    if (e.key === 'PageDown') {
      e.preventDefault();
      clearPendingMinuteDigit();
      const next = Math.min(59, selectedMinute + 5);
      setSelectedMinute(next);
      scrollTo(minuteColRef.current, next, true);
      onChange(convert12To24(selectedHour, next, selectedPeriod));
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      clearPendingMinuteDigit();
      setSelectedMinute(0);
      scrollTo(minuteColRef.current, 0, true);
      onChange(convert12To24(selectedHour, 0, selectedPeriod));
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      clearPendingMinuteDigit();
      setSelectedMinute(59);
      scrollTo(minuteColRef.current, 59, true);
      onChange(convert12To24(selectedHour, 59, selectedPeriod));
      return;
    }

    if (e.key === 'Escape' || e.key === 'Tab') {
      clearPendingMinuteDigit();
    }
  };

  const handleHourKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = selectedHour === 1 ? 12 : selectedHour - 1;
      const idx = HOURS.indexOf(next);
      setSelectedHour(next);
      scrollTo(hourColRef.current, idx, true);
      onChange(convert12To24(next, selectedMinute, selectedPeriod));
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = selectedHour === 12 ? 1 : selectedHour + 1;
      const idx = HOURS.indexOf(next);
      setSelectedHour(next);
      scrollTo(hourColRef.current, idx, true);
      onChange(convert12To24(next, selectedMinute, selectedPeriod));
      return;
    }
    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const next = parseInt(e.key, 10);
      const idx = HOURS.indexOf(next);
      setSelectedHour(next);
      scrollTo(hourColRef.current, idx, true);
      onChange(convert12To24(next, selectedMinute, selectedPeriod));
      return;
    }
  };

  const handlePeriodKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = selectedPeriod === 'AM' ? 'PM' : 'AM';
      const idx = PERIODS.indexOf(next);
      setSelectedPeriod(next);
      scrollTo(periodColRef.current, idx, true);
      onChange(convert12To24(selectedHour, selectedMinute, next));
      return;
    }
    if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      setSelectedPeriod('AM');
      scrollTo(periodColRef.current, 0, true);
      onChange(convert12To24(selectedHour, selectedMinute, 'AM'));
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      setSelectedPeriod('PM');
      scrollTo(periodColRef.current, 1, true);
      onChange(convert12To24(selectedHour, selectedMinute, 'PM'));
      return;
    }
  };

  return (
    <div
      role="group"
      aria-label="Time picker"
      className={cn(
        "relative w-full bg-[#0a0a0a] border border-border/50 rounded-2xl p-2 select-none overflow-hidden shadow-2xl",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      style={{ height: `${CONTAINER_HEIGHT + 16}px` }}
    >
      {/* Central Selection Highlight Row */}
      <div
        className="absolute left-2 right-2 border-y border-border/60 bg-white/[0.04] rounded-xl pointer-events-none transition-colors"
        style={{
          top: `${ITEM_HEIGHT + 8}px`,
          height: `${ITEM_HEIGHT}px`
        }}
      />

      {/* Top and Bottom Vignette Fades */}
      <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent pointer-events-none z-10" />
      <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent pointer-events-none z-10" />

      {/* 3 Wheel Columns */}
      <div className="relative flex items-center justify-between h-full z-0 px-2">
        {/* HOURS COLUMN */}
        <div
          ref={hourColRef}
          onWheel={handleColumnWheel}
          onScroll={() => handleScroll(hourColRef.current, HOURS, setSelectedHour)}
          onKeyDown={handleHourKeyDown}
          tabIndex={0}
          role="spinbutton"
          aria-label="Hour"
          aria-valuenow={selectedHour}
          aria-valuemin={1}
          aria-valuemax={12}
          aria-valuetext={`${selectedHour} o'clock`}
          className="flex-1 h-full overflow-y-auto no-scrollbar snap-y snap-mandatory focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 rounded-lg"
          style={{ paddingTop: `${ITEM_HEIGHT}px`, paddingBottom: `${ITEM_HEIGHT}px` }}
        >
          {HOURS.map((h, i) => {
            const isSelected = h === selectedHour;
            return (
              <button
                key={`h-${h}`}
                type="button"
                onClick={() => handleItemClick(hourColRef.current, i, h, setSelectedHour, 'hour')}
                className={cn(
                  "w-full snap-center flex items-center justify-center transition-all duration-150 font-bold",
                  isSelected
                    ? "text-textMain text-xl font-black scale-100 opacity-100"
                    : "text-textMuted/50 text-sm scale-90 opacity-40 hover:text-textMuted hover:opacity-75"
                )}
                style={{ height: `${ITEM_HEIGHT}px` }}
              >
                {h.toString().padStart(2, '0')}
              </button>
            );
          })}
        </div>

        {/* TIME SEPARATOR */}
        <div
          className="w-4 flex items-center justify-center font-bold text-lg text-textMuted pointer-events-none"
          style={{ height: `${ITEM_HEIGHT}px` }}
        >
          :
        </div>

        {/* MINUTES COLUMN */}
        <div
          ref={minuteColRef}
          onWheel={handleColumnWheel}
          onScroll={() => handleScroll(minuteColRef.current, MINUTES, setSelectedMinute)}
          onKeyDown={handleMinuteKeyDown}
          onBlur={clearPendingMinuteDigit}
          tabIndex={0}
          role="spinbutton"
          aria-label="Minute"
          aria-valuenow={selectedMinute}
          aria-valuemin={0}
          aria-valuemax={59}
          aria-valuetext={`${selectedMinute.toString().padStart(2, '0')} minutes`}
          className="flex-1 h-full overflow-y-auto no-scrollbar snap-y snap-mandatory focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 rounded-lg"
          style={{ paddingTop: `${ITEM_HEIGHT}px`, paddingBottom: `${ITEM_HEIGHT}px` }}
        >
          {MINUTES.map((m, i) => {
            const isSelected = m === selectedMinute;
            return (
              <button
                key={`m-${m}`}
                type="button"
                onClick={() => handleItemClick(minuteColRef.current, i, m, setSelectedMinute, 'minute')}
                className={cn(
                  "w-full snap-center flex items-center justify-center transition-all duration-150 font-bold",
                  isSelected
                    ? "text-textMain text-xl font-black scale-100 opacity-100"
                    : "text-textMuted/50 text-sm scale-90 opacity-40 hover:text-textMuted hover:opacity-75"
                )}
                style={{ height: `${ITEM_HEIGHT}px` }}
              >
                {m.toString().padStart(2, '0')}
              </button>
            );
          })}
        </div>

        {/* PERIOD (AM/PM) COLUMN */}
        <div
          ref={periodColRef}
          onWheel={handleColumnWheel}
          onScroll={() => handleScroll(periodColRef.current, PERIODS, setSelectedPeriod)}
          onKeyDown={handlePeriodKeyDown}
          tabIndex={0}
          role="spinbutton"
          aria-label="AM or PM"
          aria-valuetext={selectedPeriod}
          className="w-20 h-full overflow-y-auto no-scrollbar snap-y snap-mandatory focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 rounded-lg"
          style={{ paddingTop: `${ITEM_HEIGHT}px`, paddingBottom: `${ITEM_HEIGHT}px` }}
        >
          {PERIODS.map((p, i) => {
            const isSelected = p === selectedPeriod;
            return (
              <button
                key={`p-${p}`}
                type="button"
                onClick={() => handleItemClick(periodColRef.current, i, p, setSelectedPeriod, 'period')}
                className={cn(
                  "w-full snap-center flex items-center justify-center transition-all duration-150 font-bold tracking-wider",
                  isSelected
                    ? "text-textMain text-base font-black scale-100 opacity-100"
                    : "text-textMuted/50 text-xs scale-90 opacity-40 hover:text-textMuted hover:opacity-75"
                )}
                style={{ height: `${ITEM_HEIGHT}px` }}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
