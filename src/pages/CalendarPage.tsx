import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { YearCalendar } from '../components/YearCalendar';
import { useProductivityData } from '../hooks/useProductivityData';
import { Loader2 } from 'lucide-react';

export function CalendarPage() {
  const navigate = useNavigate();
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const { data, loading } = useProductivityData(new Date().getFullYear());

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-textMuted gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <p>Loading your calendar...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-textMain">Calendar</h1>
          <p className="text-textMuted text-sm mt-1">Your year at a glance.</p>
        </div>
        <div className="flex items-center gap-4 bg-surface px-4 py-2 rounded-xl border border-border">
          <button onClick={() => setCurrentYear(y => y - 1)} className="text-textMuted hover:text-textMain px-2">&larr;</button>
          <span className="font-semibold text-textMain">{currentYear}</span>
          <button onClick={() => setCurrentYear(y => y + 1)} className="text-textMuted hover:text-textMain px-2">&rarr;</button>
        </div>
      </div>
      <div className="bg-surface border border-border/60 rounded-2xl p-6 md:p-8 hover:border-textMuted/30 transition-colors">
        <YearCalendar 
          year={currentYear} 
          data={data} 
          onDayClick={(date) => navigate('/tasks', { state: { date: date.toISOString() } })} 
        />
      </div>
    </div>
  );
}
