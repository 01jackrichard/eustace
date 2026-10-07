import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Menu, X, ArrowRight, Check, Users, FileText, BarChart2, CornerDownRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { PublicIntro } from '../components/PublicIntro';

export function Landing() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [introFinished, setIntroFinished] = useState(() => sessionStorage.getItem('eustace_public_intro') === 'true');
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (user) return <Navigate to="/dashboard" replace />;

  if (!introFinished) {
    return <PublicIntro onComplete={() => { sessionStorage.setItem('eustace_public_intro', 'true'); setIntroFinished(true); }} />;
  }

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Mock data for previews
  const mockTasks = [
    { id: '1', name: 'Morning protocol & review', category: 'routine', completed: true },
    { id: '2', name: 'Write landing page copy', category: 'work', completed: true },
    { id: '3', name: 'Deploy production build', category: 'work', completed: false },
    { id: '4', name: 'Read 20 pages', category: 'learning', completed: false }
  ];

  const mockNotes = [
    { title: 'Project Eustace Architecture', tags: ['#dev', '#planning'], date: 'Today' },
    { title: 'Q4 Personal Goals', tags: ['#goals'], date: 'Yesterday' },
    { title: 'Book Notes: Atomic Habits', tags: ['#reading'], date: 'Oct 02' }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-textMain selection:bg-accent/30 font-sans overflow-x-hidden">

      {/* SECTION 00 — NAVIGATION */}
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b pt-[env(safe-area-inset-top)]",
        scrolled ? "bg-[#050505]/95 backdrop-blur-md border-border/20 py-4" : "bg-transparent border-transparent py-6"
      )}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex justify-between items-center">
          <button onClick={() => scrollTo('hero')} className="font-bold tracking-[0.3em] uppercase text-textMain hover:text-white transition-colors">Eustace</button>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-8">
            <button onClick={() => scrollTo('tasks')} className="text-[10px] font-bold tracking-widest uppercase text-textMuted hover:text-textMain transition-colors">Product</button>
            <button onClick={() => scrollTo('the-system')} className="text-[10px] font-bold tracking-widest uppercase text-textMuted hover:text-textMain transition-colors">How it works</button>
            <button onClick={() => scrollTo('tasks')} className="text-[10px] font-bold tracking-widest uppercase text-textMuted hover:text-textMain transition-colors">Features</button>
            <button onClick={() => scrollTo('friends')} className="text-[10px] font-bold tracking-widest uppercase text-textMuted hover:text-textMain transition-colors">Friends</button>
            <button onClick={() => scrollTo('analytics')} className="text-[10px] font-bold tracking-widest uppercase text-textMuted hover:text-textMain transition-colors">Analytics</button>
          </div>

          <div className="hidden lg:flex items-center gap-6">
            <Link to="/login" className="text-[10px] font-bold tracking-widest uppercase text-textMain hover:text-accent transition-colors">Log In</Link>
            <Link to="/signup" className="px-5 py-2 bg-textMain text-background hover:bg-white text-[10px] font-bold tracking-widest uppercase transition-colors rounded-sm">Get Started</Link>
          </div>

          {/* Mobile Toggle */}
          <button className="lg:hidden text-textMain" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Nav */}
        <div className={cn(
          "lg:hidden absolute top-full left-0 w-full bg-[#050505]/95 backdrop-blur-xl border-b border-border/20 transition-all duration-300 overflow-hidden",
          mobileMenuOpen ? "max-h-screen py-6 px-6 opacity-100" : "max-h-0 opacity-0 py-0 px-6 border-transparent"
        )}>
          <div className="flex flex-col gap-6">
            <button onClick={() => scrollTo('tasks')} className="text-left text-sm font-bold tracking-widest uppercase text-textMuted hover:text-textMain">Product</button>
            <button onClick={() => scrollTo('the-system')} className="text-left text-sm font-bold tracking-widest uppercase text-textMuted hover:text-textMain">How it works</button>
            <button onClick={() => scrollTo('tasks')} className="text-left text-sm font-bold tracking-widest uppercase text-textMuted hover:text-textMain">Features</button>
            <button onClick={() => scrollTo('friends')} className="text-left text-sm font-bold tracking-widest uppercase text-textMuted hover:text-textMain">Friends</button>
            <button onClick={() => scrollTo('analytics')} className="text-left text-sm font-bold tracking-widest uppercase text-textMuted hover:text-textMain">Analytics</button>
            <div className="w-full h-px bg-border/20 my-2" />
            <Link to="/login" className="text-sm font-bold tracking-widest uppercase text-textMain">Log In</Link>
            <Link to="/signup" className="w-full py-4 bg-textMain text-background text-center text-sm font-bold tracking-widest uppercase rounded-sm">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* SECTION 01 — HERO */}
      <section id="hero" className="relative min-h-screen flex flex-col items-center justify-between pt-24 md:pt-32 pb-8 overflow-hidden bg-[#050505]">
        {/* Eyebrow */}
        <div className="relative z-20 text-[9px] md:text-[10px] font-bold tracking-[0.4em] uppercase text-textMuted mt-4 md:mt-8 text-center px-6 opacity-0 animate-[fade-in-down_1s_ease-out_forwards]" style={{ animationDelay: '0.2s' }}>
          A Personal Productivity Operating System
        </div>

        {/* The Hands Asset */}
        <div
          className="relative w-full h-[35vh] md:h-[45vh] flex items-center justify-center z-0 opacity-0 animate-[hands-settle_1.4s_cubic-bezier(0.2,0.8,0.2,1)_forwards]"
          style={{ animationDelay: '0.4s' }}
        >
          {/* Extreme smooth gradients to completely destroy the image edges */}
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[#050505] via-[#050505]/60 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-[#050505] via-[#050505]/50 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-[#050505] via-[#050505]/50 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_10%,_#050505_100%)] z-10 pointer-events-none opacity-90" />

          <img
            src="/hero-hands-hd.png"
            alt="Eustace Classical Hands"
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{ transform: `translateY(${scrollY * 0.15}px)` }}
          />
        </div>

        {/* Typography Content */}
        <div className="relative z-20 flex flex-col items-center text-center max-w-5xl mx-auto w-full px-6 mb-12">
          <h1 className="text-4xl sm:text-6xl md:text-[80px] lg:text-[90px] hero-philosopher tracking-tight leading-[1] text-textMain mb-6 opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards] whitespace-nowrap" style={{ animationDelay: '0.8s' }}>
            TURN INTENTION<br />INTO ACTION.
          </h1>

          <p className="text-sm md:text-base text-textMuted max-w-2xl font-medium mx-auto mb-10 opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards] leading-relaxed" style={{ animationDelay: '1.0s' }}>
            Eustace helps you turn everyday tasks into measurable progress — track your work, understand your consistency, and build momentum over time.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-6 opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards] w-full sm:w-auto" style={{ animationDelay: '1.2s' }}>
            <Link to="/signup" className="flex items-center gap-3 px-8 py-4 bg-textMain text-background hover:bg-white text-[10px] md:text-xs font-bold tracking-widest uppercase transition-all duration-300 rounded-sm w-full sm:w-auto justify-center">
              Get Started <ArrowRight size={16} />
            </Link>
            <button onClick={() => scrollTo('why-eustace')} className="flex items-center justify-center px-8 py-4 bg-transparent border border-border/40 hover:bg-white/5 text-textMain text-[10px] md:text-xs font-bold tracking-widest uppercase transition-all duration-300 rounded-sm w-full sm:w-auto">
              Explore Eustace
            </button>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="relative z-20 flex flex-col items-center gap-2 opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards] mb-4 hidden md:flex" style={{ animationDelay: '1.4s' }}>
          <span className="text-[8px] font-bold tracking-[0.3em] uppercase text-textMuted">Scroll</span>
          <div className="w-px h-6 bg-textMuted animate-[pulse_2s_ease-in-out_infinite]" />
        </div>
      </section>

      {/* SECTION 02 — WHY EUSTACE */}
      <section id="why-eustace" className="py-24 md:py-32 px-6 flex flex-col items-center justify-center text-center bg-[#050505]">
        <div className="max-w-4xl mx-auto w-full">
          <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">Philosophy</div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-8">
            INTENTION MEANS NOTHING<br />WITHOUT ACTION.
          </h2>
          <p className="text-sm md:text-base text-textMuted max-w-2xl mx-auto leading-relaxed">
            Most productivity tools are just infinite lists. Eustace is built to turn your intentions into repeatable systems. By tracking your daily execution, Eustace turns scattered actions into measurable momentum.
          </p>
        </div>
      </section>

      {/* SECTION 03 — THE SYSTEM */}
      <section id="the-system" className="py-24 md:py-32 px-6 bg-[#050505] border-y border-border/10">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">The System</div>
            <h2 className="text-2xl md:text-4xl font-black tracking-tight leading-tight mb-4">
              A COMPLETE OPERATING SYSTEM
            </h2>
            <p className="text-sm text-textMuted max-w-xl mx-auto">
              Everything you need to organize your life, connected in one unified interface.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-4 lg:gap-8 relative">
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-border/20 -translate-y-1/2 z-0" />
            
            <div className="relative z-10 flex flex-col items-center text-center bg-[#050505] py-4">
              <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mb-4">
                <FileText className="text-textMuted" size={20} />
              </div>
              <h3 className="text-sm font-bold tracking-widest uppercase mb-2">Plan</h3>
              <p className="text-xs text-textMuted leading-relaxed">Write your goals, strategies, and notes in the vault.</p>
            </div>

            <div className="relative z-10 flex flex-col items-center text-center bg-[#050505] py-4">
              <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mb-4">
                <Check className="text-textMuted" size={20} />
              </div>
              <h3 className="text-sm font-bold tracking-widest uppercase mb-2">Execute</h3>
              <p className="text-xs text-textMuted leading-relaxed">Check off your daily and recurring tasks.</p>
            </div>

            <div className="relative z-10 flex flex-col items-center text-center bg-[#050505] py-4">
              <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mb-4">
                <BarChart2 className="text-textMuted" size={20} />
              </div>
              <h3 className="text-sm font-bold tracking-widest uppercase mb-2">Track</h3>
              <p className="text-xs text-textMuted leading-relaxed">Measure your completion rate and consistency.</p>
            </div>

            <div className="relative z-10 flex flex-col items-center text-center bg-[#050505] py-4">
              <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mb-4">
                <Users className="text-textMuted" size={20} />
              </div>
              <h3 className="text-sm font-bold tracking-widest uppercase mb-2">Reflect</h3>
              <p className="text-xs text-textMuted leading-relaxed">Stay accountable with your closest friends.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 04 — TASKS */}
      <section id="tasks" className="py-24 md:py-32 px-6 bg-background">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div className="order-2 lg:order-1 relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 to-transparent opacity-50 rounded-lg blur-2xl" />
            <div className="relative bg-surface border border-border/50 rounded-md p-6 md:p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-border/20">
                <div className="text-xs font-bold tracking-widest uppercase">Today</div>
                <div className="text-[10px] text-textMuted font-bold uppercase tracking-widest">4 Tasks</div>
              </div>
              <div className="flex flex-col gap-3">
                {mockTasks.map((task) => (
                  <div key={task.id} className={cn(
                    "group flex items-center gap-4 p-3 md:p-4 rounded-sm border transition-colors",
                    task.completed ? "bg-surfaceHover border-border/30" : "bg-background border-border/60 hover:border-border"
                  )}>
                    <div className={cn(
                      "w-5 h-5 flex-shrink-0 flex items-center justify-center border rounded-[3px] transition-all duration-300",
                      task.completed ? "bg-textMain border-textMain text-background" : "border-textMuted/40 group-hover:border-textMain"
                    )}>
                      {task.completed && <Check size={14} strokeWidth={3} />}
                    </div>
                    <div className={cn(
                      "flex-1 text-sm md:text-base font-medium transition-all duration-300",
                      task.completed ? "text-textMuted line-through" : "text-textMain"
                    )}>
                      {task.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">Execution</div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-6">
              TASKS ARE NOT IDEAS.<br />THEY ARE ACTIONS.
            </h2>
            <p className="text-sm md:text-base text-textMuted leading-relaxed mb-6">
              The Eustace task system is designed for execution. Manage your daily actions, set recurring habits, and build consistency.
            </p>
            <ul className="flex flex-col gap-3 text-sm text-textMuted">
              <li className="flex items-center gap-3"><Check size={16} className="text-textMain" /> Daily & recurring tasks</li>
              <li className="flex items-center gap-3"><Check size={16} className="text-textMain" /> "Skip Today" functionality</li>
              <li className="flex items-center gap-3"><Check size={16} className="text-textMain" /> Smart recurrence end dates</li>
              <li className="flex items-center gap-3"><Check size={16} className="text-textMain" /> Track completion consistency</li>
            </ul>
          </div>
        </div>
      </section>

      {/* SECTION 05 — NOTES */}
      <section id="notes" className="py-24 md:py-32 px-6 bg-[#050505]">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div>
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">Intellect</div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-6">
              THINK. WRITE.<br />ORGANIZE. CONNECT.
            </h2>
            <p className="text-sm md:text-base text-textMuted leading-relaxed mb-6">
              Your tasks answer "what to do". Your Notes answer "what to think about". Built with Markdown, bidirectional linking, and zero distractions.
            </p>
            <div className="grid grid-cols-2 gap-4 text-xs font-bold tracking-widest uppercase text-textMuted mt-8">
              <div className="flex items-center gap-2"><CornerDownRight size={14} /> Folders</div>
              <div className="flex items-center gap-2"><CornerDownRight size={14} /> Markdown</div>
              <div className="flex items-center gap-2"><CornerDownRight size={14} /> Tags</div>
              <div className="flex items-center gap-2"><CornerDownRight size={14} /> Bidirectional Links</div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-bl from-accent/5 to-transparent opacity-50 rounded-lg blur-2xl" />
            <div className="relative bg-surface border border-border/50 rounded-md shadow-2xl overflow-hidden flex flex-col h-[400px]">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/20 bg-background/50">
                <div className="w-3 h-3 rounded-full bg-border" />
                <div className="w-3 h-3 rounded-full bg-border" />
                <div className="w-3 h-3 rounded-full bg-border" />
              </div>
              <div className="flex flex-1 overflow-hidden">
                <div className="w-1/3 border-r border-border/20 p-4 hidden md:flex flex-col gap-4">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-textMuted">All Notes</div>
                  <div className="flex flex-col gap-2">
                    {mockNotes.map((n, i) => (
                      <div key={i} className={cn("p-3 border rounded-sm", i === 0 ? "bg-surfaceHover border-border/40" : "bg-transparent border-transparent opacity-60")}>
                        <div className="text-xs font-bold truncate mb-1">{n.title}</div>
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] text-accent">{n.tags[0]}</div>
                          <div className="text-[9px] text-textMuted uppercase">{n.date}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 p-6 md:p-8 bg-background flex flex-col">
                  <h3 className="text-xl md:text-2xl font-bold mb-6 text-textMain">Project Eustace Architecture</h3>
                  <div className="flex-1 font-mono text-xs md:text-sm text-textMuted flex flex-col gap-4 leading-relaxed">
                    <p>Eustace separates <span className="text-textMain">Tasks</span> (execution) from <span className="text-textMain">Notes</span> (intellect).</p>
                    <p>## Core Principles<br/>- No native browser prompts.<br/>- Minimalistic UI.<br/>- Fast performance.</p>
                    <p>See also: <span className="text-accent bg-accent/10 px-1 rounded">[[Q4 Personal Goals]]</span></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 06 — ANALYTICS */}
      <section id="analytics" className="py-24 md:py-32 px-6 bg-background border-y border-border/10">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div className="order-2 lg:order-1 flex justify-center">
             <div className="w-full bg-surface border border-border/50 p-6 md:p-8 rounded-md shadow-2xl">
               <div className="flex items-end justify-between mb-8">
                 <div>
                   <div className="text-[10px] font-bold tracking-widest uppercase text-textMuted mb-2">Contribution</div>
                   <div className="text-2xl md:text-4xl font-black">248<span className="text-base text-textMuted ml-2">Days</span></div>
                 </div>
               </div>
               
               {/* Abstract visual of contribution graph */}
               <div className="grid grid-cols-12 gap-1 md:gap-2 w-full">
                 {Array.from({length: 48}).map((_, i) => (
                   <div key={i} className={cn(
                     "aspect-square rounded-[2px]",
                     Math.random() > 0.7 ? "bg-accent/80" : Math.random() > 0.4 ? "bg-accent/40" : "bg-border/30"
                   )} />
                 ))}
               </div>
             </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">Reflection</div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-6">
              WHAT GETS MEASURED<br />GETS UNDERSTOOD.
            </h2>
            <p className="text-sm md:text-base text-textMuted leading-relaxed mb-6">
              Track your completion rate, understand your consistency, and identify where your momentum thrives. Every task checked builds your contribution graph.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 07 — FRIENDS */}
      <section id="friends" className="py-24 md:py-32 px-6 bg-[#050505]">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div>
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">Community</div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-6">
              PROGRESS IS BETTER<br />TOGETHER.
            </h2>
            <p className="text-sm md:text-base text-textMuted leading-relaxed">
              Add friends, compare your streaks on a private leaderboard, and see the progress of the people in your circle. Accountability is the strongest foundation for consistency.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="bg-surface border border-border/50 p-4 md:p-6 rounded-sm flex items-center justify-between shadow-xl">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-textMain/10 border border-textMain/20 flex items-center justify-center font-bold text-xs">J</div>
                <div>
                  <div className="text-sm font-bold">Jack Richard</div>
                  <div className="text-[10px] font-medium text-textMuted uppercase tracking-widest mt-0.5">@jackrichard</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl md:text-2xl font-black text-accent">14</div>
                <div className="text-[9px] font-bold tracking-widest uppercase text-textMuted mt-1">Day Streak</div>
              </div>
            </div>

            <div className="bg-surface border border-border/20 p-4 md:p-6 rounded-sm flex items-center justify-between opacity-70 scale-[0.98] origin-top">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-textMain/10 border border-textMain/20 flex items-center justify-center font-bold text-xs">E</div>
                <div>
                  <div className="text-sm font-bold">Elena</div>
                  <div className="text-[10px] font-medium text-textMuted uppercase tracking-widest mt-0.5">@elena_k</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl md:text-2xl font-black">12</div>
                <div className="text-[9px] font-bold tracking-widest uppercase text-textMuted mt-1">Day Streak</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 08 — CONSISTENCY */}
      <section className="py-24 md:py-32 px-6 flex flex-col items-center justify-center text-center bg-background border-y border-border/10">
        <div className="max-w-4xl mx-auto w-full">
          <h2 className="text-2xl md:text-5xl font-black tracking-tight leading-tight hero-philosopher text-textMuted">
            DISCIPLINE IS NOT A MOMENT.<br />IT IS A SYSTEM.
          </h2>
        </div>
      </section>

      {/* SECTION 09 — FINAL CTA */}
      <section className="py-32 md:py-48 px-6 flex flex-col items-center justify-center text-center bg-[#050505] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_10%,_#050505_100%)] z-10 pointer-events-none opacity-90" />
        <div className="relative z-20 flex flex-col items-center">
          <h2 className="text-4xl md:text-7xl font-black tracking-tighter leading-none mb-6">
            MAKE YOURSELF WORTHY.
          </h2>
          <p className="text-sm md:text-lg text-textMuted font-medium mb-10 max-w-lg">
            Build the system. Keep the promise.
          </p>
          <Link to="/signup" className="flex items-center gap-3 px-10 py-5 bg-textMain text-background hover:bg-white text-xs font-bold tracking-widest uppercase transition-all duration-300 rounded-sm">
            Get Started <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* SECTION 10 — FOOTER */}
      <footer className="bg-background border-t border-border/10 pt-20 pb-10 px-6">
        <div className="max-w-6xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-2">
              <div className="font-bold tracking-[0.3em] uppercase text-textMain mb-4">Eustace</div>
              <p className="text-xs text-textMuted leading-relaxed max-w-xs">
                Built for consistency,<br />one day at a time.
              </p>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-textMuted mb-6">Product</div>
              <ul className="flex flex-col gap-4 text-xs font-medium">
                <li><Link to="/dashboard" className="text-textMain hover:text-textMuted transition-colors">Dashboard</Link></li>
                <li><Link to="/tasks" className="text-textMain hover:text-textMuted transition-colors">Tasks</Link></li>
                <li><Link to="/notes" className="text-textMain hover:text-textMuted transition-colors">Notes</Link></li>
                <li><Link to="/analytics" className="text-textMain hover:text-textMuted transition-colors">Analytics</Link></li>
                <li><Link to="/friends" className="text-textMain hover:text-textMuted transition-colors">Friends</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-textMuted mb-6">Account</div>
              <ul className="flex flex-col gap-4 text-xs font-medium">
                <li><Link to="/login" className="text-textMain hover:text-textMuted transition-colors">Log In</Link></li>
                <li><Link to="/signup" className="text-textMain hover:text-textMuted transition-colors">Get Started</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-textMuted mb-6">Legal</div>
              <ul className="flex flex-col gap-4 text-xs font-medium">
                <li><Link to="/privacy" className="text-textMain hover:text-textMuted transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="text-textMain hover:text-textMuted transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-border/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-[10px] text-textMuted font-bold tracking-widest uppercase">
              © 2026 Jack Richard. All rights reserved.
            </div>
            <div className="text-[10px] text-textMuted font-medium flex items-center gap-2">
              Designed & built with intention.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
