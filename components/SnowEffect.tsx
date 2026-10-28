import React, { useState, useEffect } from 'react';

interface Snowflake {
  id: number;
  left: number;       // 0% a 100%
  size: number;       // 10px a 22px
  duration: number;   // 5s a 13s
  delay: number;      // 0s a 6s
  drift: number;      // -25px a 25px
  opacity: number;    // 0.35 a 0.85
  symbol: string;     // ❄ ou •
}

export const SnowEffect: React.FC = () => {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(() => {
    try {
      return localStorage.getItem('oa_snow_paused') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const symbols = ['❄', '❅', '❆', '•'];
    const flakes: Snowflake[] = Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      left: Math.random() * 98,
      size: Math.round(11 + Math.random() * 12),
      duration: +(5.5 + Math.random() * 7).toFixed(1),
      delay: +(Math.random() * 6).toFixed(1),
      drift: Math.round(-30 + Math.random() * 60),
      opacity: +(0.35 + Math.random() * 0.5).toFixed(2),
      symbol: symbols[Math.floor(Math.random() * symbols.length)]
    }));
    setSnowflakes(flakes);
  }, []);

  const togglePause = () => {
    setIsPaused(prev => {
      const next = !prev;
      try {
        localStorage.setItem('oa_snow_paused', String(next));
      } catch {}
      return next;
    });
  };

  if (isPaused) {
    return (
      <button
        type="button"
        onClick={togglePause}
        className="fixed bottom-20 right-3 z-40 px-2 py-1 rounded-full bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-bold border border-white/20 shadow-md flex items-center gap-1 active:scale-95 transition-all opacity-70 hover:opacity-100"
        title="Ativar efeito de neve natalina"
      >
        <span>❄️</span>
        <span className="hidden sm:inline">Neve</span>
      </button>
    );
  }

  return (
    <>
      <style>{`
        @keyframes oaSnowFall {
          0% {
            transform: translateY(-20px) translateX(0);
            opacity: 0;
          }
          15% {
            opacity: 0.85;
          }
          90% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(105vh) translateX(var(--drift));
            opacity: 0;
          }
        }
      `}</style>
      
      {/* Contêiner de flocos de neve com aceleração por hardware e sem bloquear toques */}
      <div 
        className="fixed inset-0 pointer-events-none z-40 overflow-hidden select-none"
        aria-hidden="true"
      >
        {snowflakes.map((flake) => (
          <span
            key={flake.id}
            style={{
              position: 'absolute',
              top: '-20px',
              left: `${flake.left}%`,
              fontSize: `${flake.size}px`,
              opacity: flake.opacity,
              animationName: 'oaSnowFall',
              animationDuration: `${flake.duration}s`,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
              animationDelay: `${flake.delay}s`,
              color: '#ffffff',
              textShadow: '0 0 4px rgba(255, 255, 255, 0.8), 0 0 10px rgba(186, 230, 253, 0.6)',
              willChange: 'transform, opacity',
              ['--drift' as any]: `${flake.drift}px`
            }}
          >
            {flake.symbol}
          </span>
        ))}
      </div>

      {/* Botão sutil para pausar a neve se o usuário preferir */}
      <button
        type="button"
        onClick={togglePause}
        className="fixed bottom-20 right-3 z-40 px-2 py-1 rounded-full bg-slate-900/60 backdrop-blur-md hover:bg-slate-900 text-white text-[10px] font-bold border border-white/20 shadow-md flex items-center gap-1 active:scale-95 transition-all opacity-50 hover:opacity-100"
        title="Pausar efeito de neve natalina"
      >
        <span>❄️</span>
        <span className="hidden sm:inline">Pausar</span>
      </button>
    </>
  );
};
