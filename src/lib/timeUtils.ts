export function parseTimeString(timeStr: string | undefined): { h: number; m: number } | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s?(AM|PM|am|pm))?$/i);
  if (!match) {
    // try fallback for just hour (e.g. "5 AM" or "22")
    const matchHour = trimmed.match(/^(\d{1,2})(?:\s?(AM|PM|am|pm))?$/i);
    if (!matchHour) return null;
    let h = parseInt(matchHour[1], 10);
    const ampm = matchHour[2]?.toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    if (isNaN(h) || h < 0 || h > 23) return null;
    return { h, m: 0 };
  }
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

export function calculateTaskGeometry(startTime: string | undefined, endTime: string | undefined) {
  const start = parseTimeString(startTime);
  if (!start) return null;
  
  let end = parseTimeString(endTime);
  if (!end) {
    // default duration 1 hour
    end = { h: start.h + 1, m: start.m };
  }
  
  const startDecimal = start.h + start.m / 60;
  let endDecimal = end.h + end.m / 60;
  
  // Guard against negative duration or overnight tasks spanning into the next day (visually cap at 24:00)
  if (endDecimal <= startDecimal) {
    if (endDecimal === 0) endDecimal = 24; // If end is midnight, it means end of the day
    else endDecimal = startDecimal + 1; // Fallback 1 hour duration
  }
  
  return {
    startH: start.h,
    startM: start.m,
    endH: end.h,
    endM: end.m,
    startDecimal,
    endDecimal,
  };
}
