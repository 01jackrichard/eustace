import { useState, useMemo, useEffect } from 'react';
import { useProductivityData } from '../hooks/useProductivityData';
import { calculateStats, getDayCompletionInfo } from '../lib/dataManager';
import { Loader2, Target, Zap, CalendarDays, Flame } from 'lucide-react';
import { ContributionGraph } from '../components/ContributionGraph';
import { format, subDays, getDay, getMonth, parseISO, eachDayOfInterval, isAfter, startOfDay } from 'date-fns';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

type Range = '7D' | '30D' | '90D' | '1Y';

export function AnalyticsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [range, setRange] = useState<Range>('1Y');
  const { data, loading } = useProductivityData(currentYear);
  const [hourlyData, setHourlyData] = useState<Record<number, number>>({});
  const [isLoadingHourly, setIsLoadingHourly] = useState(true);

  // Fetch true hourly activity
  useEffect(() => {
    async function fetchHourly() {
      if (!user) return;
      setIsLoadingHourly(true);
      const { data: completions } = await supabase
        .from('task_completions')
        .select('created_at')
        .eq('user_id', user.id);
        
      if (completions) {
        const hours: Record<number, number> = {};
        for (let i = 0; i < 24; i++) hours[i] = 0;
        
        completions.forEach(c => {
          const date = new Date(c.created_at);
          const h = date.getHours();
          hours[h] = (hours[h] || 0) + 1;
        });
        setHourlyData(hours);
      }
      setIsLoadingHourly(false);
    }
    fetchHourly();
  }, [user]);

  const stats = useMemo(() => {
    if (!data) return null;
    return calculateStats(data, currentYear);
  }, [data, currentYear]);

  // Derived Analytics Data
  const analytics = useMemo(() => {
    if (!data || !stats) return null;

    const today = startOfDay(new Date());
    let daysToLookBack = 7;
    let dates: Date[] = [];
    
    if (range === '1Y') {
      const yearStart = new Date(currentYear, 0, 1);
      let yearEnd = new Date(currentYear, 11, 31);
      if (isAfter(yearEnd, today) && currentYear === today.getFullYear()) {
        yearEnd = today;
      }
      dates = eachDayOfInterval({ start: yearStart, end: yearEnd });
    } else {
      daysToLookBack = range === '7D' ? 7 : range === '30D' ? 30 : 90;
      for (let i = daysToLookBack - 1; i >= 0; i--) {
        dates.push(subDays(today, i));
      }
    }
    
    const trendData: any[] = [];
    let completedInPeriod = 0;
    let totalInPeriod = 0;
    let productiveDaysInPeriod = 0;

    for (const d of dates) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const info = getDayCompletionInfo(data, dateStr);
      trendData.push({
        date: d,
        dateStr,
        percent: info.percent,
        completed: info.completedCount,
        total: info.totalCount,
        isProductive: info.completed
      });
      completedInPeriod += info.completedCount;
      totalInPeriod += info.totalCount;
      if (info.completed) productiveDaysInPeriod++;
    }

    const completionRateInPeriod = totalInPeriod > 0 ? (completedInPeriod / totalInPeriod) * 100 : (completedInPeriod > 0 ? 100 : 0);
    const consistencyInPeriod = dates.length > 0 ? (productiveDaysInPeriod / dates.length) * 100 : 0;


    const daysOfWeek = [0, 0, 0, 0, 0, 0, 0];
    const daysOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
    Object.keys(data.days).forEach(dateStr => {
      const info = getDayCompletionInfo(data, dateStr);
      if (info.totalCount > 0) {
        const d = parseISO(dateStr);
        const dayIdx = getDay(d);
        daysOfWeek[dayIdx] += info.percent;
        daysOfWeekCounts[dayIdx] += 1;
      }
    });
    const bestDays = daysOfWeek.map((total, idx) => ({
      day: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][idx],
      avg: daysOfWeekCounts[idx] > 0 ? Math.round(total / daysOfWeekCounts[idx]) : 0,
      count: daysOfWeekCounts[idx]
    }));
    const reorderedBestDays = [...bestDays.slice(1), bestDays[0]];

    const monthly = Array.from({ length: 12 }).map((_, i) => ({ month: i, totalPercent: 0, daysCount: 0 }));
    Object.keys(data.days).forEach(dateStr => {
      const info = getDayCompletionInfo(data, dateStr);
      if (info.totalCount > 0 || info.completed) {
        const d = parseISO(dateStr);
        const m = getMonth(d);
        monthly[m].totalPercent += info.percent;
        monthly[m].daysCount += 1;
      }
    });
    const monthlyPerformance = monthly.map((m, i) => ({
      label: format(new Date(2026, i, 1), 'MMM'),
      avg: m.daysCount > 0 ? Math.round(m.totalPercent / m.daysCount) : 0,
      hasData: m.daysCount > 0
    }));


    return {
      trendData,
      completedInPeriod,
      totalInPeriod,
      productiveDaysInPeriod,
      completionRateInPeriod,
      consistencyInPeriod,
      daysInPeriod: dates.length,
      reorderedBestDays,
      monthlyPerformance
    };
  }, [data, stats, range, currentYear]);

  if (loading || !data || !stats || !analytics) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-textMuted gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <p className="text-sm font-bold tracking-widest uppercase">Building Analytics</p>
      </div>
    );
  }

  const hasData = stats.completedDays > 0;
  const todayInfo = getDayCompletionInfo(data, format(new Date(), 'yyyy-MM-dd'));

  const getInsights = () => {
    const insights = [];
    if (stats.currentStreak >= 3) insights.push({ icon: <Flame className="text-orange-400" size={16}/>, text: `You're currently on a ${stats.currentStreak}-day streak.` });
    let bestDay = analytics.reorderedBestDays.reduce((max, d) => d.avg > max.avg ? d : max, analytics.reorderedBestDays[0]);
    if (bestDay.count > 2) insights.push({ icon: <CalendarDays className="text-accent" size={16}/>, text: `Most productive on ${bestDay.day}s (${bestDay.avg}% avg).` });
    if (analytics.completedInPeriod > 0) insights.push({ icon: <Target className="text-blue-400" size={16}/>, text: `Completed ${analytics.completedInPeriod} tasks this period.` });
    return insights;
  };

  const insights = getInsights();

  return (
    <div className="animate-fade-in pb-20 max-w-6xl mx-auto w-full pt-4 md:pt-6 flex flex-col gap-8 relative z-0">
      
      {/* Background Depth */}
      <div className="fixed inset-0 pointer-events-none z-[-1] flex items-center justify-center overflow-hidden">
        <div className="w-[800px] h-[800px] bg-accent/5 rounded-full blur-[120px] opacity-30 transform -translate-y-1/2" />
      </div>
      
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border/40 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight text-textMain uppercase">ANALYTICS</h1>
            <div className="flex items-center gap-2 bg-background border border-border/60 px-2 py-1 rounded-full">
              <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", hasData ? "bg-accent" : "bg-textMuted")} />
              <span className="text-[9px] font-bold tracking-wider text-textMuted uppercase">{hasData ? "Tracking Active" : "Building History"}</span>
            </div>
          </div>
          <p className="text-textMuted text-sm font-medium leading-snug">Understand your productivity.<br/>Discover your patterns. Build better days.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="bg-[#101010] border border-border/40 rounded-lg p-1 flex items-center shadow-inner">
            {(['7D', '30D', '90D', '1Y'] as Range[]).map(r => (
              <button 
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-md transition-all",
                  range === r ? "bg-surface text-textMain shadow-sm border border-border/60" : "text-textMuted hover:text-textMain hover:bg-surface/50"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="bg-[#101010] border border-border/40 rounded-lg px-4 py-[5px] flex items-center gap-3 shadow-inner">
            <span className="text-sm font-bold text-textMain">{currentYear}</span>
            <div className="flex flex-col">
              <button onClick={() => setCurrentYear(y => y + 1)} className="text-textMuted hover:text-textMain leading-none text-[8px] p-0.5">▲</button>
              <button onClick={() => setCurrentYear(y => y - 1)} className="text-textMuted hover:text-textMain leading-none text-[8px] p-0.5">▼</button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard label="CURRENT STREAK" value={`${stats.currentStreak} days`} emptyText="Active streak" data={analytics.trendData} />
        <KPICard label="LONGEST STREAK" value={`${stats.longestStreak} days`} emptyText="Personal record" data={analytics.trendData} />
        <KPICard label="PRODUCTIVE DAYS" value={`${analytics.productiveDaysInPeriod}`} subvalue={`/ ${analytics.daysInPeriod}`} emptyText={`${analytics.consistencyInPeriod.toFixed(1)}% consistent`} data={analytics.trendData} />
        <KPICard label="COMPLETION RATE" value={`${analytics.completionRateInPeriod.toFixed(1)}%`} emptyText={range === '1Y' ? 'This year' : `Last ${range}`} data={analytics.trendData} />
        <KPICard label="TASKS COMPLETED" value={`${analytics.completedInPeriod}`} emptyText={range === '1Y' ? 'This year' : `Last ${range}`} className="col-span-2 md:col-span-1" data={analytics.trendData} />
      </div>

      {/* 3. HERO CHART & RADIALS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* TREND */}
        <div className="lg:col-span-8 bg-[#101010]/80 backdrop-blur-sm border border-border/40 rounded-2xl p-6 flex flex-col relative overflow-hidden h-[300px] group">
          <div className="flex items-start justify-between relative z-10">
            <div>
              <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-1">PRODUCTIVITY TREND</h2>
              <p className="text-sm font-bold text-textMain tracking-tight">Your productivity over time.</p>
            </div>
            
            {hasData && (
              <div className="bg-[#141414] border border-border/60 rounded-xl px-4 py-2 flex items-center gap-4 shadow-xl">
                <div className="text-[10px] font-bold text-textMuted uppercase tracking-widest">TODAY</div>
                <div className="text-sm font-bold text-textMain">{todayInfo.percent}%</div>
                <div className="w-px h-4 bg-border" />
                <div className="text-sm font-bold text-textMuted">{todayInfo.completedCount} / {todayInfo.totalCount} tasks</div>
              </div>
            )}
          </div>
          
          <div className="flex-1 relative w-full flex items-end z-0 mt-4">
            {!hasData ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-20">
                <div className="w-8 h-8 rounded-full border-2 border-dashed border-border flex items-center justify-center mb-3">
                  <div className="w-2 h-2 rounded-full bg-textMuted/30" />
                </div>
                <p className="text-sm font-bold text-textMuted">No productivity data yet</p>
                <p className="text-[11px] text-textMuted/60 mt-1 max-w-xs leading-relaxed mb-4">Complete your first few tasks to start building your productivity trend.</p>
                <button onClick={() => navigate('/')} className="text-[10px] font-bold uppercase tracking-wider bg-background border border-border/60 px-4 py-2 rounded-lg hover:text-textMain hover:border-textMuted transition-colors">Add Task</button>
              </div>
            ) : null}

            {/* Ghost line if empty, real if data */}
            <div className={cn("w-full h-full relative group/chart", !hasData && "opacity-20 pointer-events-none")}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="area-gradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                
                {[0, 25, 50, 75, 100].map(val => (
                  <line key={val} x1="0" y1={100 - val} x2="100" y2={100 - val} stroke="#222" strokeWidth="0.5" />
                ))}

                {hasData ? (
                  <>
                    <polygon 
                      points={`0,100 ${analytics.trendData.map((d, i) => `${(i / (analytics.trendData.length - 1 || 1)) * 100},${100 - d.percent}`).join(' ')} 100,100`} 
                      fill="url(#area-gradient)" 
                      className="animate-fade-in"
                    />
                    <polyline 
                      points={analytics.trendData.map((d, i) => `${(i / (analytics.trendData.length - 1 || 1)) * 100},${100 - d.percent}`).join(' ')} 
                      fill="none" 
                      stroke="#22c55e" 
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                    />
                  </>
                ) : (
                  // Placeholder wave
                  <polyline 
                    points="0,90 20,70 40,85 60,40 80,60 100,20" 
                    fill="none" 
                    stroke="#444" 
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </div>
          </div>
        </div>

        {/* RADIALS */}
        <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-6">
          {/* Consistency */}
          <div className="bg-[#101010]/80 backdrop-blur-sm border border-border/40 rounded-2xl p-6 flex-1 flex items-center justify-between relative overflow-hidden group">
            <div className="flex flex-col h-full justify-between z-10">
              <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase">CONSISTENCY</h2>
              <div>
                {!hasData ? (
                  <div className="text-xs font-bold text-textMuted/70 leading-tight max-w-[100px]">Complete tasks to build consistency</div>
                ) : (
                  <>
                    <div className="text-xs text-textMuted mb-1 leading-snug">Based on:<br/>Productive days<br/>Completion rate<br/>Streak stability</div>
                  </>
                )}
              </div>
            </div>
            
            <div className="relative w-24 h-24 shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-background border" />
                {hasData && (
                  <circle 
                    cx="48" cy="48" r="40" 
                    stroke="currentColor" 
                    strokeWidth="6" 
                    fill="transparent" 
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={(2 * Math.PI * 40) * (1 - analytics.consistencyInPeriod / 100)}
                    strokeLinecap="round"
                    className="text-accent drop-shadow-[0_0_6px_rgba(34,197,94,0.4)] transition-all duration-1000 ease-out" 
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {hasData ? (
                  <>
                    <span className="text-2xl font-bold text-textMain leading-none">{Math.round(analytics.consistencyInPeriod)}</span>
                    <span className="text-[8px] font-bold text-textMuted">/100</span>
                  </>
                ) : (
                  <span className="text-xl font-bold text-textMuted/40">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="bg-[#101010]/80 backdrop-blur-sm border border-border/40 rounded-2xl p-6 flex-1 flex items-center justify-between relative overflow-hidden group">
            <div className="flex flex-col h-full justify-between z-10">
              <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-2">TASK COMPLETION</h2>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", hasData ? "bg-accent" : "bg-textMuted/30")} />
                  <span className="text-[10px] font-bold text-textMain">{hasData ? analytics.completedInPeriod : 0} <span className="text-textMuted">Completed</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-border" />
                  <span className="text-[10px] font-bold text-textMain">{hasData ? analytics.totalInPeriod - analytics.completedInPeriod : 0} <span className="text-textMuted">Remaining</span></span>
                </div>
              </div>
            </div>

            <div className="relative w-24 h-24 shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="48" cy="48" r="34" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-background" />
                {hasData && analytics.totalInPeriod > 0 && (
                  <circle 
                    cx="48" cy="48" r="34" 
                    stroke="currentColor" 
                    strokeWidth="8" 
                    fill="transparent" 
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={(2 * Math.PI * 34) * (1 - analytics.completedInPeriod / analytics.totalInPeriod)}
                    strokeLinecap="round"
                    className="text-accent" 
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-textMain">{hasData && analytics.totalInPeriod > 0 ? Math.round((analytics.completedInPeriod/analytics.totalInPeriod)*100) : 0}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. WEEKLY & BEST DAYS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Weekly */}
        <div className="bg-[#101010]/80 backdrop-blur-sm border border-border/40 rounded-2xl p-6 h-[220px] flex flex-col">
          <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-4">WEEKLY PRODUCTIVITY <span className="text-textMuted/50">(Last 7 days)</span></h2>
          <div className="flex items-end justify-between flex-1 gap-2">
            {analytics.trendData.slice(-7).map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-2 flex-1 h-full group relative cursor-crosshair">
                <div className="w-full bg-[#141414] rounded-sm flex flex-col justify-end h-full relative overflow-hidden transition-colors">
                  {hasData ? (
                    <div 
                      className="w-full bg-accent/90 rounded-sm transition-all duration-700 ease-out hover:bg-accent"
                      style={{ height: `${d.percent}%`, minHeight: d.total > 0 ? '4px' : '0' }}
                    />
                  ) : (
                    <div className="w-full bg-textMuted/10 rounded-sm" style={{ height: `${[20,40,10,60,30,80,10][i]}%` }} />
                  )}
                  {hasData && (
                    <div className="absolute bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 bg-[#141414] border border-border/60 text-textMain p-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-50 whitespace-nowrap min-w-max">
                      <div className="text-[10px] font-bold mb-1">{format(d.date, 'EEEE')}</div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-textMuted">{d.completed}/{d.total} tasks</span>
                        <span className="text-[11px] text-accent font-bold">{d.percent}%</span>
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[9px] font-bold text-textMuted/70 tracking-wider">{format(d.date, 'EEE')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Best Days */}
        <div className="bg-[#101010]/80 backdrop-blur-sm border border-border/40 rounded-2xl p-6 h-[220px] flex flex-col">
          <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-4">BEST DAYS</h2>
          <div className="flex-1 flex flex-col justify-between">
            {!hasData ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[11px] font-bold text-textMuted/50 max-w-[200px] text-center">Your weekly pattern will appear here as you build more history.</p>
              </div>
            ) : (
              analytics.reorderedBestDays.map(d => (
                <div key={d.day} className="flex items-center gap-4 group">
                  <div className="w-8 text-[9px] font-bold text-textMuted tracking-wider group-hover:text-textMain transition-colors">{d.day}</div>
                  <div className="flex-1 h-1.5 bg-[#141414] rounded-full overflow-hidden relative">
                    <div className="absolute top-0 left-0 h-full bg-textMuted/70 group-hover:bg-textMain transition-all duration-700" style={{ width: `${d.avg}%` }} />
                  </div>
                  <div className="w-8 text-right text-[10px] font-bold text-textMain">{d.avg}%</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 5. HEATMAP */}
      <div className="bg-[#101010]/80 backdrop-blur-sm border border-border/40 rounded-2xl p-6 md:p-8">
        <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-1">PRODUCTIVITY ACTIVITY</h2>
        <p className="text-sm font-bold text-textMain tracking-tight mb-2">Your year in one view.</p>
        
        <div className="-mx-2 sm:mx-0">
          <ContributionGraph 
            year={currentYear} 
            data={data} 
            onDayClick={() => navigate('/tasks')} 
          />
        </div>
      </div>

      {/* 6. BOTTOM STRIP */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* WHEN YOU WORK */}
        <div className="bg-[#101010]/80 backdrop-blur-sm border border-border/40 rounded-2xl p-6 h-[240px] flex flex-col">
          <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-4">WHEN YOU WORK</h2>
          
          {isLoadingHourly ? (
             <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-textMuted/30 w-5 h-5"/></div>
          ) : Object.values(hourlyData).some(v => v > 0) ? (
            <div className="flex flex-col gap-2 flex-1 justify-center">
              {[6, 8, 10, 12, 14, 16, 18, 20].map(h => {
                const val = (hourlyData[h] || 0) + (hourlyData[h+1] || 0); 
                const max = Math.max(...Object.values(hourlyData)) * 2 || 1;
                const percent = (val / max) * 100;
                
                return (
                  <div key={h} className="flex items-center gap-3 group">
                    <div className="w-10 text-[9px] font-bold text-textMuted tracking-wider text-right group-hover:text-textMain transition-colors">
                      {format(new Date().setHours(h), 'ha')}
                    </div>
                    <div className="flex-1 h-1.5 flex items-center">
                      {val === 0 ? (
                        <div className="w-full border-b border-border/20" />
                      ) : (
                        <div className="h-full bg-textMuted/60 group-hover:bg-accent rounded-full transition-colors" style={{ width: `${percent}%`, minWidth: '4px' }} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <p className="text-[11px] font-bold text-textMuted/50 max-w-[200px]">Complete more timed tasks to discover when you're most productive.</p>
              <div className="flex flex-col gap-2 w-full mt-4 px-8 opacity-20">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center gap-3"><div className="w-6 h-1 bg-border rounded" /><div className="h-1 bg-border flex-1 rounded" style={{width: `${Math.random()*50}%`}}/></div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* MONTHLY PERFORMANCE */}
        <div className="bg-[#101010]/80 backdrop-blur-sm border border-border/40 rounded-2xl p-6 h-[240px] flex flex-col">
          <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-4">MONTHLY PERFORMANCE</h2>
          <div className="flex-1 flex flex-col justify-between">
            {hasData ? (
              analytics.monthlyPerformance.map(m => (
                <div key={m.label} className="flex items-center gap-3 group">
                  <div className={cn("w-6 text-[9px] font-bold tracking-wider transition-colors", m.hasData ? "text-textMuted group-hover:text-textMain" : "text-border")}>{m.label}</div>
                  <div className="flex-1 h-1.5 bg-[#141414] rounded-full overflow-hidden relative">
                    {m.hasData && <div className="absolute top-0 left-0 h-full bg-textMuted/70 group-hover:bg-textMain transition-all duration-700" style={{ width: `${m.avg}%` }} />}
                  </div>
                  {m.hasData ? <div className="w-6 text-[9px] font-bold text-textMain text-right">{m.avg}%</div> : <div className="w-6" />}
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col justify-between opacity-30">
                {['JAN','FEB','MAR','APR','MAY','JUN'].map(m => (
                  <div key={m} className="flex items-center gap-3">
                    <div className="w-6 text-[9px] font-bold text-border">{m}</div>
                    <div className="flex-1 h-1.5 bg-background rounded-full" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* INSIGHTS */}
        <div className="bg-gradient-to-br from-[#121212] to-[#0a0a0a] border border-border/40 rounded-2xl p-6 h-[240px] flex flex-col relative overflow-hidden group">
          <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
          <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-6 relative z-10">PRODUCTIVITY INSIGHTS</h2>
          
          <div className="flex flex-col gap-4 flex-1 justify-center relative z-10">
            {!hasData ? (
              <div className="flex flex-col items-center justify-center text-center">
                <Zap size={20} className="text-textMuted/30 mb-3" />
                <p className="text-xs font-bold text-textMuted mb-2">Your insights are waiting.</p>
                <p className="text-[10px] text-textMuted/60 leading-relaxed max-w-[200px]">Complete a few more days and we'll identify your most productive days, hours, and consistency patterns.</p>
              </div>
            ) : (
              insights.map((insight, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5 opacity-80">{insight.icon}</div>
                  <p className="text-xs font-bold text-textMain leading-tight">{insight.text}</p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}

function KPICard({ label, value, subvalue, emptyText, className = "", data }: { label: string, value: string, subvalue?: string, emptyText: string, className?: string, data: any[] }) {
  const hasData = data && data.length > 0 && data.some(d => d.percent > 0);
  
  return (
    <div className={cn("bg-[#101010]/80 backdrop-blur-sm border border-border/40 rounded-xl p-4 flex flex-col justify-between transition-all duration-300 hover:border-textMuted/40 group", className)}>
      <div>
        <div className="text-[9px] font-bold tracking-widest text-textMuted uppercase mb-2">{label}</div>
        <div className="text-2xl font-bold text-textMain tracking-tight mb-1 flex items-baseline gap-1">
          {value}
          {subvalue && <span className="text-xs font-bold text-textMuted">{subvalue}</span>}
        </div>
        <div className="text-[10px] font-bold text-textMuted/70">{hasData ? emptyText : emptyText}</div>
      </div>
      
      <div className="mt-4 pt-3 border-t border-border/30 h-8 flex items-end">
        {hasData ? (
           <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-full opacity-50 group-hover:opacity-100 transition-opacity">
             <polyline 
               points={data.slice(-14).map((d, i) => `${(i / (Math.min(data.length, 14) - 1 || 1)) * 100},${20 - (d.percent/100)*20}`).join(' ')} 
               fill="none" 
               stroke="#22c55e" 
               strokeWidth="1.5"
               strokeLinejoin="round"
             />
           </svg>
        ) : (
           <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-full opacity-20">
             <line x1="0" y1="10" x2="100" y2="10" stroke="#444" strokeWidth="1" strokeDasharray="2,2" />
           </svg>
        )}
      </div>
    </div>
  );
}
