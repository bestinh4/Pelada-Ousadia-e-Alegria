
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
  const base = "font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2.5 rounded-2xl relative overflow-hidden group active:scale-[0.98]";
  
  const variants = {
    primary: "btn-croatia-primary shadow-glow-red",
    secondary: "btn-croatia-secondary shadow-glow-navy",
    outline: "border-2 border-primary text-primary hover:bg-primary/5",
    glass: "bg-white/90 backdrop-blur-md border border-slate-200/80 text-navy shadow-sm hover:bg-white"
  };

  const sizes = {
    sm: "px-4 h-10 text-[10px]",
    md: "px-6 h-12 text-[11px]",
    lg: "px-8 h-14 text-[12px]",
    xl: "px-10 h-16 text-[13px]"
  };

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  );
};

