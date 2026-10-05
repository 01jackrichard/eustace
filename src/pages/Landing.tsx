import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Menu, X, ArrowRight } from 'lucide-react';
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

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-textMain selection:bg-accent/30 font-sans overflow-x-hidden">

      {/* SECTION 1 - NAVIGATION */}
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b",
        scrolled ? "bg-[#050505]/90 backdrop-blur-md border-border/20 py-4" : "bg-transparent border-transparent py-6"
      )}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex justify-between items-center">
          <div className="font-bold tracking-[0.3em] uppercase text-textMain">Eustace</div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <button className="text-[10px] font-bold tracking-widest uppercase text-textMuted hover:text-textMain transition-colors">Product</button>
            <button onClick={() => scrollTo('how-it-works')} className="text-[10px] font-bold tracking-widest uppercase text-textMuted hover:text-textMain transition-colors">How it works</button>
            <button onClick={() => scrollTo('features')} className="text-[10px] font-bold tracking-widest uppercase text-textMuted hover:text-textMain transition-colors">Features</button>
            <button onClick={() => scrollTo('friends')} className="text-[10px] font-bold tracking-widest uppercase text-textMuted hover:text-textMain transition-colors">Friends</button>
            <button onClick={() => scrollTo('analytics')} className="text-[10px] font-bold tracking-widest uppercase text-textMuted hover:text-textMain transition-colors">Analytics</button>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <Link to="/login" className="text-[10px] font-bold tracking-widest uppercase text-textMain hover:text-accent transition-colors">Log In</Link>
            <Link to="/signup" className="px-5 py-2 bg-textMain text-background hover:bg-white text-[10px] font-bold tracking-widest uppercase transition-colors rounded-sm">Get Started</Link>
          </div>

          {/* Mobile Toggle */}
          <button className="md:hidden text-textMain" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-[#050505] border-b border-border/20 py-6 px-6 flex flex-col gap-6">
            <button className="text-left text-sm font-bold tracking-widest uppercase text-textMuted hover:text-textMain">Product</button>
            <button onClick={() => scrollTo('how-it-works')} className="text-left text-sm font-bold tracking-widest uppercase text-textMuted hover:text-textMain">How it works</button>
            <button onClick={() => scrollTo('features')} className="text-left text-sm font-bold tracking-widest uppercase text-textMuted hover:text-textMain">Features</button>
            <button onClick={() => scrollTo('friends')} className="text-left text-sm font-bold tracking-widest uppercase text-textMuted hover:text-textMain">Friends</button>
            <button onClick={() => scrollTo('analytics')} className="text-left text-sm font-bold tracking-widest uppercase text-textMuted hover:text-textMain">Analytics</button>
            <div className="w-full h-px bg-border/20 my-2" />
            <Link to="/login" className="text-sm font-bold tracking-widest uppercase text-textMain">Log In</Link>
            <Link to="/signup" className="w-full py-3 bg-textMain text-background text-center text-sm font-bold tracking-widest uppercase rounded-sm">Get Started</Link>
          </div>
        )}
      </nav>

            {/* SECTION 2 - HERO */}
      <section className="relative min-h-screen flex flex-col items-center justify-between pt-32 pb-8 overflow-hidden bg-[#050505]">

        {/* Eyebrow */}
        <div className="relative z-20 text-[9px] md:text-[10px] font-bold tracking-[0.4em] uppercase text-textMuted mt-4 md:mt-8 text-center px-6 opacity-0 animate-[fade-in-down_1s_ease-out_forwards]" style={{ animationDelay: '0.2s' }}>
          A Personal Productivity Operating System
        </div>

        {/* The Hands Asset */}
        <div
          className="relative w-full h-[40vh] md:h-[45vh] flex items-center justify-center z-0 opacity-0 animate-[hands-settle_1.4s_cubic-bezier(0.2,0.8,0.2,1)_forwards]"
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

          <div className="flex flex-col sm:flex-row items-center gap-6 opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards]" style={{ animationDelay: '1.2s' }}>
            <Link to="/signup" className="flex items-center gap-3 px-8 py-4 bg-textMain text-background hover:bg-white text-[10px] md:text-xs font-bold tracking-widest uppercase transition-all duration-300 rounded-sm w-full sm:w-auto justify-center">
              Start Tracking Now →
            </Link>
            <button onClick={() => scrollTo('statement')} className="flex items-center justify-center px-8 py-4 bg-transparent border border-border/40 hover:bg-white/5 text-textMain text-[10px] md:text-xs font-bold tracking-widest uppercase transition-all duration-300 rounded-sm w-full sm:w-auto">
              Explore Eustace
            </button>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="relative z-20 flex flex-col items-center gap-2 opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards] mb-4" style={{ animationDelay: '1.4s' }}>
          <span className="text-[8px] font-bold tracking-[0.3em] uppercase text-textMuted">Scroll</span>
          <div className="w-px h-6 bg-textMuted animate-[pulse_2s_ease-in-out_infinite]" />
        </div>
      </section>

      {/* 1. PHILOSOPHY */}
      <section id="statement" className="py-24 md:py-32 px-6 flex flex-col items-center justify-center text-center bg-[#050505]">
        <div className="max-w-4xl mx-auto w-full">
          <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">Why Eustace</div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-8">
            YOUR DAYS ARE<br />THE SYSTEM.
          </h2>
          <p className="text-sm md:text-base text-textMuted max-w-2xl mx-auto leading-relaxed">
            Most productivity tools help you manage tasks. Eustace is built to help you understand consistency. By tracking your daily work, Eustace turns scattered actions into measurable momentum over time.
          </p>
        </div>
      </section>

      {/* 2. PRODUCT */}
      <section id="features" className="py-24 md:py-32 px-6 bg-background">
        <div className="max-w-6xl mx-auto w-full flex flex-col items-center text-center">
          <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">The System</div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-16">
            PLAN. EXECUTE. MEASURE.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 w-full text-left">
            <div className="flex flex-col border-t border-border/20 pt-6">
              <span className="text-[10px] font-bold tracking-widest text-textMuted mb-4">01 &mdash; TASKS</span>
              <h3 className="text-lg font-bold mb-3">Plan the work that matters.</h3>
              <p className="text-sm text-textMuted leading-relaxed">Organize your day with precision. Break down your goals into actionable steps and execute them with focus.</p>
            </div>
            <div className="flex flex-col border-t border-border/20 pt-6">
              <span className="text-[10px] font-bold tracking-widest text-textMuted mb-4">02 &mdash; CALENDAR</span>
              <h3 className="text-lg font-bold mb-3">See your time as a continuous system.</h3>
              <p className="text-sm text-textMuted leading-relaxed">Visualize your weeks and months. Plan ahead, reflect on past performance, and maintain your rhythm.</p>
            </div>
            <div className="flex flex-col border-t border-border/20 pt-6">
              <span className="text-[10px] font-bold tracking-widest text-textMuted mb-4">03 &mdash; ANALYTICS</span>
              <h3 className="text-lg font-bold mb-3">Understand your consistency and progress.</h3>
              <p className="text-sm text-textMuted leading-relaxed">Transform your daily effort into visible metrics. Track your completion rate and identify where your momentum thrives.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. CONSISTENCY */}
      <section id="analytics" className="py-24 md:py-32 px-6 bg-[#050505] border-y border-border/10">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">Consistency</div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-6">
              MOMENTUM IS BUILT<br />ONE DAY AT A TIME.
            </h2>
            <p className="text-sm md:text-base text-textMuted leading-relaxed">
              Eustace helps you visualize your streaks and completion history. By seeing your progress clearly, you build the psychological momentum needed to show up day after day.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-background/50 border border-border/10 p-6 flex flex-col justify-between aspect-square rounded-sm">
              <span className="text-[9px] font-bold tracking-widest uppercase text-textMuted">Current Streak</span>
              <div className="text-5xl md:text-6xl font-black tracking-tighter">14</div>
              <span className="text-xs font-medium text-textMuted">Days active</span>
            </div>
            <div className="bg-background/50 border border-border/10 p-6 flex flex-col justify-between aspect-square rounded-sm">
              <span className="text-[9px] font-bold tracking-widest uppercase text-textMuted">Productive Days</span>
              <div className="text-5xl md:text-6xl font-black tracking-tighter">42</div>
              <span className="text-xs font-medium text-textMuted">This year</span>
            </div>
            <div className="bg-background/50 border border-border/10 p-6 flex flex-col justify-between aspect-[2/1] col-span-2 rounded-sm">
              <span className="text-[9px] font-bold tracking-widest uppercase text-textMuted">Completion Rate</span>
              <div className="flex items-end gap-3 mt-auto">
                <div className="text-5xl md:text-6xl font-black tracking-tighter">85%</div>
                <div className="text-xs font-medium text-textMuted mb-2">Last 30 days</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. FRIENDS */}
      <section id="friends" className="py-24 md:py-32 px-6 bg-background">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1 flex flex-col gap-3">
            <div className="bg-[#050505] border border-border/20 p-4 md:p-6 rounded-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-textMain/10 border border-textMain/20 flex items-center justify-center font-bold text-xs">J</div>
                <div>
                  <div className="text-sm font-bold">Jack Richard</div>
                  <div className="text-xs text-textMuted">@jackrichard</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-black">14</div>
                <div className="text-[9px] font-bold tracking-widest uppercase text-textMuted">Days</div>
              </div>
            </div>

            <div className="bg-[#050505] border border-border/20 p-4 md:p-6 rounded-sm flex items-center justify-between opacity-70">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-textMain/10 border border-textMain/20 flex items-center justify-center font-bold text-xs">E</div>
                <div>
                  <div className="text-sm font-bold">Elena</div>
                  <div className="text-xs text-textMuted">@elena_k</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-black">12</div>
                <div className="text-[9px] font-bold tracking-widest uppercase text-textMuted">Days</div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">Your Circle</div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-6">
              PROGRESS IS BETTER<br />TOGETHER.
            </h2>
            <p className="text-sm md:text-base text-textMuted leading-relaxed">
              Add friends, compare your streaks on a private leaderboard, and see the progress of the people in your circle. Accountability is the strongest foundation for consistency.
            </p>
          </div>
        </div>
      </section>

      {/* 5. FINAL CTA */}
      <section className="py-32 px-6 flex flex-col items-center justify-center text-center bg-[#050505] border-t border-border/10">
        <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-tight mb-6">
          START BUILDING<br />YOUR YEAR.
        </h2>
        <p className="text-textMuted font-medium mb-10">
          Your next day is waiting.
        </p>
        <Link to="/signup" className="flex items-center gap-3 px-8 py-4 bg-textMain text-background hover:bg-white text-xs font-bold tracking-widest uppercase transition-all duration-300 rounded-sm">
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      {/* FOOTER */}
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
                <li><Link to="/calendar" className="text-textMain hover:text-textMuted transition-colors">Calendar</Link></li>
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
          </div>

          <div className="w-full h-px bg-border/20 mb-8" />

          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-medium text-textMuted uppercase tracking-widest">
            <div>&copy; 2026 Jack Richard. All rights reserved.</div>
            <div>Designed & built with intention.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
