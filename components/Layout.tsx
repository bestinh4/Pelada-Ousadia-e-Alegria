import React from 'react';
import { Page } from '../types.ts';
import { MAIN_LOGO_URL } from '../constants.tsx';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: Page;
  onPageChange: (page: Page) => void;
  currentUserRole?: 'admin' | 'player';
  currentUser?: any;
}

const getPageTitle = (page: Page): string => {
  switch (page) {
    case Page.Dashboard:
      return 'Início';
    case Page.PlayerList:
      return 'Presença';
    case Page.ArenaPanel:
    case Page.TeamBalancing:
      return 'Sorteio & Equipes';
    case Page.Ranking:
      return 'Ranking';
    case Page.Finance:
      return 'Cofre & PIX';
    case Page.Profile:
      return 'Perfil';
    case Page.TeamBalancing:
      return 'Equilibrar Times';
    case Page.CreateMatch:
      return 'Nova Pelada';
    default:
      return 'Pelada';
  }
};

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  currentPage, 
  onPageChange, 
  currentUserRole,
  currentUser 
}) => {
  if (currentPage === Page.Login || currentPage === Page.Onboarding) {
    return <>{children}</>;
  }

  const isAdmin = currentUserRole === 'admin';
  const pageTitle = getPageTitle(currentPage);

  return (
    <div className="bg-surface dot-matrix-bg text-on-surface font-body-md text-body-md flex flex-col min-h-screen">
      {/* FIXED TOP HEADER */}
      <header className="fixed top-0 w-full z-50 pt-safe bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-surface-container-high/40">
        <div className="h-16 px-gutter max-w-2xl lg:max-w-4xl mx-auto flex items-center justify-between w-full">
          {/* Brand Lockup with Real Logo */}
          <div 
            onClick={() => onPageChange(Page.Dashboard)}
            className="flex items-center gap-space-sm cursor-pointer select-none active:scale-[0.96] transition-transform duration-200 group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-container via-primary-bright to-navy-deep p-[2px] flex items-center justify-center shadow-md shadow-primary-container/20 group-hover:shadow-primary-container/40 transition-all duration-300">
              <div className="w-full h-full bg-surface-container-lowest rounded-[10px] flex items-center justify-center p-1 overflow-hidden">
                <img 
                  src={MAIN_LOGO_URL} 
                  alt="Ousadia & Alegria" 
                  className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300"
                />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-lg-mobile text-headline-lg-mobile text-navy-deep leading-none tracking-wide">
                OUSADIA & ALEGRIA
              </span>
              <span className="font-label-md text-label-md text-outline leading-none mt-0.5">
                {pageTitle}
              </span>
            </div>
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center gap-space-xs">
            <button 
              onClick={() => onPageChange(Page.Profile)}
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center overflow-hidden ring-2 ring-primary/20 active:scale-90 transition-transform duration-200"
              title="Meu Perfil"
            >
              {currentUser?.photoURL ? (
                <img 
                  src={currentUser.photoURL} 
                  alt="Perfil" 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT SCROLL AREA */}
      <main className="flex flex-col relative w-full pt-20 pb-28 bg-transparent min-h-screen max-w-2xl lg:max-w-4xl mx-auto px-margin">
        {children}
      </main>

      {/* FIXED BOTTOM NAVIGATION BAR */}
      <nav 
        className="fixed bottom-0 w-full z-50 pb-safe bg-surface/90 backdrop-blur-xl shadow-[0_-1px_12px_rgba(0,58,117,0.08)] border-t border-surface-container-high/40 touch-manipulation"
      >
        <div className="h-16 sm:h-20 px-space-xs max-w-2xl lg:max-w-4xl mx-auto flex justify-around items-center">
          {/* Tab 1: Início */}
          <button
            onClick={() => onPageChange(Page.Dashboard)}
            className={`flex flex-col items-center justify-center gap-0.5 sm:gap-1 w-16 h-full transition-all duration-150 active:scale-90 touch-manipulation ${
              currentPage === Page.Dashboard
                ? 'text-primary-container font-headline-sm scale-105'
                : 'text-on-surface-variant hover:text-navy-deep'
            }`}
          >
            <span className="material-symbols-outlined text-[24px]">dashboard</span>
            <span className="font-label-md text-[11px] sm:text-label-md">Início</span>
          </button>

          {/* Tab 2: Presença */}
          <button
            onClick={() => onPageChange(Page.PlayerList)}
            className={`flex flex-col items-center justify-center gap-0.5 sm:gap-1 w-16 h-full transition-all duration-150 active:scale-90 touch-manipulation ${
              currentPage === Page.PlayerList
                ? 'text-primary-container font-headline-sm scale-105'
                : 'text-on-surface-variant hover:text-navy-deep'
            }`}
          >
            <span className="material-symbols-outlined text-[24px]">how_to_reg</span>
            <span className="font-label-md text-[11px] sm:text-label-md">Presença</span>
          </button>

          {/* Tab 3: Equipes & Sorteio (Center Action Button) */}
          <button
            onClick={() => onPageChange(Page.TeamBalancing)}
            className={`flex flex-col items-center justify-center gap-0.5 sm:gap-1 w-16 h-full transition-all duration-150 active:scale-90 group touch-manipulation`}
          >
            <div className={`w-11 h-11 -mt-4 rounded-full bg-gradient-to-br from-primary-container to-navy-deep flex items-center justify-center shadow-lg shadow-primary/30 transition-transform duration-200 group-hover:scale-105 ${
              currentPage === Page.TeamBalancing || currentPage === Page.ArenaPanel ? 'ring-2 ring-primary-bright animate-pulse-glow' : ''
            }`}>
              <span className="material-symbols-outlined text-on-primary text-[24px]">groups</span>
            </div>
            <span className={`font-label-md text-[11px] sm:text-label-md ${
              currentPage === Page.TeamBalancing || currentPage === Page.ArenaPanel ? 'text-primary-container font-bold' : 'text-on-surface-variant'
            }`}>Equipes</span>
          </button>

          {/* Tab 4: Ranking */}
          <button
            onClick={() => onPageChange(Page.Ranking)}
            className={`flex flex-col items-center justify-center gap-0.5 sm:gap-1 w-16 h-full transition-all duration-150 active:scale-90 touch-manipulation ${
              currentPage === Page.Ranking
                ? 'text-primary-container font-headline-sm scale-105'
                : 'text-on-surface-variant hover:text-navy-deep'
            }`}
          >
            <span className="material-symbols-outlined text-[24px]">leaderboard</span>
            <span className="font-label-md text-[11px] sm:text-label-md">Ranking</span>
          </button>

          {/* Tab 5: Perfil */}
          <button
            onClick={() => onPageChange(Page.Profile)}
            className={`flex flex-col items-center justify-center gap-0.5 sm:gap-1 w-16 h-full transition-all duration-150 active:scale-90 touch-manipulation ${
              currentPage === Page.Profile
                ? 'text-primary-container font-headline-sm scale-105'
                : 'text-on-surface-variant hover:text-navy-deep'
            }`}
          >
            <span className="material-symbols-outlined text-[24px]">person</span>
            <span className="font-label-md text-[11px] sm:text-label-md">Perfil</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Layout;
