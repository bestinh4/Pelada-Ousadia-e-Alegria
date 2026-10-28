import React from 'react';

/**
 * Pisca-pisca natalino elegante e sutil para a barra superior do app.
 * Efeito visual leve com brilho festivo suave.
 */
export const ChristmasLights: React.FC = () => {
  const bulbs = [
    { color: '#ef4444', glow: 'rgba(239, 68, 68, 0.65)', delay: '0s' },
    { color: '#eab308', glow: 'rgba(234, 179, 8, 0.65)', delay: '0.4s' },
    { color: '#10b981', glow: 'rgba(16, 185, 129, 0.65)', delay: '0.8s' },
    { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.65)', delay: '1.2s' },
    { color: '#f43f5e', glow: 'rgba(244, 63, 94, 0.65)', delay: '0.2s' },
    { color: '#eab308', glow: 'rgba(234, 179, 8, 0.65)', delay: '0.6s' },
    { color: '#10b981', glow: 'rgba(16, 185, 129, 0.65)', delay: '1.0s' },
    { color: '#ef4444', glow: 'rgba(239, 68, 68, 0.65)', delay: '1.4s' },
    { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.65)', delay: '0.3s' },
    { color: '#eab308', glow: 'rgba(234, 179, 8, 0.65)', delay: '0.7s' },
    { color: '#10b981', glow: 'rgba(16, 185, 129, 0.65)', delay: '1.1s' },
    { color: '#ef4444', glow: 'rgba(239, 68, 68, 0.65)', delay: '0.5s' },
    { color: '#eab308', glow: 'rgba(234, 179, 8, 0.65)', delay: '0.9s' },
    { color: '#10b981', glow: 'rgba(16, 185, 129, 0.65)', delay: '1.3s' },
  ];

  return (
    <>
      <style>{`
        @keyframes oaLightTwinkle {
          0%, 100% {
            opacity: 0.35;
            filter: drop-shadow(0 0 1px transparent);
            transform: scale(0.92);
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 4px var(--bulb-glow));
            transform: scale(1.08);
          }
        }
      `}</style>
      <div 
        className="absolute -bottom-1 left-0 right-0 h-2 flex items-center justify-around pointer-events-none z-30 overflow-hidden px-2 select-none"
        aria-hidden="true"
      >
        {bulbs.map((bulb, i) => (
          <div
            key={i}
            className="flex flex-col items-center"
            style={{ ['--bulb-glow' as any]: bulb.glow }}
          >
            {/* Soquete da lâmpada */}
            <div className="w-[3px] h-[2px] bg-emerald-950 rounded-t-sm" />
            {/* Bulbo luminoso */}
            <div
              className="w-1.5 h-2 rounded-full"
              style={{
                backgroundColor: bulb.color,
                animation: `oaLightTwinkle 1.8s ease-in-out infinite`,
                animationDelay: bulb.delay,
              }}
            />
          </div>
        ))}
      </div>
    </>
  );
};
