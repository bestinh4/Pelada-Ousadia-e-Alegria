import React from 'react';

interface SantaHatProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Gorro de Natal profissional vetorizado em SVG, desenhado especificamente
 * para encaixar sobre o escudo do Ousadia & Alegria Futebol Clube.
 */
export const SantaHat: React.FC<SantaHatProps> = ({ 
  className = '', 
  size = 'md' 
}) => {
  // Ajustes de proporção para diferentes locais (header, splash, cards)
  const sizeStyles = {
    sm: 'w-7 h-6 -top-3 -left-2.5',
    md: 'w-10 h-8 -top-4 -left-3.5',
    lg: 'w-14 h-11 -top-6 -left-4',
    xl: 'w-24 h-20 -top-10 -left-6'
  };

  return (
    <div 
      className={`absolute z-30 pointer-events-none select-none transition-transform duration-200 transform -rotate-12 ${sizeStyles[size]} ${className}`}
      title="Ousadia & Alegria - Edição Especial de Natal"
    >
      <svg 
        viewBox="0 0 120 95" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full filter drop-shadow-[0_4px_6px_rgba(0,0,0,0.45)]"
      >
        <defs>
          {/* Gradiente do tecido aveludado vermelho do gorro */}
          <linearGradient id="oaVelvetRed" x1="20" y1="20" x2="100" y2="75" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ff2a4b" />
            <stop offset="45%" stopColor="#dc2626" />
            <stop offset="85%" stopColor="#991b1b" />
            <stop offset="100%" stopColor="#5f0c0c" />
          </linearGradient>

          {/* Brilho da dobra do tecido */}
          <linearGradient id="oaHatHighlight" x1="30" y1="25" x2="65" y2="45" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Gradiente da pelúcia branca com volume e sombra */}
          <linearGradient id="oaWhiteFur" x1="60" y1="60" x2="60" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>

          {/* Gradiente do pompom */}
          <radialGradient id="oaPompom" cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#94a3b8" />
          </radialGradient>
        </defs>

        {/* 1. Sombra de profundidade interna */}
        <path
          d="M25 72 C35 30 65 14 85 24 C100 32 108 52 105 68 C80 62 48 65 25 72 Z"
          fill="#450a0a"
          opacity="0.3"
        />

        {/* 2. Corpo do Gorro Vermelho (Curvado com dobra natural para a direita) */}
        <path
          d="M22 72 C28 42 48 20 72 16 C88 14 102 24 108 42 C110 50 114 62 108 70 C102 75 92 68 84 62 C62 60 40 66 22 72 Z"
          fill="url(#oaVelvetRed)"
        />

        {/* 3. Brilho acetinado na curva do gorro */}
        <path
          d="M32 64 C38 42 54 26 74 22 C84 20 92 25 96 36 C86 32 72 32 58 40 C46 48 38 56 32 64 Z"
          fill="url(#oaHatHighlight)"
        />

        {/* 4. Ponta dobrada para o lado direito */}
        <path
          d="M96 36 C105 40 112 50 110 65 C108 72 100 75 95 70 C92 66 92 56 94 48 C95 44 95 40 96 36 Z"
          fill="#b91c1c"
        />

        {/* 5. Pompom branco felpudo na ponta */}
        <g transform="translate(104, 70)">
          <circle cx="0" cy="0" r="11" fill="url(#oaPompom)" />
          {/* Detalhes de textura do pompom */}
          <circle cx="-3" cy="-4" r="5" fill="#ffffff" opacity="0.6" />
          <circle cx="4" cy="3" r="4" fill="#cbd5e1" opacity="0.5" />
          <circle cx="-4" cy="3" r="3.5" fill="#94a3b8" opacity="0.35" />
        </g>

        {/* 6. Barra inferior de pelúcia branca fofa (cobre a borda do escudo) */}
        {/* Nuvens/gomos de pelúcia para dar efeito fofo tridimensional */}
        <path
          d="M14 74 
             C14 67, 24 67, 28 72 
             C33 66, 45 66, 49 71 
             C54 65, 66 65, 71 70 
             C76 65, 88 65, 93 70 
             C98 67, 108 68, 108 75 
             C108 83, 98 84, 94 81 
             C89 86, 76 86, 71 81 
             C66 87, 54 87, 49 81 
             C44 86, 32 86, 28 81 
             C23 85, 14 82, 14 74 Z"
          fill="url(#oaWhiteFur)"
          stroke="#e2e8f0"
          strokeWidth="1.2"
        />

        {/* Brilhos na barra de pelúcia */}
        <ellipse cx="30" cy="73" rx="7" ry="3.5" fill="#ffffff" opacity="0.75" />
        <ellipse cx="51" cy="72" rx="8" ry="3.5" fill="#ffffff" opacity="0.75" />
        <ellipse cx="73" cy="72" rx="8" ry="3.5" fill="#ffffff" opacity="0.75" />
        <ellipse cx="94" cy="73" rx="7" ry="3.5" fill="#ffffff" opacity="0.75" />
      </svg>
    </div>
  );
};
