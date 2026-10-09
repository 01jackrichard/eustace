import { Loader2, Flame, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { motion, type Variants } from 'framer-motion';
import { useFriends } from '../hooks/useFriends';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.15
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 350, damping: 25 } }
};

function PodiumUser({ user, rank, isMe }: { user: any; rank: number; isMe: boolean }) {
  const isFirst = rank === 1;
  const streakVal = user.current_streak;
  const hasStreak = typeof streakVal === 'number' && streakVal > 0;
  const displayName = user.display_name || user.full_name;

  return (
    <motion.div variants={itemVariants} className="flex flex-col items-center group relative w-full">
      <Link to={`/u/${user.username}`} className="flex flex-col items-center w-full group-hover:-translate-y-1.5 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none rounded-2xl p-2 relative">
        {isMe && <div className="absolute inset-0 bg-accent/5 rounded-2xl -z-10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />}
        <div className={cn(
          "text-[10px] md:text-xs font-black mb-3 md:mb-4 transition-colors duration-300", 
          isFirst ? "text-accent" : "text-textMuted/40 group-hover:text-textMuted/60"
        )}>
          #{rank}
        </div>
        
        <div className={cn(
          "rounded-full overflow-hidden flex items-center justify-center shrink-0 mb-4 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] relative",
          isFirst 
            ? "w-20 h-20 md:w-28 md:h-28 border-[3px] border-accent/40 group-hover:border-accent" 
            : "w-14 h-14 md:w-20 md:h-20 border-2 border-border/40 group-hover:border-border/80"
        )}>
          {isMe && <div className="absolute inset-0 ring-4 ring-accent/20 rounded-full scale-110 opacity-0 group-hover:opacity-100 transition-all duration-500" />}
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover z-10 relative" />
          ) : (
            <span className={cn("font-bold text-textMuted z-10 relative", isFirst ? "text-2xl md:text-3xl" : "text-lg md:text-xl")}>
              {displayName?.substring(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        
        <div className="flex items-center justify-center gap-1.5 mb-1 w-full px-2">
          <span className="text-xs md:text-sm font-bold text-textMain truncate transition-colors group-hover:text-white max-w-[90px] md:max-w-[120px] text-center">{displayName}</span>
          {isMe && (
            <span className="text-[9px] font-black tracking-widest uppercase bg-accent/20 text-accent px-1 py-0.5 rounded-sm shrink-0">YOU</span>
          )}
        </div>
        
        <span className="text-[9px] md:text-[10px] text-textMuted font-medium uppercase tracking-wider mb-3 md:mb-4 truncate px-2 max-w-[100px] md:max-w-[130px] text-center">@{user.username}</span>
        
        <div className="flex items-center justify-center gap-1.5">
           {streakVal === null || streakVal === undefined ? (
             <span className="text-xs font-bold text-textMuted/50">-</span>
           ) : (
             <>
               <span className={cn(
                 "font-black tabular-nums tracking-tighter leading-none transition-colors", 
                 isFirst ? "text-xl md:text-2xl" : "text-lg md:text-xl",
                 hasStreak ? "text-textMain group-hover:text-white" : "text-textMuted/60"
               )}>
                 {streakVal}
               </span>
               {hasStreak && <Flame size={isFirst ? 16 : 14} className="text-accent shrink-0" />}
             </>
           )}
        </div>
      </Link>
    </motion.div>
  );
}

function LeaderboardRow({ user, rank, isMe }: { user: any; rank: number; isMe: boolean }) {
  const displayName = user.display_name || user.full_name;
  const streakVal = user.current_streak;
  const hasStreak = typeof streakVal === 'number' && streakVal > 0;

  return (
    <motion.div variants={itemVariants} className="w-full">
      <Link to={`/u/${user.username}`} className={cn(
        "flex items-center gap-4 md:gap-6 px-4 md:px-6 py-3 md:py-4 rounded-2xl transition-all duration-300 group outline-none overflow-hidden relative",
        isMe ? "bg-accent/5 hover:bg-accent/10 border border-accent/20" : "bg-transparent hover:bg-surface/30 border border-transparent"
      )}>
        {isMe && <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent/60" />}
        
        <div className="w-6 md:w-8 text-right shrink-0">
          <span className="text-xs md:text-sm font-black text-textMuted/40 group-hover:text-textMuted/60 transition-colors">#{rank}</span>
        </div>
        
        <div className={cn(
          "w-10 h-10 md:w-12 md:h-12 rounded-full border overflow-hidden shrink-0 flex items-center justify-center transition-all group-hover:scale-105 duration-400 relative",
          isMe ? "bg-accent/10 border-accent/30" : "bg-border/20 border-border/10 group-hover:border-border/40"
        )}>
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover z-10 relative" />
          ) : (
            <span className={cn("text-xs md:text-sm font-bold z-10 relative", isMe ? "text-accent" : "text-textMuted")}>
              {displayName?.substring(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        
        <div className="flex flex-col flex-1 min-w-0 justify-center">
          <div className="flex items-center gap-2">
            <span className="text-sm md:text-base font-bold text-textMain truncate transition-colors group-hover:text-white">
              {displayName}
            </span>
            {isMe && (
              <span className="text-[9px] font-black tracking-widest uppercase bg-accent text-background px-1.5 py-0.5 rounded-sm shrink-0">
                YOU
              </span>
            )}
          </div>
          <span className="text-[10px] md:text-[11px] text-textMuted font-medium uppercase tracking-wider truncate">
            @{user.username}
          </span>
        </div>
        
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0 pl-2">
          {streakVal === null || streakVal === undefined ? (
            <span className="text-xs font-bold text-textMuted/50">-</span>
          ) : (
            <>
              <span className={cn(
                "text-base md:text-lg font-black tabular-nums tracking-tighter transition-colors", 
                hasStreak ? "text-textMain group-hover:text-white" : "text-textMuted/60"
              )}>
                {streakVal}
              </span>
              {hasStreak && <Flame size={14} className="text-accent shrink-0" />}
            </>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

export function TranscendPage() {
  const { user, leaderboardUsers, loading, error } = useFriends();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  const top3 = leaderboardUsers.slice(0, 3);
  const user1 = top3[0];
  const user2 = top3[1];
  const user3 = top3[2];
  const listUsers = leaderboardUsers.slice(3);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-y-auto">
      <div className="flex flex-col w-full mx-auto p-4 md:p-8 lg:p-12 gap-8 md:gap-12 pb-24">
        
        {/* HEADER */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-2 items-center text-center mt-4 md:mt-8"
        >
          <h1 className="text-3xl md:text-4xl font-black text-textMain tracking-tight">TRANSCEND</h1>
          <p className="text-[10px] md:text-xs font-bold text-textMuted tracking-widest uppercase">Consistency, day by day.</p>
        </motion.div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto w-full p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm text-center">
            Failed to load leaderboard: {error.message}
          </motion.div>
        )}

        {leaderboardUsers.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center text-center py-20 px-4 max-w-lg mx-auto w-full border border-border/20 rounded-3xl border-dashed">
            <div className="w-16 h-16 rounded-full bg-surface/50 flex items-center justify-center mb-5">
              <Trophy size={24} className="text-textMuted" />
            </div>
            <span className="text-base font-bold text-textMain mb-2">No streaks yet</span>
            <span className="text-xs md:text-sm text-textMuted max-w-[260px]">Complete tasks or add friends to see rankings.</span>
          </motion.div>
        ) : (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="flex flex-col w-full max-w-4xl mx-auto"
          >
            {/* TOP 3 PODIUM */}
            <div className="flex items-end w-full max-w-2xl mx-auto mb-10 md:mb-16 mt-6 md:mt-8 px-2">
              <div className="w-1/3 flex justify-center">
                {user2 && <PodiumUser user={user2} rank={2} isMe={user2.id === user?.id} />}
              </div>
              <div className="w-1/3 flex justify-center pb-6 md:pb-10">
                {user1 && <PodiumUser user={user1} rank={1} isMe={user1.id === user?.id} />}
              </div>
              <div className="w-1/3 flex justify-center">
                {user3 && <PodiumUser user={user3} rank={3} isMe={user3.id === user?.id} />}
              </div>
            </div>

            {/* RANKED LIST */}
            {listUsers.length > 0 && (
              <div className="flex flex-col w-full max-w-2xl mx-auto gap-1">
                {listUsers.map((lbUser, index) => (
                  <LeaderboardRow 
                    key={lbUser.id} 
                    user={lbUser} 
                    rank={index + 4} 
                    isMe={lbUser.id === user?.id} 
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}