export function ConnectionsHero() {
  return (
    <div className="relative w-full pt-1 pb-3 md:pt-2 md:pb-4 overflow-hidden select-none">
      {/* 1. BACKGROUND ASTRONOMICAL CELESTIAL CRESCENT ARTWORK */}
      <div
        className="absolute top-0 right-0 pointer-events-none select-none z-0 overflow-hidden w-56 h-56 md:w-64 md:h-64 opacity-35 hidden sm:block"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 400 400"
          className="w-full h-full transform translate-x-12 -translate-y-8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Dark planetary sphere gradient */}
            <radialGradient
              id="planetGlow"
              cx="40%"
              cy="35%"
              r="65%"
              fx="35%"
              fy="30%"
            >
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
              <stop offset="25%" stopColor="#8a9292" stopOpacity="0.18" />
              <stop offset="55%" stopColor="#1e2222" stopOpacity="0.08" />
              <stop offset="85%" stopColor="#0a0a0a" stopOpacity="0" />
            </radialGradient>

            {/* Rim light highlight */}
            <radialGradient
              id="rimHighlight"
              cx="50%"
              cy="20%"
              r="60%"
            >
              <stop offset="0%" stopColor="#e5e7eb" stopOpacity="0.4" />
              <stop offset="40%" stopColor="#9ca3af" stopOpacity="0.15" />
              <stop offset="70%" stopColor="#0a0a0a" stopOpacity="0" />
            </radialGradient>

            {/* Fade out edges to near-black background */}
            <linearGradient id="fadeBottomLeft" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </linearGradient>

            <mask id="planetMask">
              <rect width="400" height="400" fill="url(#fadeBottomLeft)" />
            </mask>
          </defs>

          {/* Celestial Sphere Body */}
          <g mask="url(#planetMask)">
            {/* Planet sphere */}
            <circle cx="260" cy="140" r="160" fill="url(#planetGlow)" />
            <circle cx="260" cy="140" r="160" fill="#111414" fillOpacity="0.45" />

            {/* Crescent curved horizon edge with craters texture effect */}
            <path
              d="M 120 220 C 140 120, 220 40, 360 40"
              stroke="url(#rimHighlight)"
              strokeWidth="2.5"
              strokeLinecap="round"
              filter="blur(0.5px)"
            />
            <path
              d="M 125 215 C 150 125, 225 45, 355 45"
              stroke="#EDEDED"
              strokeWidth="0.8"
              strokeOpacity="0.6"
              strokeDasharray="40 8 12 6 80 14"
            />

            {/* Subtle atmospheric haze rings */}
            <ellipse
              cx="260"
              cy="140"
              rx="164"
              ry="164"
              stroke="rgba(255, 255, 255, 0.06)"
              strokeWidth="1.2"
            />
            <ellipse
              cx="260"
              cy="140"
              rx="172"
              ry="172"
              stroke="rgba(255, 255, 255, 0.025)"
              strokeWidth="1"
            />
          </g>
        </svg>
      </div>

      {/* 2. HERO CONTENT ROW */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-2">
        {/* Left: Heading & Uppercase Subtitle */}
        <div>
          <h1 className="font-['Philosopher',serif] text-3xl sm:text-4xl font-medium tracking-tight text-[#EDEDED] leading-none">
            Connections
          </h1>
          <p className="text-[10px] sm:text-[11px] font-bold tracking-[0.25em] text-[#8E9292] uppercase mt-1.5">
            PEOPLE WHO WALK THIS PATH WITH YOU.
          </p>
        </div>

        {/* Right: Editorial Quote */}
        <div className="hidden sm:block text-right pb-0.5">
          <p className="font-['Philosopher',serif] italic text-xs md:text-sm text-textMuted/70 leading-snug">
            &ldquo;A steady circle<br />
            builds a sharper you.&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}

export default ConnectionsHero;
