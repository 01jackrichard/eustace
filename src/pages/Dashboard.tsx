import { useState, useMemo } from 'react';
import { calculateStats, getDayCompletionInfo, getTasksForDate, parseTaskMetadata } from '../lib/dataManager';
import type { Task } from '../lib/dataManager';
import { useProductivityData } from '../hooks/useProductivityData';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Plus, Check, X } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { cn } from '../lib/utils';
import { AddTaskModal } from '../components/AddTaskModal';
import { InteractiveHero } from '../components/InteractiveHero';

export function Dashboard() {
  const { checkLocalData, migrateLocalData } = useAuth();
  const [currentYear] = useState<number>(new Date().getFullYear());
  const [heroActivated, setHeroActivated] = useState(() => sessionStorage.getItem('eustace_hero_activated') === 'true');

  const { data, loading, toggleTaskCompletion, addTask } = useProductivityData(currentYear);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const stats = useMemo(() => {
    if (!data) return null;
    return calculateStats(data, currentYear);
  }, [data, currentYear]);

  const hasLocalData = checkLocalData();
  const handleMigrate = async () => {
    setIsMigrating(true);
    await migrateLocalData();
    window.location.reload();
  };

  if (loading || !data || !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-textMuted gap-4">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <p className="text-xs tracking-widest uppercase font-bold">Initializing Workspace</p>
      </div>
    );
  }

  // Time & Dates
  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');


  // Today Data
  const info = getDayCompletionInfo(data, dateStr);
  const todayTasks = getTasksForDate(data, dateStr);
  const dayData = data.days[dateStr] || { tasks: [], completedTaskIds: [], note: '', manualCompletion: false };

  const remainingTasksCount = info.totalCount - info.completedCount;

  // Recent Activity Logic
  const getRecentActivity = () => {
    const recent: { task: Task, date: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const dStr = format(subDays(today, i), 'yyyy-MM-dd');
      const dData = data.days[dStr];
      if (dData && dData.completedTaskIds.length > 0) {
        const dTasks = getTasksForDate(data, dStr);
        dTasks.forEach(t => {
          if (dData.completedTaskIds.includes(t.id)) {
            recent.push({ task: t, date: dStr });
          }
        });
      }
    }
    return recent.slice(0, 4);
  };
  const recentActivity = getRecentActivity();

  return (
    <>
      <div className="animate-fade-in pb-32 max-w-[1200px] mx-auto w-full pt-4 md:pt-8 flex flex-col gap-10">

        <InteractiveHero stats={stats} todayInfo={info} onActivated={() => setHeroActivated(true)} />

        <div className={cn(
          "flex flex-col transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] mt-16 md:mt-24 w-full px-6 md:px-12",
          heroActivated ? "opacity-100 translate-y-0" : "opacity-0 translate-y-24 pointer-events-none hidden"
        )}>

          {/* NEW ACCOUNT EMPTY STATE OVERRIDE */}
          {stats.completedDays === 0 && info.totalCount === 0 && !hasLocalData && (
            <div className="border border-border/20 p-8 md:p-16 text-center flex flex-col items-center justify-center relative overflow-hidden mb-16">
              <div className="absolute inset-0 bg-accent/5 opacity-50 blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col items-center">
                <h2 className="text-3xl md:text-5xl font-black text-textMain tracking-tighter mb-4">WELCOME TO EUSTACE</h2>
                <p className="text-textMuted max-w-md text-sm md:text-base mb-10">
                  Your {currentYear} journey starts today. Start by adding your first task and begin building your momentum.
                </p>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-2 text-textMain hover:text-accent transition-colors font-bold text-xs tracking-widest uppercase"
                >
                  <Plus size={16} strokeWidth={3} /> Create your first task
                </button>
                {isMigrating && (
                  <div className="mt-8 flex items-center gap-2 text-xs font-semibold text-textMuted">
                    <Loader2 className="w-4 h-4 animate-spin" /> Migrating local data...
                  </div>
                )}
                {!isMigrating && checkLocalData() && (
                  <button onClick={handleMigrate} className="mt-8 text-[10px] font-bold tracking-widest uppercase text-textMuted/50 hover:text-textMuted transition-colors underline underline-offset-4">
                    Migrate old local data
                  </button>
                )}
              </div>
            </div>
          )}

          {!(stats.completedDays === 0 && info.totalCount === 0 && !hasLocalData) && (
            <div className="flex flex-col w-full max-w-4xl mx-auto gap-24">

              {/* SECTION 1 - TODAY */}
              <div className="flex flex-col gap-6">
                 <div className="text-[10px] font-bold tracking-[0.3em] text-textMuted uppercase border-b border-border/20 pb-4">
                   TODAY
                 </div>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    <div className="flex flex-col gap-2">
                       <span className="text-4xl md:text-5xl font-black text-textMain tracking-tighter">{String(remainingTasksCount).padStart(2, '0')}</span>
                       <span className="text-[9px] font-bold tracking-widest text-textMuted uppercase">Tasks Remaining</span>
                    </div>
                    <div className="flex flex-col gap-2">
                       <span className="text-4xl md:text-5xl font-black text-textMain tracking-tighter">{info.percent}%</span>
                       <span className="text-[9px] font-bold tracking-widest text-textMuted uppercase">Progress</span>
                    </div>
                    <div className="flex flex-col gap-2">
                       <span className="text-4xl md:text-5xl font-black text-textMain tracking-tighter">{stats.currentStreak}</span>
                       <span className="text-[9px] font-bold tracking-widest text-textMuted uppercase">Day Streak</span>
                    </div>
                    <div className="flex flex-col gap-2">
                       <span className="text-4xl md:text-5xl font-black text-textMain tracking-tighter">{stats.longestStreak}</span>
                       <span className="text-[9px] font-bold tracking-widest text-textMuted uppercase">Longest Streak</span>
                    </div>
                 </div>
              </div>

              {/* SECTION 2 - TODAY'S MISSION / TASKS */}
              <div className="flex flex-col gap-6">
                 <div className="flex items-center justify-between border-b border-border/20 pb-4">
                   <div className="text-[10px] font-bold tracking-[0.3em] text-textMuted uppercase">
                     TODAY'S MISSION
                   </div>
                   <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 text-[9px] font-bold tracking-[0.2em] text-textMain hover:text-accent transition-colors uppercase">
                     <Plus size={12} /> ADD TASK
                   </button>
                 </div>

                 {todayTasks.length === 0 ? (
                    <div className="flex flex-col gap-2 py-8">
                      <span className="text-[10px] font-mono font-bold tracking-widest text-textMuted">01</span>
                      <span className="text-2xl md:text-3xl font-bold text-textMuted/50 tracking-tighter leading-tight uppercase">NO MISSION SET</span>
                      <span className="text-xs font-medium text-textMuted">Your day is waiting.</span>
                    </div>
                 ) : (
                    <div className="flex flex-col gap-2">
                      {todayTasks.map((task, i) => {
                        const meta = parseTaskMetadata(task);
                        const isSkipped = (task.recurring !== 'none' && meta.skippedDates?.includes(dateStr)) || meta.status === 'skipped';
                        const isCompleted = dayData.completedTaskIds.includes(task.id);
                        return (
                          <div
                            key={task.id}
                            onClick={() => !isSkipped && toggleTaskCompletion(task.id, dateStr)}
                            className={cn("flex items-start gap-6 py-4 group border-b border-border/10 last:border-0", !isSkipped && "cursor-pointer")}
                          >
                             <div className="text-[10px] font-mono font-bold tracking-widest text-textMuted pt-1 w-6 shrink-0 group-hover:text-accent transition-colors">
                               {(i + 1).toString().padStart(2, '0')}
                             </div>
                             <div className="flex flex-col flex-1 gap-2">
                               <div className={cn(
                                 "text-xl md:text-2xl font-bold tracking-tighter leading-tight transition-colors uppercase",
                                 isCompleted ? "text-textMuted/50 line-through" : isSkipped ? "text-textMuted/30 line-through" : "text-textMain group-hover:text-accent"
                               )}>
                                 {task.name}
                               </div>
                               {(task.category || task.duration) && (
                                 <div className="text-[9px] font-bold tracking-[0.2em] text-textMuted uppercase flex items-center gap-2">
                                   {task.category && <span>{task.category}</span>}
                                   {task.category && task.duration && <span className="text-border/50">•</span>}
                                   {task.duration && <span>{task.duration}</span>}
                                 </div>
                               )}
                             </div>
                             <div className="pt-1 shrink-0">
                               <div className={cn(
                                 "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                                 isSkipped ? "border-transparent text-textMuted/30" : isCompleted ? "bg-accent border-accent text-background" : "border-border/50 group-hover:border-accent text-transparent group-hover:text-accent/50"
                               )}>
                                 {isSkipped ? <X size={12} /> : <Check size={12} />}
                               </div>
                             </div>
                          </div>
                        );
                      })}
                    </div>
                 )}
              </div>

              {/* SECTION 3 - RECENT ACTIVITY */}
              <div className="flex flex-col gap-6">
                 <div className="text-[10px] font-bold tracking-[0.3em] text-textMuted uppercase border-b border-border/20 pb-4">
                   RECENT ACTIVITY
                 </div>

                 {recentActivity.length === 0 ? (
                    <div className="flex flex-col gap-2 py-8">
                      <span className="text-xs font-bold tracking-widest text-textMuted uppercase">NO ACTIVITY YET</span>
                    </div>
                 ) : (
                    <div className="flex flex-col">
                      {recentActivity.map((activity, i) => (
                        <div key={`${activity.task.id}-${i}`} className="flex items-start gap-6 py-4 border-b border-border/10 last:border-0">
                          <div className="text-[10px] font-bold font-mono tracking-widest text-textMuted pt-1 shrink-0">
                            {format(parseISO(activity.date), 'dd.MM')}
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="text-[9px] font-bold tracking-[0.2em] text-accent uppercase">
                              COMPLETED TASK
                            </div>
                            <div className="text-sm font-bold text-textMain tracking-tight uppercase">
                              {activity.task.name}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                 )}
              </div>

            </div>
          )}

          {/* MODALS */}
          {isAddModalOpen && (
            <AddTaskModal
              date={today}
              onClose={() => setIsAddModalOpen(false)}
              onAdd={(t) => addTask({ ...t, createdAt: dateStr })}
            />
          )}

        </div>
      </div>
    </>
  );
}

