import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DailyView } from '../components/DailyView';
import { useProductivityData } from '../hooks/useProductivityData';
import { Loader2 } from 'lucide-react';

export function TasksPage() {
  const location = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (location.state?.date) return new Date(location.state.date);
    return new Date();
  });
  const { data, loading, updateNote, toggleManualCompletion, toggleTaskCompletion, addTask, updateTask, skipTask, deleteTask } = useProductivityData(new Date().getFullYear());

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-textMuted gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <p>Loading your tasks...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-16 pt-4 md:pt-8 max-w-3xl mx-auto w-full px-4 md:px-0">
      <DailyView
        date={selectedDate}
        setDate={setSelectedDate}
        data={data}
        hook={{ updateNote, toggleManualCompletion, toggleTaskCompletion, addTask, updateTask, skipTask, deleteTask }}
      />
    </div>
  );
}
