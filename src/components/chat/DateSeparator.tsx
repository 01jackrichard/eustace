import { isToday, isYesterday, format } from 'date-fns';

interface DateSeparatorProps {
  date: string | Date;
}

export function DateSeparator({ date }: DateSeparatorProps) {
  const d = new Date(date);

  let label: string;
  if (isToday(d)) {
    label = 'Today';
  } else if (isYesterday(d)) {
    label = 'Yesterday';
  } else {
    label = format(d, 'MMMM d, yyyy');
  }

  return (
    <div className="w-full flex items-center justify-center my-4">
      <div className="h-px bg-border/30 flex-1 max-w-[80px]" />
      <span className="px-3 text-[10px] font-bold uppercase tracking-widest text-textMuted/60 bg-surface/30 border border-border/20 rounded-full py-1">
        {label}
      </span>
      <div className="h-px bg-border/30 flex-1 max-w-[80px]" />
    </div>
  );
}
