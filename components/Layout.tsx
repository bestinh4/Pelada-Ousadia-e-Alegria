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
      return 'Convocação & Início';
    case Page.PlayerList:
      return 'Lista de Presença';
    case Page.ArenaPanel:
    case Page.TeamBalancing:
      return 'Sorteio & Equipes';
    case Page.Ranking:
      return 'Artilharia da Temporada';
    case Page.Finance:
      return 'Cofre & Finanças';
    case Page.Profile:
      return 'Meu Perfil';
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
    <div className="bg-surface dot-matrix-bg text-on-surface font-body-md text-body-md flex flex-col min-h-screen overflow-x-hidden">
      {/* FIXED TOP HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 pt-safe bg-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-surface-container-high/40">
        <div className="h-14 sm:h-16 px-3 sm:px-6 max-w-5xl mx-auto flex items-center justify-between w-full gap-2">
          {/* Brand Lockup with Real Logo */}
          <div 
            onClick={() => onPageChange(Page.Dashboard)}
            className="flex items-center gap-2.5 cursor-pointer select-none active:scale-[0.98] transition-transform duration-150 group min-w-0"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary-container via-primary-bright to-navy-deep p-[2px] flex items-center justify-center shadow-sm shrink-0">
              <div className="w-full h-full bg-surface-container-lowest rounded-[10px] flex items-center justify-center p-1 overflow-hidden">
                <img 
                  src={MAIN_LOGO_URL} 
                  alt="Ousadia & Alegria" 
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-headline-sm sm:font-headline-lg-mobile text-sm sm:text-base text-navy-deep font-bold leading-none tracking-wide truncate">
                OUSADIA & ALEGRIA
              </span>
              <span className="font-label-md text-[11px] text-outline leading-none mt-1 truncate">
                {pageTitle}
              </span>
            </div>
          </div>

          {/* Right Action: Profile Access */}
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={() => onPageChange(Page.Profile)}
              className={`h-9 pl-1.5 pr-2.5 rounded-full flex items-center gap-2 transition-all duration-150 active:scale-95 border ${
                currentPage === Page.Profile
                  ? 'bg-navy-deep text-white border-navy-deep shadow-xs'
                  : 'bg-surface-container-lowest hover:bg-surface-container text-navy-deep border-surface-container-high/60'
              }`}
              title="Meu Perfil e Configurações"
            >
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center overflow-hidden shrink-0">
                {currentUser?.photoURL ? (
                  <img 
                    src={currentUser.photoURL} 
                    alt="Perfil" 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="material-symbols-outlined text-on-primary text-[15px]">person</span>
                )}
              </div>
              <span className="text-xs font-bold whitespace-nowrap">
                Perfil
              </span>
              {isAdmin && (
                <span className="hidden sm:inline-block w-2 h-2 rounded-full bg-primary-container" title="Diretoria"></span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT SCROLL AREA */}
      <main className="flex flex-col relative w-full pt-16 sm:pt-20 pb-24 sm:pb-28 bg-transparent min-h-screen max-w-5xl mx-auto px-3 sm:px-6">
        {children}
      </main>

      {/* FIXED BOTTOM NAVIGATION BAR */}
      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 pb-safe bg-surface/95 backdrop-blur-xl shadow-[0_-1px_12px_rgba(0,58,117,0.08)] border-t border-surface-container-high/40 touch-manipulation"
      >
        <div className={`h-16 px-2 max-w-5xl mx-auto grid ${isAdmin ? 'grid-cols-5' : 'grid-cols-4'} items-center`}>
          {/* Tab 1: Início */}
          <button
            onClick={() => onPageChange(Page.Dashboard)}
            className={`flex flex-col items-center justify-center gap-0.5 h-full transition-all duration-150 active:scale-95 touch-manipulation ${
              currentPage === Page.Dashboard
                ? 'text-primary-container font-bold'
                : 'text-on-surface-variant hover:text-navy-deep'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">dashboard</span>
            <span className="font-label-md text-[10px] sm:text-xs whitespace-nowrap">Início</span>
          </button>

          {/* Tab 2: Presença */}
          <button
            onClick={() => onPageChange(Page.PlayerList)}
            className={`flex flex-col items-center justify-center gap-0.5 h-full transition-all duration-150 active:scale-95 touch-manipulation ${
              currentPage === Page.PlayerList
                ? 'text-primary-container font-bold'
                : 'text-on-surface-variant hover:text-navy-deep'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">how_to_reg</span>
            <span className="font-label-md text-[10px] sm:text-xs whitespace-nowrap">Presença</span>
          </button>

          {/* Tab 3: Equipes & Sorteio (Center Action Button) */}
          <button
            onClick={() => onPageChange(Page.TeamBalancing)}
            className="flex flex-col items-center justify-center gap-0.5 h-full transition-all duration-150 active:scale-95 group touch-manipulation"
          >
            <div className={`w-10 h-10 -mt-3 rounded-full bg-gradient-to-br from-primary-container to-navy-deep flex items-center justify-center shadow-md shadow-primary/25 transition-transform duration-200 ${
              currentPage === Page.TeamBalancing || currentPage === Page.ArenaPanel ? 'ring-2 ring-primary-bright scale-105' : ''
            }`}>
              <span className="material-symbols-outlined text-on-primary text-[22px]">groups</span>
            </div>
            <span className={`font-label-md text-[10px] sm:text-xs whitespace-nowrap ${
              currentPage === Page.TeamBalancing || currentPage === Page.ArenaPanel ? 'text-primary-container font-bold' : 'text-on-surface-variant'
            }`}>Equipes</span>
          </button>

          {/* Tab 4: Ranking */}
          <button
            onClick={() => onPageChange(Page.Ranking)}
            className={`flex flex-col items-center justify-center gap-0.5 h-full transition-all duration-150 active:scale-95 touch-manipulation ${
              currentPage === Page.Ranking
                ? 'text-primary-container font-bold'
                : 'text-on-surface-variant hover:text-navy-deep'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">leaderboard</span>
            <span className="font-label-md text-[10px] sm:text-xs whitespace-nowrap">Ranking</span>
          </button>

          {/* Tab 5: Cofre / Finanças (Exclusivo Diretoria) */}
          {isAdmin && (
            <button
              onClick={() => onPageChange(Page.Finance)}
              className={`flex flex-col items-center justify-center gap-0.5 h-full transition-all duration-150 active:scale-95 touch-manipulation ${
                currentPage === Page.Finance
                  ? 'text-primary-container font-bold'
                  : 'text-on-surface-variant hover:text-navy-deep'
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
              <span className="font-label-md text-[10px] sm:text-xs whitespace-nowrap">Cofre</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
