
import React from 'react';
import { Page } from '../types.ts';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: Page;
  onPageChange: (page: Page) => void;
  currentUserRole?: 'admin' | 'player';
}

const Layout: React.FC<LayoutProps> = ({ children, currentPage, onPageChange, currentUserRole }) => {
  if (currentPage === Page.Login || currentPage === Page.Onboarding) return <>{children}</>;

  const isAdmin = currentUserRole === 'admin';

  return (
    <div className="flex min-h-screen bg-slate-50 font-display overflow-hidden bg-neo-dots">
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden lg:flex flex-col w-80 bg-white border-r border-slate-100 h-screen sticky top-0 p-10 shadow-soft-white z-50">
        <div className="mb-12 flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-elite border border-slate-100">
            <img src="https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png" className="w-8 h-8 object-contain" alt="" />
          </div>
          <div>
            <h1 className="text-xl font-black text-navy italic leading-none">O&A</h1>
            <p className="text-[9px] font-black text-primary uppercase tracking-widest">ARENA DASHBOARD</p>
          </div>
        </div>

        <nav className="flex-1 space-y-4">
          <SidebarItem 
            icon="stadium" 
            label="ARENA" 
            active={currentPage === Page.Dashboard} 
            onClick={() => onPageChange(Page.Dashboard)} 
          />
          <SidebarItem 
            icon="sports_soccer" 
            label="ELENCO" 
            active={currentPage === Page.PlayerList} 
            onClick={() => onPageChange(Page.PlayerList)} 
          />
          {isAdmin && (
            <SidebarItem 
              icon="podium" 
              label="PAINEL ADM" 
              active={currentPage === Page.ArenaPanel} 
              onClick={() => onPageChange(Page.ArenaPanel)} 
              variant="admin"
            />
          )}
          <SidebarItem 
            icon="emoji_events" 
            label="RANKING" 
            active={currentPage === Page.Ranking} 
            onClick={() => onPageChange(Page.Ranking)} 
          />
          <SidebarItem 
            icon="payments" 
            label="COFRE O&A" 
            active={currentPage === Page.Finance} 
            onClick={() => onPageChange(Page.Finance)} 
          />
          <SidebarItem 
            icon="person" 
            label="MEU PERFIL" 
            active={currentPage === Page.Profile} 
            onClick={() => onPageChange(Page.Profile)} 
          />
        </nav>

        <div className="mt-auto space-y-4 pt-10 border-t border-slate-50">
           <a 
             href="https://pelada-app.vercel.app/" 
             target="_blank" 
             rel="noopener noreferrer"
             className="flex items-center gap-4 p-4 bg-primary/5 rounded-3xl border border-primary/10 hover:bg-primary/10 transition-all group"
           >
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                 <span className="material-symbols-outlined text-primary">language</span>
              </div>
              <div className="flex-1">
                 <p className="text-[10px] font-black text-navy uppercase">SITE PRINCIPAL</p>
                 <p className="text-[8px] font-bold text-primary uppercase">ACESSAR WEB APP</p>
              </div>
              <span className="material-symbols-outlined text-primary text-sm">open_in_new</span>
           </a>

           <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                 <span className="material-symbols-outlined text-navy">settings</span>
              </div>
              <div className="flex-1">
                 <p className="text-[10px] font-black text-navy uppercase">CONFIGURAÇÕES</p>
                 <p className="text-[8px] font-bold text-slate-300 uppercase">GERENCIAR APP</p>
              </div>
           </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-[100dvh] lg:h-screen overflow-hidden relative">
        <div className="flex-1 overflow-y-auto hide-scrollbar pb-36 lg:pb-20 px-6 lg:px-12 max-w-7xl mx-auto w-full">
          {children}
        </div>
        
        {/* MENU INFERIOR MOBILE (HIDDEN ON DESKTOP) */}
        <div className="lg:hidden fixed bottom-8 left-6 right-6 z-[1000] animate-slide-up">
          <nav className="h-20 bg-white/95 backdrop-blur-2xl rounded-full flex items-center justify-around px-4 border border-slate-100 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)]">
            <NavItem 
              icon="stadium" 
              label="Arena" 
              active={currentPage === Page.Dashboard} 
              onClick={() => onPageChange(Page.Dashboard)} 
            />
            <NavItem 
              icon="sports_soccer" 
              label="Elenco" 
              active={currentPage === Page.PlayerList} 
              onClick={() => onPageChange(Page.PlayerList)} 
            />
            {isAdmin && (
              <div className="flex items-center justify-center w-14">
                <button 
                  onClick={() => onPageChange(Page.ArenaPanel)}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 shadow-xl active:scale-90 ${
                    currentPage === Page.ArenaPanel 
                    ? 'bg-primary text-white scale-110 shadow-primary/40' 
                    : 'bg-slate-50 text-navy border border-slate-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[26px] font-light">podium</span>
                </button>
              </div>
            )}
            <NavItem 
              icon="emoji_events" 
              label="Ranking" 
              active={currentPage === Page.Ranking} 
              onClick={() => onPageChange(Page.Ranking)} 
            />
            <NavItem 
              icon="payments" 
              label="Cofre" 
              active={currentPage === Page.Finance} 
              onClick={() => onPageChange(Page.Finance)} 
            />
            <NavItem 
              icon="person" 
              label="Perfil" 
              active={currentPage === Page.Profile} 
              onClick={() => onPageChange(Page.Profile)} 
            />
          </nav>
        </div>
      </div>
    </div>
  );
};

const SidebarItem = ({ icon, label, active, onClick, variant }: { icon: string, label: string, active: boolean, onClick: () => void, variant?: 'admin' }) => (
  <button 
    onClick={onClick}
    className={`w-full h-16 rounded-2xl flex items-center gap-4 px-6 transition-all duration-300 group ${
      active 
      ? (variant === 'admin' ? 'bg-primary text-white shadow-glow-red' : 'bg-navy text-white shadow-elite') 
      : 'hover:bg-slate-50 text-slate-400 hover:text-navy'
    }`}
  >
    <span className={`material-symbols-outlined text-2xl ${active ? 'fill-1' : ''}`}>
      {icon}
    </span>
    <span className="text-[11px] font-black uppercase tracking-widest italic">
      {label}
    </span>
    {active && (
      <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full"></div>
    )}
  </button>
);

const NavItem = ({ icon, active, onClick, label }: { icon: string, active: boolean, onClick: () => void, label: string }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-12 h-full transition-all duration-500 relative ${active ? 'text-primary' : 'text-slate-300'} group`}
  >
    <div className={`transition-all duration-500 flex flex-col items-center ${active ? 'scale-110 -translate-y-1' : 'group-hover:text-primary/60'}`}>
      <span className={`material-symbols-outlined text-[24px] transition-all duration-500 ${active ? 'fill-1' : ''}`}>
        {icon}
      </span>
      <span className={`text-[8px] font-black uppercase tracking-[0.2em] mt-1.5 transition-all duration-500 ${active ? 'opacity-100' : 'opacity-0 scale-50'}`}>
        {label}
      </span>
    </div>
    
    {active && (
      <span className="absolute bottom-1 w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_10px_rgba(227,6,19,0.5)]"></span>
    )}
  </button>
);

export default Layout;
