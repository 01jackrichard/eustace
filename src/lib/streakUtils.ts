function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function subtractOneDay(date: Date): Date {
  const prev = new Date(date.getTime());
  prev.setDate(prev.getDate() - 1);
  return prev;
}

export const calculateStreakFromDates = (dateStrings: string[]): number => {
  if (!dateStrings || dateStrings.length === 0) return 0;

  const uniqueDateStrs = new Set(
    dateStrings.map(d => d.split('T')[0]).filter(Boolean)
  );

  if (uniqueDateStrs.size === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayStr = formatLocalDate(today);
  const yesterday = subtractOneDay(today);
  const yesterdayStr = formatLocalDate(yesterday);

  const hasToday = uniqueDateStrs.has(todayStr);
  const hasYesterday = uniqueDateStrs.has(yesterdayStr);

  if (!hasToday && !hasYesterday) {
    return 0;
  }

  let cur = hasToday ? today : yesterday;
  let streak = 0;

  while (uniqueDateStrs.has(formatLocalDate(cur))) {
    streak++;
    cur = subtractOneDay(cur);
  }

  return streak;
};
