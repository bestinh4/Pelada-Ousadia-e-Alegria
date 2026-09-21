
import React from 'react';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'glass';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const GlassButton: React.FC<GlassButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  ...props 
}) => {
  const base = "font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 rounded-full relative overflow-hidden group";
  
  const variants = {
    primary: "btn-croatia-primary shadow-glow-red",
    secondary: "btn-croatia-secondary",
    outline: "border-2 border-primary text-primary hover:bg-primary/5",
    glass: "bg-white/80 backdrop-blur-md border border-slate-100 text-navy shadow-glass hover:bg-white"
  };

  const sizes = {
    sm: "px-5 h-11 text-[9px]",
    md: "px-7 h-13 text-[10px]",
    lg: "px-9 h-15 text-[11px]",
    xl: "px-12 h-18 text-[12px]"
  };

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  );
};
