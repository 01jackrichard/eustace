import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

const INITIAL = "EUSTACE";
const TARGET = "MAKE YOURSELF WORTHY.";
const GLYPHS = ['E', 'X', 'I', 'U', '/', 'S', '5', 'T', '+', 'A', '^', 'C', '[', ']', '?', 'E'];

interface PublicIntroProps {
  onComplete: () => void;
}

export function PublicIntro({ onComplete }: PublicIntroProps) {
  const containerRef = useRef<HTMLHeadingElement>(null);
  const [phase, setPhase] = useState<'initial' | 'transition' | 'finish'>('initial');

  // Store old rects before React removes them
  const oldRectsRef = useRef<DOMRect[]>([]);

  useEffect(() => {
    if (phase === 'initial') {
      const timer = setTimeout(() => {
        // Record old rects BEFORE changing phase
        if (containerRef.current) {
          const spans = Array.from(containerRef.current.querySelectorAll('.char')) as HTMLSpanElement[];
          oldRectsRef.current = spans.map(s => s.getBoundingClientRect());
        }
        setPhase('transition');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  useLayoutEffect(() => {
    if (phase === 'transition') {
      const container = containerRef.current;
      if (!container) return;

      const newSpans = Array.from(container.querySelectorAll('.char')) as HTMLSpanElement[];
      const oldRects = oldRectsRef.current;

      // Fallback if measurement failed
      if (oldRects.length === 0 || newSpans.length === 0) return;

      const centerOldRect = oldRects[3] || oldRects[0];

      // Measure new positions (React just rendered them)
      const newRects = newSpans.map(s => s.getBoundingClientRect());

      // Invert
      const mapping = [0, 3, 7, 10, 14, 17, 20];

      newSpans.forEach((span, i) => {
        const oldIndex = mapping.indexOf(i);
        const isNew = oldIndex === -1;
        const startRect = isNew ? centerOldRect : oldRects[oldIndex];
        const newRect = newRects[i];

        if (!startRect || !newRect) return;

        const dx = startRect.left - newRect.left + (startRect.width - newRect.width) / 2;
        const dy = startRect.top - newRect.top + (startRect.height - newRect.height) / 2;
        const scale = (startRect.height || 1) / (newRect.height || 1);

        span.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
        if (isNew) {
          span.style.opacity = '0';
          span.style.filter = 'blur(8px)';
        } else {
          span.style.opacity = '1';
          span.style.filter = 'blur(0px)';
        }
      });

      // Force reflow
      container.getBoundingClientRect();

      // Play FLIP animation
      newSpans.forEach((span, i) => {
        const stagger = (i / newSpans.length) * 300;
        span.style.transition = `transform 1.8s cubic-bezier(0.22, 1, 0.36, 1) ${stagger}ms, opacity 1.2s ease-out ${stagger}ms, filter 1.2s ease-out ${stagger}ms, color 0.1s`;
        span.style.transform = 'translate(0, 0) scale(1)';
        span.style.opacity = '1';
        span.style.filter = 'blur(0px)';
      });

      // Scramble Loop
      const startTime = performance.now();
      const durationMs = 2200;
      let frameId: number;

      const loop = (time: number) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / durationMs, 1);

        newSpans.forEach((span, i) => {
          if (TARGET[i] === ' ') return;

          const resolveThreshold = 0.5 + (i / newSpans.length) * 0.4;

          if (progress < resolveThreshold) {
            if (Math.random() > 0.6) {
              span.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
              span.style.color = Math.random() > 0.8 ? 'rgba(255,255,255,0.7)' : 'white';
            }
          } else {
            span.textContent = TARGET[i];
            span.style.color = 'white';
          }
        });

        if (progress < 1) {
          frameId = requestAnimationFrame(loop);
        } else {
          setTimeout(() => {
            setPhase('finish');
            setTimeout(onComplete, 1200);
          }, 2000);
        }
      };

      frameId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(frameId);
    }
  }, [phase, onComplete]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#050505] flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />
      </div>

      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6">
        <h1
          ref={containerRef}
          className={cn(
            "text-white mix-blend-plus-lighter text-center max-w-[95vw] leading-[1.2]",
            phase === 'initial' ? "text-[clamp(60px,8vw,120px)]" : "text-[clamp(28px,5vw,72px)]"
          )}
          style={{
            fontFamily: "'Syncopate', sans-serif",
            fontWeight: 700,
            letterSpacing: '-0.04em'
          }}
        >
          {phase === 'initial' ? (
            <span className="inline-block whitespace-nowrap">
              {INITIAL.split('').map((char, i) => (
                <span key={i} className="char inline-block transform-gpu">{char}</span>
              ))}
            </span>
          ) : (
            <>
              <span className="inline-block whitespace-nowrap">
                {TARGET.substring(0, 14).split('').map((char, i) => (
                  <span key={i} className="char inline-block transform-gpu" style={char === ' ' ? { width: '0.4em' } : {}}>{char}</span>
                ))}
              </span>
              <wbr />
              <span className="inline-block whitespace-nowrap">
                {TARGET.substring(14).split('').map((char, i) => (
                  <span key={i + 14} className="char inline-block transform-gpu" style={char === ' ' ? { width: '0.4em' } : {}}>{char}</span>
                ))}
              </span>
            </>
          )}
        </h1>
      </div>

      <AnimatePresence>
        {phase === 'finish' && (
          <motion.div
            className="absolute inset-0 bg-[#050505] z-50 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.0, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
