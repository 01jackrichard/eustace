import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Copy, Check, Settings2, ExternalLink, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EditProfileModal } from '../components/EditProfileModal';
import { useProductivityData } from '../hooks/useProductivityData';
import { calculateStats } from '../lib/dataManager';
import { ContributionGraph } from '../components/ContributionGraph';
import { cn } from '../lib/utils';
import { format, parseISO } from 'date-fns';

export function ProfilePage() {
  const { profile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'about'>('overview');
  
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const { data: productivityData } = useProductivityData(currentYear);

  const recentActivity = useMemo(() => {
    if (!productivityData) return [];
    
    const activity: { date: Date, task: any }[] = [];
    
    Object.entries(productivityData.days).forEach(([dateStr, dayData]) => {
      if (dayData.completedTaskIds && dayData.completedTaskIds.length > 0) {
        dayData.completedTaskIds.forEach(id => {
          const task = dayData.tasks.find(t => t.id === id);
          if (task) {
            activity.push({ date: parseISO(dateStr), task });
          }
        });
      }
    });

    return activity.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
  }, [productivityData]);

  const stats = useMemo(() => {
    if (!productivityData) return null;
    return calculateStats(productivityData, new Date().getFullYear());
  }, [productivityData]);

  if (!profile) return null;

  const displayName = profile.display_name || profile.full_name || 'Your Name';
  const username = profile.username;

  const copyProfileLink = () => {
    if (!username) return;
    const url = `${window.location.origin}/u/${username}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="w-full min-h-screen pb-32 animate-fade-in relative">
      
      {/* 1. PROFILE HEADER */}
      <div className="w-full h-48 md:h-64 bg-surface border-b border-border/30 relative overflow-hidden flex items-center justify-center">
        {profile.cover_image_url ? (
          <img src={profile.cover_image_url} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-surface to-background flex items-center justify-center">
            {/* Extremely subtle grid texture for default banner */}
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.03) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 -mt-16 md:-mt-24 relative z-10 flex flex-col">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-8 mb-8 md:mb-12">
          {/* 2. LARGE AVATAR */}
          <div className="flex items-end gap-6 md:gap-8">
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-3xl bg-background border-4 border-background overflow-hidden flex items-center justify-center shrink-0 shadow-2xl">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-surface flex items-center justify-center text-4xl md:text-6xl font-black text-textMuted/30 uppercase tracking-tighter">
                  {displayName.substring(0, 2)}
                </div>
              )}
            </div>

            {/* 3. IDENTITY (Mobile stays below avatar, Desktop aligns right of it) */}
            <div className="flex flex-col gap-1 md:gap-2 mb-2 md:mb-6">
              <h1 className="text-3xl md:text-5xl font-black text-textMain tracking-tighter leading-none break-words max-w-[280px] md:max-w-[400px]">
                {displayName}
              </h1>
              {username && (
                <h2 className="text-xs md:text-sm font-bold tracking-[0.2em] text-textMuted uppercase">
                  @{username}
                </h2>
              )}
            </div>
          </div>

          {/* 4. ACTIONS */}
          <div className="flex flex-wrap items-center gap-3 mb-2 md:mb-6">
            <button 
              onClick={() => setIsEditing(true)}
              className="py-2.5 px-6 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-bold tracking-[0.2em] uppercase rounded-full transition-colors flex items-center gap-2"
            >
              <Settings2 size={14} /> Edit Profile
            </button>
            
            {username && (
              <div className="flex items-center gap-2">
                <Link 
                  to={`/u/${username}`}
                  className="py-2.5 px-6 bg-transparent border border-border/40 hover:border-textMuted/50 text-textMuted hover:text-textMain text-[10px] font-bold tracking-[0.2em] uppercase rounded-full transition-colors flex items-center gap-2"
                >
                  <ExternalLink size={14} /> View
                </Link>
                <button 
                  onClick={copyProfileLink}
                  className="w-10 h-10 flex items-center justify-center bg-transparent border border-border/40 hover:border-textMuted/50 text-textMuted hover:text-textMain rounded-full transition-colors"
                  title="Copy Profile Link"
                >
                  {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 5. STATS */}
        <div className="flex items-center gap-12 md:gap-24 py-8 border-t border-border/20 mb-8 overflow-x-auto no-scrollbar">
          <div className="flex flex-col gap-2 shrink-0">
            <span className="text-3xl md:text-4xl font-black text-textMain tracking-tighter flex items-center h-10">
              {stats ? stats.currentStreak : <Loader2 size={20} className="animate-spin text-textMuted/50" />}
            </span>
            <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-textMuted">Current Streak</span>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <span className="text-3xl md:text-4xl font-black text-textMain tracking-tighter flex items-center h-10">
              {stats ? stats.totalTasksCompleted : <Loader2 size={20} className="animate-spin text-textMuted/50" />}
            </span>
            <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-textMuted">Tasks Completed</span>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <span className="text-3xl md:text-4xl font-black text-textMain tracking-tighter flex items-center h-10">
              {stats ? `${stats.completionRate}%` : <Loader2 size={20} className="animate-spin text-textMuted/50" />}
            </span>
            <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-textMuted">Consistency</span>
          </div>
        </div>

        {/* 6. TABS */}
        <div className="flex items-center gap-8 border-b border-border/20 mb-10">
          <button 
            onClick={() => setActiveTab('overview')}
            className={cn(
              "pb-4 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors relative",
              activeTab === 'overview' ? "text-textMain" : "text-textMuted hover:text-textMain/80"
            )}
          >
            Overview
            {activeTab === 'overview' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-textMain" />}
          </button>
          <button 
            onClick={() => setActiveTab('about')}
            className={cn(
              "pb-4 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors relative",
              activeTab === 'about' ? "text-textMain" : "text-textMuted hover:text-textMain/80"
            )}
          >
            About
            {activeTab === 'about' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-textMain" />}
          </button>
        </div>

        {/* 7. CONTENT */}
        <div className="max-w-2xl">
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-12">
              <div className="text-sm md:text-base font-medium text-textMain/80 leading-relaxed italic">
                {profile.bio ? `"${profile.bio}"` : "You haven't set a bio yet."}
              </div>

              <div className="flex flex-col gap-6 mt-4 mb-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-1">PRODUCTIVITY ACTIVITY</h2>
                    <p className="text-sm font-bold text-textMain tracking-tight">Your year in one view.</p>
                  </div>
                  <div className="bg-[#101010] border border-border/40 rounded-lg px-4 py-[5px] flex items-center gap-3 shadow-inner w-max">
                    <span className="text-sm font-bold text-textMain">{currentYear}</span>
                    <div className="flex flex-col">
                      <button onClick={() => setCurrentYear(y => y + 1)} className="text-textMuted hover:text-textMain leading-none text-[8px] p-0.5">▲</button>
                      <button onClick={() => setCurrentYear(y => y - 1)} className="text-textMuted hover:text-textMain leading-none text-[8px] p-0.5">▼</button>
                    </div>
                  </div>
                </div>
                {productivityData ? (
                  <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
                    <ContributionGraph 
                      year={currentYear} 
                      data={productivityData} 
                      onDayClick={() => {}} 
                    />
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-textMuted/50" />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-6 mt-4">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted">Recent Activity</span>
                {recentActivity.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {recentActivity.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-4 py-3 border-b border-border/10 last:border-0">
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                          <Check size={14} className="text-accent" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-bold text-textMain tracking-tight">Completed '{item.task.name}'</span>
                          <span className="text-[10px] font-bold tracking-widest text-textMuted uppercase">{format(item.date, 'MMMM d, yyyy')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 border border-border/20 rounded-2xl bg-surface/30 flex items-center justify-center text-center">
                    <span className="text-xs font-medium text-textMuted/60">
                      NO ACTIVITY YET
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted">Bio</span>
                <span className="text-sm font-medium text-textMain/90 leading-relaxed">
                  {profile.bio || "No bio set."}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {isEditing && <EditProfileModal onClose={() => setIsEditing(false)} />}
    </div>
  );
}
