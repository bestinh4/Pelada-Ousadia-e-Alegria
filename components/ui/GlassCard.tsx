
import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'light' | 'dark' | 'red' | 'blue';
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', variant = 'light' }) => {
  const baseStyle = "p-6 sm:p-8 transition-all duration-300 overflow-hidden relative";
  
  const variants = {
    light: "bg-white/95 backdrop-blur-xl border border-slate-200/80 shadow-elite-card rounded-[2rem]",
    dark: "bg-[#0a1931] text-white border border-white/10 shadow-2xl rounded-[2rem]",
    red: "bg-gradient-to-r from-primary to-primary-deep text-white shadow-glow-red rounded-[2rem]",
    blue: "bg-gradient-to-r from-navy to-navy-light text-white shadow-glow-navy rounded-[2rem]"
  };

  return (
    <div className={`${baseStyle} ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
};

