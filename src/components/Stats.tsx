import { Flame, Trophy, CalendarCheck, BarChart3, CheckSquare } from 'lucide-react';

interface StatsProps {
  stats: {
    currentStreak: number;
    longestStreak: number;
    completedDays: number;
    completionRate: number;
    daysInYear: number;
    totalTasksCompleted: number;
  }
}

export function Stats({ stats }: StatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatBox 
        label="CURRENT STREAK" 
        value={`${stats.currentStreak} days`} 
        icon={<Flame size={14} className="text-orange-400" />} 
        context={stats.currentStreak === 0 ? "Start your streak today" : "Keep the momentum going"} 
      />
      <StatBox 
        label="LONGEST STREAK" 
        value={`${stats.longestStreak} days`} 
        icon={<Trophy size={14} className="text-yellow-400" />} 
        context="Personal record" 
      />
      <StatBox 
        label="COMPLETED DAYS" 
        value={`${stats.completedDays} / ${stats.daysInYear}`} 
        icon={<CalendarCheck size={14} className="text-accent" />} 
        context={`${new Date().getFullYear()} progress`} 
      />
      <StatBox 
        label="COMPLETION RATE" 
        value={`${stats.completionRate.toFixed(1)}%`} 
        icon={<BarChart3 size={14} className="text-blue-400" />} 
        context="Yearly completion" 
      />
      <StatBox 
        label="TASKS COMPLETED" 
        value={`${stats.totalTasksCompleted}`} 
        icon={<CheckSquare size={14} className="text-purple-400" />} 
        context="Across all days" 
        className="col-span-2 md:col-span-1" 
      />
    </div>
  );
}

function StatBox({ label, value, icon, context, className = "" }: { label: string, value: string, icon: React.ReactNode, context: string, className?: string }) {
  return (
    <div className={`bg-surface border border-border/60 rounded-xl p-3.5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-textMuted/30 group ${className}`}>
      <div className="flex items-center gap-1.5 mb-2 text-textMuted text-[10px] font-bold tracking-widest uppercase">
        {icon}
        <span className="group-hover:text-textMain/80 transition-colors">{label}</span>
      </div>
      <div>
        <div className="text-lg md:text-xl font-bold text-textMain tracking-tight">
          {value}
        </div>
        <div className="text-[10px] text-textMuted mt-0.5 font-medium">
          {context}
        </div>
      </div>
    </div>
  );
}
