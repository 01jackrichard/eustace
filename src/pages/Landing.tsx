import { useState, useEffect } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  Menu,
  X,
  ArrowRight,
  Check,
  Target,
  Activity,
} from "lucide-react";
import { cn } from "../lib/utils";
import { PublicIntro } from "../components/PublicIntro";

export function Landing() {
  const { user } = useAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [introFinished, setIntroFinished] = useState(
    () => sessionStorage.getItem("eustace_public_intro") === "true",
  );
  const [scrollY, setScrollY] = useState(0);
  const [activeSection, setActiveSection] = useState("hero");

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Intersection Observer for Active Navigation
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the most visible section
        let maxRatio = 0;
        let mostVisible = activeSection;

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            mostVisible = entry.target.id;
          }
        });

        if (maxRatio > 0) {
          setActiveSection(mostVisible);
        }
      },
      {
        root: null,
        rootMargin: "-20% 0px -40% 0px",
        threshold: [0.1, 0.3, 0.5, 0.7, 0.9],
      },
    );

    const sections = [
      "hero",
      "product",
      "how-it-works",
      "features",
      "friends",
      "analytics",
    ];
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [activeSection]);

  // Handle hash navigation on mount
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
    }
  }, [location]);

  if (user) return <Navigate to="/dashboard" replace />;

  if (!introFinished) {
    return (
      <PublicIntro
        onComplete={() => {
          sessionStorage.setItem("eustace_public_intro", "true");
          setIntroFinished(true);
        }}
      />
    );
  }

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    // Update hash without jumping
    window.history.pushState(null, "", "#" + id);
    const element = document.getElementById(id);
    if (element) {
      // Use offset to account for fixed header if needed
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition =
        elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  const navLinkClass = (id: string) =>
    cn(
      "text-[10px] font-bold tracking-widest uppercase transition-all duration-200",
      activeSection === id
        ? "text-textMain"
        : "text-textMuted hover:text-textMain",
    );

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-textMain selection:bg-accent/30 font-sans overflow-x-hidden">
      {/* NAVIGATION */}
      <nav
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b pt-[env(safe-area-inset-top)]",
          scrolled
            ? "bg-[#050505]/95 backdrop-blur-md border-border/20 py-4"
            : "bg-transparent border-transparent py-6",
        )}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex justify-between items-center">
          <button
            onClick={() => scrollTo("hero")}
            className="flex items-center hover:opacity-80 transition-opacity"
          >
            <img src="/logo.png" alt="Eustace Logo" className="h-6 w-6 object-contain" />
          </button>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-8">
            <button
              onClick={() => scrollTo("product")}
              className={navLinkClass("product")}
            >
              Product
            </button>
            <button
              onClick={() => scrollTo("how-it-works")}
              className={navLinkClass("how-it-works")}
            >
              How it works
            </button>
            <button
              onClick={() => scrollTo("features")}
              className={navLinkClass("features")}
            >
              Features
            </button>
            <button
              onClick={() => scrollTo("friends")}
              className={navLinkClass("friends")}
            >
              Friends
            </button>
            <button
              onClick={() => scrollTo("analytics")}
              className={navLinkClass("analytics")}
            >
              Analytics
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-6">
            <Link
              to="/login"
              className="text-[10px] font-bold tracking-widest uppercase text-textMain hover:text-accent transition-colors"
            >
              Log In
            </Link>
            <Link
              to="/signup"
              className="px-5 py-2 bg-textMain text-background hover:bg-white text-[10px] font-bold tracking-widest uppercase transition-colors rounded-sm"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Toggle */}
          <button
            className="lg:hidden text-textMain"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Nav */}
        <div
          className={cn(
            "lg:hidden absolute top-full left-0 w-full bg-[#050505]/95 backdrop-blur-xl border-b border-border/20 transition-all duration-300 overflow-hidden",
            mobileMenuOpen
              ? "max-h-screen py-6 px-6 opacity-100"
              : "max-h-0 opacity-0 py-0 px-6 border-transparent",
          )}
        >
          <div className="flex flex-col gap-6">
            <button
              onClick={() => scrollTo("product")}
              className={cn("text-left text-sm", navLinkClass("product"))}
            >
              Product
            </button>
            <button
              onClick={() => scrollTo("how-it-works")}
              className={cn("text-left text-sm", navLinkClass("how-it-works"))}
            >
              How it works
            </button>
            <button
              onClick={() => scrollTo("features")}
              className={cn("text-left text-sm", navLinkClass("features"))}
            >
              Features
            </button>
            <button
              onClick={() => scrollTo("friends")}
              className={cn("text-left text-sm", navLinkClass("friends"))}
            >
              Friends
            </button>
            <button
              onClick={() => scrollTo("analytics")}
              className={cn("text-left text-sm", navLinkClass("analytics"))}
            >
              Analytics
            </button>
            <div className="w-full h-px bg-border/20 my-2" />
            <Link
              to="/login"
              className="text-sm font-bold tracking-widest uppercase text-textMain"
            >
              Log In
            </Link>
            <Link
              to="/signup"
              className="w-full py-4 bg-textMain text-background text-center text-sm font-bold tracking-widest uppercase rounded-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section
        id="hero"
        className="relative flex flex-col items-center pt-[140px] md:pt-[160px] pb-16 md:pb-24 overflow-hidden bg-[#050505]"
      >
        <style>{`
          @keyframes subtle-scroll {
            0%, 100% { transform: translateY(0); opacity: 0.3; }
            50% { transform: translateY(5px); opacity: 0.7; }
          }
          .animate-subtle-scroll {
            animation: subtle-scroll 3s ease-in-out infinite;
          }
        `}</style>

        {/* Eyebrow */}
        <div
          className="relative z-20 text-[9px] md:text-[10px] font-bold tracking-[0.4em] uppercase text-textMuted mb-6 md:mb-10 text-center px-6 opacity-0 animate-[fade-in-down_1s_ease-out_forwards]"
          style={{ animationDelay: "0.2s" }}
        >
          A Personal Productivity Operating System
        </div>

        {/* The Hands Asset - Restored Large Scale */}
        <div
          className="relative w-full max-w-[1920px] h-[35vh] md:h-[45vh] lg:h-[50vh] flex items-center justify-center z-0 opacity-0 animate-[hands-settle_1.4s_cubic-bezier(0.2,0.8,0.2,1)_forwards] mb-8 md:mb-12"
          style={{ animationDelay: "0.4s" }}
        >
          <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-[#050505] to-transparent z-10 pointer-events-none opacity-80" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 left-0 w-[15%] bg-gradient-to-r from-[#050505] to-transparent z-10 pointer-events-none opacity-80" />
          <div className="absolute inset-y-0 right-0 w-[15%] bg-gradient-to-l from-[#050505] to-transparent z-10 pointer-events-none opacity-80" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_20%,_#050505_100%)] z-10 pointer-events-none opacity-40" />

          <img
            src="/hero-hands-new.png"
            alt="Eustace Classical Hands"
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{ transform: `translateY(${scrollY * 0.15}px)` }}
          />
        </div>

        {/* Typography Content */}
        <div className="relative z-20 flex flex-col items-center text-center max-w-5xl mx-auto w-full px-6 mb-16 md:mb-24">
          <h1
            className="text-4xl sm:text-6xl md:text-[80px] lg:text-[90px] hero-philosopher tracking-tight leading-[1] text-textMain mb-6 opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards] whitespace-nowrap"
            style={{ animationDelay: "0.8s" }}
          >
            TURN INTENTION
            <br />
            INTO ACTION.
          </h1>

          <p
            className="text-sm md:text-base text-textMuted max-w-2xl font-medium mx-auto mb-10 opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards] leading-relaxed"
            style={{ animationDelay: "1.0s" }}
          >
            Eustace helps you turn everyday tasks into measurable progress —
            track your work, understand your consistency, and build momentum
            over time.
          </p>

          <div
            className="flex flex-col sm:flex-row items-center gap-6 opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards] w-full sm:w-auto"
            style={{ animationDelay: "1.2s" }}
          >
            <Link
              to="/signup"
              className="flex items-center gap-3 px-8 py-4 bg-textMain text-background hover:bg-white text-[10px] md:text-xs font-bold tracking-widest uppercase transition-all duration-300 rounded-sm w-full sm:w-auto justify-center"
            >
              Get Started <ArrowRight size={16} />
            </Link>
            <button
              onClick={() => scrollTo("product")}
              className="flex items-center justify-center px-8 py-4 bg-transparent border border-border/40 hover:bg-white/5 text-textMain text-[10px] md:text-xs font-bold tracking-widest uppercase transition-all duration-300 rounded-sm w-full sm:w-auto"
            >
              Explore Eustace
            </button>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div
          className="relative z-20 flex flex-col items-center gap-3 opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards] w-full"
          style={{ animationDelay: "1.4s" }}
        >
          <div className="w-[1px] h-8 bg-textMuted animate-subtle-scroll" />
        </div>
      </section>

      {/* SECTION 02 — PRODUCT */}
      <section
        id="product"
        className="py-24 md:py-32 px-6 flex flex-col items-center justify-center text-center bg-background border-t border-border/10"
      >
        <div className="max-w-4xl mx-auto w-full">
          <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">
            The System
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-8">
            ONE PLACE TO
            <br />
            ORGANIZE THE DAY.
          </h2>
          <p className="text-sm md:text-base text-textMuted max-w-2xl mx-auto leading-relaxed mb-16">
            A personal productivity operating system that brings planning,
            tasks, notes, time, consistency and reflection into one place.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-12 relative max-w-4xl mx-auto">
            <div className="flex flex-col items-center text-center p-6 bg-surface border border-border/20 rounded-md">
              <Target
                className="text-textMuted mb-4"
                size={24}
                strokeWidth={1.5}
              />
              <h3 className="text-xs font-bold tracking-widest uppercase mb-3">
                Intent
              </h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Map out your goals and define what matters today in your notes
                and calendar.
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-6 bg-surface border border-border/20 rounded-md">
              <Check
                className="text-textMuted mb-4"
                size={24}
                strokeWidth={1.5}
              />
              <h3 className="text-xs font-bold tracking-widest uppercase mb-3">
                Action
              </h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Execute your daily tasks and check off the work as it actually
                happens.
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-6 bg-surface border border-border/20 rounded-md">
              <Activity
                className="text-textMuted mb-4"
                size={24}
                strokeWidth={1.5}
              />
              <h3 className="text-xs font-bold tracking-widest uppercase mb-3">
                Momentum
              </h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Track your consistency and maintain streaks alongside your
                friends.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 03 — HOW IT WORKS */}
      <section id="how-it-works" className="py-24 md:py-32 px-6 bg-[#050505]">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-20">
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">
              Workflow
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
              MAKE THE DAY VISIBLE.
            </h2>
          </div>

          <div className="flex flex-col md:flex-row justify-between gap-12 relative">
            <div className="hidden md:block absolute top-6 left-0 right-0 h-px bg-border/20 z-0"></div>

            {[
              { num: "01", title: "PLAN", desc: "Choose what matters today." },
              {
                num: "02",
                title: "SCHEDULE",
                desc: "Give important work a place in time.",
              },
              { num: "03", title: "DO", desc: "Work through the day." },
              {
                num: "04",
                title: "REFLECT",
                desc: "Review what you actually completed.",
              },
            ].map((step, i) => (
              <div
                key={i}
                className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left flex-1"
              >
                <div className="w-12 h-12 bg-background border border-border flex items-center justify-center font-bold text-xs rounded-full mb-6 text-textMuted shadow-xl">
                  {step.num}
                </div>
                <h3 className="text-xs font-bold tracking-widest uppercase mb-3 text-textMain">
                  {step.title}
                </h3>
                <p className="text-xs text-textMuted leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 04 — FEATURES */}
      <section
        id="features"
        className="py-24 md:py-32 px-6 bg-background border-t border-border/10"
      >
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-20">
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">
              Capabilities
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
              EVERYTHING
              <br />
              IN ITS PLACE.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-16">
            <div className="flex flex-col border-t border-border/20 pt-8">
              <h3 className="text-xs font-bold tracking-widest uppercase text-textMuted mb-6">
                PLAN
              </h3>
              <ul className="flex flex-col gap-4">
                <li className="flex flex-col gap-1">
                  <span className="text-sm font-bold">Tasks</span>
                  <span className="text-xs text-textMuted">
                    Daily execution, recurring habits, and task skipping.
                  </span>
                </li>
                <li className="flex flex-col gap-1">
                  <span className="text-sm font-bold">Calendar</span>
                  <span className="text-xs text-textMuted">
                    Schedule your day with a unified timeline interface.
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col border-t border-border/20 pt-8">
              <h3 className="text-xs font-bold tracking-widest uppercase text-textMuted mb-6">
                CREATE
              </h3>
              <ul className="flex flex-col gap-4">
                <li className="flex flex-col gap-1">
                  <span className="text-sm font-bold">Notes</span>
                  <span className="text-xs text-textMuted">
                    Markdown, folders, tags, and bidirectional links for your
                    intellect.
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col border-t border-border/20 pt-8">
              <h3 className="text-xs font-bold tracking-widest uppercase text-textMuted mb-6">
                MEASURE
              </h3>
              <ul className="flex flex-col gap-4">
                <li className="flex flex-col gap-1">
                  <span className="text-sm font-bold">Analytics</span>
                  <span className="text-xs text-textMuted">
                    Understand your completion rate and long-term consistency.
                  </span>
                </li>
                <li className="flex flex-col gap-1">
                  <span className="text-sm font-bold">History</span>
                  <span className="text-xs text-textMuted">
                    View your daily contribution graph across the entire year.
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col border-t border-border/20 pt-8">
              <h3 className="text-xs font-bold tracking-widest uppercase text-textMuted mb-6">
                CONNECT
              </h3>
              <ul className="flex flex-col gap-4">
                <li className="flex flex-col gap-1">
                  <span className="text-sm font-bold">Friends & Profiles</span>
                  <span className="text-xs text-textMuted">
                    Connect with others and view their public progress patterns.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 05 — FRIENDS */}
      <section
        id="friends"
        className="py-24 md:py-32 px-6 bg-[#050505] border-t border-border/10"
      >
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div>
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">
              Community
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-6">
              IMPROVE
              <br />
              TOGETHER.
            </h2>
            <p className="text-sm md:text-base text-textMuted leading-relaxed">
              You don&apos;t have to improve alone. Find your friends, send
              requests, and view their public profiles. Seeing someone
              else&apos;s consistency is the best motivation for your own.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="bg-surface border border-border/50 p-4 md:p-6 rounded-sm flex items-center justify-between shadow-xl">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-textMain/10 border border-textMain/20 flex items-center justify-center font-bold text-xs">
                  J
                </div>
                <div>
                  <div className="text-sm font-bold">Jack Richard</div>
                  <div className="text-[10px] font-medium text-textMuted uppercase tracking-widest mt-0.5">
                    @jackrichard
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl md:text-2xl font-black text-accent">
                  14
                </div>
                <div className="text-[9px] font-bold tracking-widest uppercase text-textMuted mt-1">
                  Day Streak
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border/20 p-4 md:p-6 rounded-sm flex items-center justify-between opacity-70 scale-[0.98] origin-top">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-textMain/10 border border-textMain/20 flex items-center justify-center font-bold text-xs">
                  E
                </div>
                <div>
                  <div className="text-sm font-bold">Elena</div>
                  <div className="text-[10px] font-medium text-textMuted uppercase tracking-widest mt-0.5">
                    @elena_k
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl md:text-2xl font-black">12</div>
                <div className="text-[9px] font-bold tracking-widest uppercase text-textMuted mt-1">
                  Day Streak
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 06 — ANALYTICS */}
      <section
        id="analytics"
        className="py-24 md:py-32 px-6 bg-background border-t border-border/10"
      >
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div className="order-2 lg:order-1 flex justify-center">
            <div className="w-full bg-surface border border-border/50 p-6 md:p-8 rounded-md shadow-2xl">
              <div className="flex items-end justify-between mb-8">
                <div>
                  <div className="text-[10px] font-bold tracking-widest uppercase text-textMuted mb-2">
                    Contribution
                  </div>
                  <div className="text-2xl md:text-4xl font-black">
                    248
                    <span className="text-base text-textMuted ml-2">Days</span>
                  </div>
                </div>
              </div>

              {/* Abstract visual of contribution graph */}
              <div className="grid grid-cols-12 gap-1 md:gap-2 w-full">
                {Array.from({ length: 48 }).map((_, i) => {
                  const val = (i * 13) % 10;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "aspect-square rounded-[2px]",
                        val > 7
                          ? "bg-accent/80"
                          : val > 4
                            ? "bg-accent/40"
                            : "bg-border/30",
                      )}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted mb-6">
              Reflection
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-6">
              SEE
              <br />
              THE PATTERN.
            </h2>
            <p className="text-sm md:text-base text-textMuted leading-relaxed mb-6">
              You should be able to see the pattern. Eustace measures your
              completion rate, identifies your productivity trends, and builds a
              long-term contribution graph of your daily progress.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 07 — FINAL CTA */}
      <section className="py-32 md:py-48 px-6 flex flex-col items-center justify-center text-center bg-[#050505] relative overflow-hidden border-t border-border/10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_10%,_#050505_100%)] z-10 pointer-events-none opacity-90" />
        <div className="relative z-20 flex flex-col items-center">
          <h2 className="text-4xl md:text-7xl font-black tracking-tighter leading-none mb-10">
            MAKE TOMORROW
            <br />
            WORTH SHOWING UP FOR.
          </h2>
          <Link
            to="/signup"
            className="flex items-center gap-3 px-10 py-5 bg-textMain text-background hover:bg-white text-xs font-bold tracking-widest uppercase transition-all duration-300 rounded-sm"
          >
            Get Started <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* SECTION 08 — FOOTER */}
      <footer className="bg-background border-t border-border/10 pt-20 pb-10 px-6">
        <div className="max-w-6xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-2">
              <div className="mb-4">
                <img src="/logo.png" alt="Eustace Logo" className="h-6 w-6 object-contain opacity-90" />
              </div>
              <p className="text-xs text-textMuted leading-relaxed max-w-xs">
                Built for consistency,
                <br />
                one day at a time.
              </p>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-textMuted mb-6">
                Product
              </div>
              <ul className="flex flex-col gap-4 text-xs font-medium">
                <li>
                  <Link
                    to="/dashboard"
                    className="text-textMain hover:text-textMuted transition-colors"
                  >
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link
                    to="/tasks"
                    className="text-textMain hover:text-textMuted transition-colors"
                  >
                    Tasks
                  </Link>
                </li>
                <li>
                  <Link
                    to="/notes"
                    className="text-textMain hover:text-textMuted transition-colors"
                  >
                    Notes
                  </Link>
                </li>
                <li>
                  <Link
                    to="/analytics"
                    className="text-textMain hover:text-textMuted transition-colors"
                  >
                    Analytics
                  </Link>
                </li>
                <li>
                  <Link
                    to="/friends"
                    className="text-textMain hover:text-textMuted transition-colors"
                  >
                    Friends
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-textMuted mb-6">
                Account
              </div>
              <ul className="flex flex-col gap-4 text-xs font-medium">
                <li>
                  <Link
                    to="/login"
                    className="text-textMain hover:text-textMuted transition-colors"
                  >
                    Log In
                  </Link>
                </li>
                <li>
                  <Link
                    to="/signup"
                    className="text-textMain hover:text-textMuted transition-colors"
                  >
                    Get Started
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-textMuted mb-6">
                Legal
              </div>
              <ul className="flex flex-col gap-4 text-xs font-medium">
                <li>
                  <Link
                    to="/privacy"
                    className="text-textMain hover:text-textMuted transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    to="/terms"
                    className="text-textMain hover:text-textMuted transition-colors"
                  >
                    Terms of Service
                  </Link>
                </li>
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
