import React from 'react';
import { MAIN_LOGO_URL, MAINTENANCE_MASCOTS_IMG } from '../constants.tsx';

interface MaintenanceScreenProps {
  onCheckAgain: () => void;
  onAdminLogin?: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ onCheckAgain, onAdminLogin }) => {
  return (
    <div className="min-h-screen bg-surface dot-matrix-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Stadium Auras */}
      <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-primary-container/15 blur-3xl pointer-events-none animate-pulse-slow"></div>
      <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-secondary/15 blur-3xl pointer-events-none"></div>

      <div className="max-w-lg w-full bg-surface-container-lowest rounded-3xl p-5 sm:p-7 border border-surface-container-high/60 shadow-2xl relative z-10 text-center flex flex-col items-center gap-4 animate-pop-in">
        {/* Header com Escudo e Tag de Manutenção */}
        <div className="flex items-center justify-between w-full border-b border-surface-container-high/40 pb-3">
          <div className="flex items-center gap-2.5">
            <img 
              src={MAIN_LOGO_URL} 
              alt="Ousadia & Alegria" 
              className="w-10 h-10 object-contain drop-shadow-sm"
              referrerPolicy="no-referrer"
            />
            <div className="text-left">
              <h2 className="font-headline-sm text-sm text-navy-deep font-bold leading-tight">
                OUSADIA & ALEGRIA F.C.
              </h2>
              <span className="font-body-sm text-[11px] text-outline">
                App Oficial da Pelada
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 font-label-caps text-[10px] font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            <span>Ajustes Táticos</span>
          </div>
        </div>

        {/* ILUSTRAÇÃO 3D: BONECOS COM OS NOVOS COLETES (AZUL X VERMELHO) */}
        <div className="relative w-full rounded-2xl overflow-hidden shadow-lg border border-surface-container-high/60 group bg-surface-container">
          <img 
            src={MAINTENANCE_MASCOTS_IMG} 
            alt="Mascotes com os novos coletes azul e vermelho da pelada"
            className="w-full aspect-[4/3] object-cover transition-transform duration-700 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
          
          {/* Overlay com informação dos novos coletes */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy-deep/95 via-navy-deep/75 to-transparent p-3 pt-8 flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-blue-600/90 text-white font-label-md text-[10px] font-bold uppercase tracking-wider border border-white/20">
                Colete Azul
              </span>
              <span className="text-[11px] font-bold text-amber-300">🆚</span>
              <span className="px-2 py-0.5 rounded-full bg-red-600/90 text-white font-label-md text-[10px] font-bold uppercase tracking-wider border border-white/20">
                Colete Vermelho
              </span>
            </div>
            <span className="text-[10px] text-white/80 font-medium">
              Novos Mantos Oficiais
            </span>
          </div>
        </div>

        {/* Texto Explicativo */}
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="font-headline-lg-mobile text-[22px] sm:text-[26px] text-navy-deep font-bold leading-tight">
            Estamos em Manutenção!
          </h1>
          <p className="font-body-md text-xs sm:text-sm text-outline leading-relaxed">
            A Diretoria está realizando melhorias técnicas no aplicativo e organizando as próximas rodadas com os novos coletes oficiais.
          </p>
          <div className="bg-surface-container-low p-2.5 rounded-xl border border-surface-container-high/40 mt-1">
            <p className="font-body-sm text-[11px] text-on-surface-variant">
              Por favor, aguarde alguns instantes e volte mais tarde. O app será liberado assim que os ajustes forem concluídos!
            </p>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="w-full flex flex-col gap-2 pt-1">
          <button
            onClick={onCheckAgain}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary-container via-primary-bright to-navy-deep text-on-primary font-headline-sm text-xs sm:text-sm font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            <span>Verificar Novamente</span>
          </button>

          {onAdminLogin && (
            <button
              onClick={onAdminLogin}
              className="w-full py-2 px-4 text-xs font-label-md text-outline hover:text-navy-deep transition-colors"
            >
              Acesso de Administrador
            </button>
          )}
        </div>

        <span className="text-[10px] text-outline/70">
          Ousadia & Alegria F.C. • Gestão Oficial
        </span>
      </div>
    </div>
  );
};
