import { Crown, Flame, Loader2, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'motion/react';
import { cn } from '../lib/utils';
import { useFriends } from '../hooks/useFriends';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.035, delayChildren: 0.08 } }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' } }
};

function getDisplayName(user: any) {
  return user.display_name || user.full_name || user.username || 'Eustace member';
}

function getInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function Avatar({ user, size = 'regular' }: { user: any; size?: 'regular' | 'podium' | 'winner' }) {
  const name = getDisplayName(user);
  const sizeClass = size === 'winner'
    ? 'h-[6rem] w-[6rem] border-accent/70 p-[3px] sm:h-[7.5rem] sm:w-[7.5rem]'
    : size === 'podium'
      ? 'h-[4.75rem] w-[4.75rem] border-white/65 p-[3px] sm:h-24 sm:w-24'
      : 'h-11 w-11 border-white/10 sm:h-12 sm:w-12';

  return (
    <span className={cn(
      'flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-[#191b1b] text-sm font-semibold text-white/75',
      sizeClass
    )}>
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}

function PodiumUser({ user, rank, isMe }: { user: any; rank: number; isMe: boolean }) {
  const isFirst = rank === 1;
  const displayName = getDisplayName(user);
  const streak = typeof user.current_streak === 'number' ? user.current_streak : null;

  return (
    <motion.div variants={itemVariants} className="flex h-full items-end">
      <Link
        to={`/u/${user.username}`}
        aria-label={`Rank ${rank}: ${displayName}, ${streak ?? 'unknown'} day current streak${isMe ? ', you' : ''}`}
        className={cn(
          'group relative flex w-full flex-col items-center border-x border-t px-1.5 text-center backdrop-blur-[2px] transition-colors duration-200 sm:px-3',
          isFirst
            ? 'h-[188px] rounded-t-xl border-accent/35 bg-[#0b100e]/85 px-2 pt-7 hover:bg-[#101713]/90 sm:h-[194px]'
            : 'h-[128px] rounded-t-lg border-white/15 bg-[#090a0a]/70 pt-5 hover:bg-[#111313]/80 sm:h-[136px]'
        )}
      >
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[80%]">
          <Avatar user={user} size={isFirst ? 'winner' : 'podium'} />
        </div>
        {isFirst && (
          <Crown size={25} strokeWidth={1.6} aria-hidden="true" className="absolute -top-[7.15rem] left-1/2 -translate-x-1/2 text-amber-200 drop-shadow-[0_1px_8px_rgba(252,211,77,0.28)]" />
        )}
        {!isFirst && (
          <span className="absolute -top-[7rem] left-0 right-0 text-center text-sm font-semibold text-white/70">#{rank}</span>
        )}

        {isFirst && (
          <div className="flex min-h-5 items-center justify-center gap-1.5">
            <span className="text-[11px] font-semibold tabular-nums text-amber-100">#1</span>
            {isMe && <span className="rounded bg-accent/20 px-1 py-0.5 text-[8px] font-bold tracking-wider text-accent">YOU</span>}
          </div>
        )}
        <span className={cn('max-w-full truncate font-semibold text-white', isFirst ? 'mt-1 text-sm' : 'text-xs sm:text-sm')}>
          {displayName}{!isFirst && isMe && <span className="ml-1.5 text-[8px] font-bold tracking-wider text-accent">YOU</span>}
        </span>
        <span className="mt-0.5 max-w-full truncate text-[9px] text-white/50 sm:text-[10px]">@{user.username}</span>
        <div className="mt-auto flex items-center justify-center gap-1.5 pb-2 pt-2 sm:pb-3">
          <span className={cn('font-semibold tabular-nums text-white', isFirst ? 'text-xl' : 'text-lg')}>
            {streak ?? '—'}
          </span>
          {streak !== null && <span className="text-[10px] text-white/55">{streak === 1 ? 'day' : 'days'}</span>}
          {streak !== null && streak > 0 && <Flame size={14} className="text-accent" />}
        </div>
      </Link>
    </motion.div>
  );
}

function LeaderboardRow({ user, rank, isMe }: { user: any; rank: number; isMe: boolean }) {
  const displayName = getDisplayName(user);
  const streak = typeof user.current_streak === 'number' ? user.current_streak : null;

  return (
    <motion.div variants={itemVariants}>
      <Link
        to={`/u/${user.username}`}
        aria-label={`Rank ${rank}: ${displayName}, ${streak ?? 'unknown'} day current streak${isMe ? ', you' : ''}`}
        className={cn(
          'grid grid-cols-[2.25rem_2.5rem_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-3 transition-colors sm:grid-cols-[3.5rem_3.25rem_minmax(0,1fr)_10rem] sm:gap-4 sm:px-6 sm:py-3.5',
          isMe ? 'bg-accent/[0.055] hover:bg-accent/[0.09]' : 'hover:bg-white/[0.035]'
        )}
      >
        <span className={cn('text-right text-xs tabular-nums sm:text-sm', isMe ? 'font-semibold text-accent' : 'text-white/45')}>
          #{rank}
        </span>
        <Avatar user={user} />
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-white/90">{displayName}</span>
            {isMe && <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-accent">YOU</span>}
          </span>
          <span className="truncate text-[10px] text-white/45">@{user.username}</span>
        </span>
        <span className="flex min-w-[3.5rem] items-center justify-end gap-1.5 sm:min-w-0 sm:justify-start">
          <span className={cn('text-sm font-semibold tabular-nums sm:text-base', streak && streak > 0 ? 'text-white/90' : 'text-white/50')}>
            {streak ?? '—'}
          </span>
          <span className="hidden text-[11px] text-white/45 sm:inline">{streak === 1 ? 'day' : 'days'}</span>
          {streak !== null && streak > 0 && <Flame size={14} className="text-accent" />}
        </span>
      </Link>
    </motion.div>
  );
}

export function TranscendPage() {
  const { user, leaderboardUsers, loading, error } = useFriends();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-background">
        <Loader2 className="animate-spin text-accent" size={28} aria-label="Loading leaderboard" />
      </div>
    );
  }

  const topThree = leaderboardUsers.slice(0, 3);
  const second = topThree[1];
  const first = topThree[0];
  const third = topThree[2];
  const remaining = leaderboardUsers.slice(3);

  return (
    <div className="relative isolate -mx-4 -mt-4 min-h-full flex-1 overflow-y-auto bg-[#080909] md:-mx-8 md:-mt-8">
      <section className="relative h-[630px] overflow-hidden bg-[#101211] sm:h-[570px] lg:h-[520px]" aria-label="Transcend leaderboard">
        <img
          src="https://images.unsplash.com/photo-1706213048664-505fd6a7a59b?auto=format&fit=crop&w=2400&q=85"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center grayscale opacity-55"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-[#050606]/35" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#070808]/70 via-[#070808]/15 to-[#070808]/65" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#070808]/45 via-transparent to-[#080909]" />

        <div className="relative z-10 mx-auto h-full max-w-[1500px] px-5 pt-8 sm:px-8 sm:pt-10 lg:px-12">
          <motion.header
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="flex items-start justify-between gap-4"
          >
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-white/60 sm:text-[11px]">Leaderboard</p>
              <h1 className="font-[Philosopher] text-[3.2rem] font-bold uppercase leading-[0.92] tracking-[-0.045em] text-white sm:text-6xl lg:text-[4rem]">
                Transcend
              </h1>
              <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.28em] text-white/70 sm:text-[11px]">
                Consistency, day by day.
              </p>
              <p className="mt-3 text-xs italic text-white/50 sm:text-sm">“Discipline today, a greater tomorrow.”</p>
            </div>

            <div className="mt-1 flex max-w-[9rem] flex-col items-end gap-2 text-right sm:mt-2 sm:max-w-none">
              <span className="flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-2 text-[10px] font-medium text-white/80 backdrop-blur-sm sm:px-4 sm:text-xs">
                <Flame size={14} className="text-accent" /> Current streak
              </span>
              <span className="hidden text-[9px] font-medium uppercase leading-5 tracking-[0.22em] text-white/45 sm:block">
                Your circle · {leaderboardUsers.length} {leaderboardUsers.length === 1 ? 'person' : 'people'}
              </span>
            </div>
          </motion.header>

          {topThree.length > 0 && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="absolute inset-x-5 bottom-0 mx-auto grid max-w-[700px] grid-cols-3 items-end gap-0 px-1 sm:inset-x-8 sm:px-3 lg:bottom-0"
            >
              <div>{second && <PodiumUser user={second} rank={2} isMe={second.id === user?.id} />}</div>
              <div>{first && <PodiumUser user={first} rank={1} isMe={first.id === user?.id} />}</div>
              <div>{third && <PodiumUser user={third} rank={3} isMe={third.id === user?.id} />}</div>
            </motion.div>
          )}
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-1 w-full max-w-[1500px] px-3 pb-10 sm:px-8 lg:px-12">
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-950/50 px-4 py-3 text-sm text-red-200">
            Failed to load leaderboard: {error.message}
          </div>
        )}

        {leaderboardUsers.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0b0c0c]/95 px-5 text-center">
            <Trophy size={23} strokeWidth={1.5} className="mb-4 text-white/45" />
            <h2 className="text-base font-semibold text-white">Your leaderboard is ready</h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-white/50">Add friends and keep a daily streak to see your circle’s progress here.</p>
          </div>
        ) : remaining.length > 0 ? (
          <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#090a0a]/95 shadow-[0_18px_70px_rgba(0,0,0,0.3)] backdrop-blur-md" aria-label="Leaderboard standings">
            <div className="grid grid-cols-[2.25rem_2.5rem_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-white/[0.09] px-3 py-3.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45 sm:grid-cols-[3.5rem_3.25rem_minmax(0,1fr)_10rem] sm:gap-4 sm:px-6 sm:py-4 sm:text-[10px]">
              <span className="text-right">Rank</span>
              <span className="hidden sm:block" />
              <span className="col-span-2 sm:col-span-1">User</span>
              <span className="text-right sm:text-left">Current streak</span>
            </div>
            {remaining.map((entry, index) => (
              <div key={entry.id} className="border-b border-white/[0.065] last:border-0">
                <LeaderboardRow user={entry} rank={index + 4} isMe={entry.id === user?.id} />
              </div>
            ))}
          </section>
        ) : (
          <div className="flex items-center justify-between rounded-2xl border border-white/[0.09] bg-[#090a0a]/95 px-5 py-4 text-sm text-white/50">
            <span className="flex items-center gap-2"><Users size={15} className="text-accent" /> {leaderboardUsers.length} ranked {leaderboardUsers.length === 1 ? 'person' : 'people'}</span>
            <span className="text-[10px] uppercase tracking-[0.15em]">Keep your streak going</span>
          </div>
        )}
      </div>
    </div>
  );
}
