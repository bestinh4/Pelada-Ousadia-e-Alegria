
import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'light' | 'dark' | 'red' | 'blue';
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', variant = 'light' }) => {
  const baseStyle = "rounded-[2.5rem] p-8 transition-all duration-500 overflow-hidden relative";
  
  const variants = {
    light: "bg-white border border-slate-100 shadow-glass",
    dark: "bg-navy text-white shadow-2xl",
    red: "bg-primary text-white shadow-glow-red",
    blue: "bg-navy-deep text-white shadow-elite"
  };

  return (
    <div className={`${baseStyle} ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
};
