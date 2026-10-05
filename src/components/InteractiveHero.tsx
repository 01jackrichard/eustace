import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

interface InteractiveHeroProps {
  stats: any;
  todayInfo: { completedCount: number; totalCount: number; percent: number };
  onActivated: () => void;
}

const GLYPHS = ['E', 'X', 'I', 'U', '/', 'S', '5', 'T', '+', 'A', '^', 'C', '[', ']', '?', 'E'];

export function InteractiveHero({ stats, todayInfo, onActivated }: InteractiveHeroProps) {
  const { profile } = useAuth();
  const [phase, setPhase] = useState<'initial' | 'scramble' | 'welcome' | 'profile'>(() => {
    return sessionStorage.getItem('eustace_hero_activated') === 'true' ? 'profile' : 'welcome';
  });
  const [scrambledText, setScrambledText] = useState('EUSTACE');
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (phase === 'profile') {
      onActivated();
    }
  }, [phase, onActivated]);

  // Handle scramble effect
  useEffect(() => {
    if (phase !== 'scramble') return;

    let iterations = 0;
    const maxIterations = 20;
    const TARGET = (profile?.display_name || (profile?.display_name || profile?.full_name) || profile?.username || 'FRIEND').split(' ')[0].toUpperCase();

    const interval = setInterval(() => {
      setScrambledText(() =>
        TARGET.split('').map((_, i) => {
          if (iterations > maxIterations - 5 && i < (iterations - (maxIterations - 5)) * 2) {
            return TARGET[i];
          }
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }).join('')
      );

      iterations++;
      if (iterations >= maxIterations) {
        clearInterval(interval);
        setScrambledText(TARGET);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [phase, profile]);

  // Handle welcome sequence
  useEffect(() => {
    if (phase === 'welcome') {
      const timer = setTimeout(() => {
        setPhase('profile');
        sessionStorage.setItem('eustace_hero_activated', 'true');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const displayName = (profile?.display_name || (profile?.display_name || profile?.full_name) || profile?.username || 'FRIEND').split(' ')[0].toUpperCase();

  const now = new Date();
  const dateString = format(now, 'dd MMM yyyy').toUpperCase();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
  const isLeapYear = now.getFullYear() % 4 === 0 && (now.getFullYear() % 100 !== 0 || now.getFullYear() % 400 === 0);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]",
        phase === 'profile' ? "h-[65vh] min-h-[500px]" : "h-[85vh] min-h-[600px] mb-8"
      )}
    >
      <div
        className="absolute inset-0 bg-[#0a0a0a] border border-white/5 rounded-[2rem] overflow-hidden group cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
          if (phase === 'initial') {
            setPhase('scramble');
          } else if (phase === 'scramble' && scrambledText === (profile?.display_name || (profile?.display_name || profile?.full_name) || profile?.username || 'FRIEND').split(' ')[0].toUpperCase()) {
            setPhase('welcome');
          }
        }}
      >
        {/* BACKGROUND DETAILS */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(34,197,94,0.03)_0%,_transparent_60%)] mix-blend-screen" />
          <div className="absolute top-1/2 left-0 w-full h-px bg-white/5 transform -translate-y-1/2" />
          <div className="absolute left-1/2 top-0 w-px h-full bg-white/5 transform -translate-x-1/2" />
          <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />
        </div>

        {/* TINY METADATA */}
        <AnimatePresence>
          {(phase === 'initial' || phase === 'scramble') && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none z-10"
            >
              <div className="absolute top-6 left-6 text-[9px] font-bold tracking-widest text-white/30 uppercase font-mono">
                EUSTACE / 001
              </div>
              <div className="absolute bottom-6 left-6 text-[9px] font-bold tracking-widest text-white/30 uppercase font-mono flex flex-col">
                <span>{dateString}</span>
                <span>DAY {dayOfYear} / {isLeapYear ? 366 : 365}</span>
              </div>
              <div className={cn(
                "absolute bottom-6 right-6 text-[9px] font-bold tracking-widest uppercase font-mono transition-colors duration-500",
                isHovered ? "text-white" : "text-white/30"
              )}>
                ENTER YOUR DAY &rarr;
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6">

          {/* PHASE: INITIAL & SCRAMBLE */}
          <AnimatePresence>
            {(phase === 'initial' || phase === 'scramble') && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              >
                <h1
                  className={cn(
                    "text-white mix-blend-plus-lighter whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                    isHovered && phase === 'initial' ? "blur-[1.5px] opacity-90 scale-[1.005]" : "blur-0 opacity-100 scale-100"
                  )}
                  style={{
                    fontFamily: "'Syncopate', sans-serif",
                    fontWeight: 700,
                    fontSize: 'clamp(80px, 9vw, 155px)',
                    letterSpacing: isHovered && phase === 'initial' ? '-0.02em' : '-0.04em',
                    textShadow: phase === 'scramble' ? '0 0 40px rgba(255,255,255,0.1)' : 'none'
                  }}
                >
                  {scrambledText.split('').map((char, i) => (
                    <span key={i} className={cn(
                      "inline-block transition-all duration-75",
                      phase === 'scramble' && Math.random() > 0.5 && "text-white/80 transform translate-x-[1px] skew-x-2 blur-[1px]"
                    )}>
                      {char}
                    </span>
                  ))}
                </h1>
              </motion.div>
            )}
          </AnimatePresence>

          {/* PHASE: WELCOME */}
          <AnimatePresence>
            {phase === 'welcome' && (
              <motion.div
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                initial={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -20, filter: 'blur(5px)' }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="text-white/70 font-bold tracking-[0.2em] text-sm md:text-base uppercase mb-2">
                  WELCOME,
                </div>
                <div
                  className="text-white uppercase whitespace-nowrap"
                  style={{
                    fontFamily: "'Syncopate', sans-serif",
                    fontWeight: 700,
                    fontSize: 'clamp(40px, 8vw, 90px)',
                    letterSpacing: '-0.04em'
                  }}
                >
                  {displayName}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* PHASE: PROFILE (NEW DASHBOARD HERO) */}
          <AnimatePresence>
            {phase === 'profile' && (
              <motion.div
                className="absolute inset-0 flex flex-col w-full h-full"
                initial={{ opacity: 0, filter: 'blur(10px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              >
                <div className="w-full h-full flex flex-col md:flex-row items-start justify-between pt-16 md:pt-32 px-6 md:px-16">
                  {/* Left Column: Metadata */}
                  <div className="flex flex-col gap-12 w-full md:w-1/3 mb-16 md:mb-0">
                    <motion.div
                      className="flex flex-col"
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5, duration: 1 }}
                    >
                       <span className="text-[10px] font-bold tracking-[0.3em] text-white/40 uppercase mb-4">TODAY</span>
                       <span className="text-xl md:text-2xl font-bold tracking-widest text-white uppercase">{dateString}</span>
                       <span className="text-sm font-bold tracking-[0.2em] text-white/60 uppercase">{format(now, 'EEEE')}</span>
                       <span className="text-[10px] font-bold tracking-[0.15em] text-white/40 uppercase mt-4">DAY {dayOfYear} / {isLeapYear ? 366 : 365}</span>
                    </motion.div>

                    <motion.div
                      className="flex flex-col"
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7, duration: 1 }}
                    >
                       <span className="text-[10px] font-bold tracking-[0.3em] text-white/40 uppercase mb-4">CURRENT STREAK</span>
                       <div className="text-4xl font-black text-white tracking-tighter leading-none">{stats.currentStreak}</div>
                       <span className="text-[10px] font-bold tracking-[0.2em] text-white/60 uppercase mt-2">DAYS</span>
                    </motion.div>
                  </div>

                  {/* Right Column: Statement & Progress */}
                  <div className="flex flex-col md:items-end w-full md:w-2/3 text-left md:text-right h-full pb-12">

                    <motion.div
                      className="text-5xl md:text-[80px] lg:text-[100px] font-black text-white uppercase leading-[0.85] tracking-tighter mb-16 md:mb-0"
                      style={{ fontFamily: "'Syncopate', sans-serif" }}
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 1.2 }}
                    >
                      MAKE<br/>TODAY<br/>COUNT.
                    </motion.div>

                    <motion.div
                      className="flex flex-col md:items-end w-full max-w-md mt-auto"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 1 }}
                    >
                       <span className="text-[10px] font-bold tracking-[0.3em] text-white/40 uppercase mb-4">TODAY'S PROGRESS</span>
                       <div className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-none mb-6">{todayInfo.percent}%</div>

                       <div className="w-full h-[1px] bg-white/20 relative mb-4">
                          <motion.div
                            initial={{ width: 0 }} animate={{ width: `${todayInfo.percent}%` }} transition={{ duration: 1.5, delay: 0.8, ease: [0.16,1,0.3,1] }}
                            className="absolute top-0 left-0 h-[1px] bg-accent shadow-[0_0_12px_rgba(34,197,94,0.4)]"
                          />
                       </div>
                       <span className="text-[9px] font-bold tracking-[0.2em] text-white/50 uppercase">{todayInfo.completedCount} / {todayInfo.totalCount} TASKS</span>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}

