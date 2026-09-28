import React, { useState } from 'react';
import { Player, Page } from '../types.ts';
import { MAIN_LOGO_URL } from '../constants.tsx';

interface RankingProps {
  players: Player[];
  currentUser: any;
  onPageChange: (page: Page) => void;
}

const Ranking: React.FC<RankingProps> = ({ players, currentUser, onPageChange }) => {
  const [exportFeedback, setExportFeedback] = useState(false);

  // Sorting strictly by goals scored
  const sortedPlayers = [...players].sort((a, b) => (b.goals || 0) - (a.goals || 0));

  const top1 = sortedPlayers[0] || {
    name: 'A definir',
    goals: 0,
    photoUrl: 'https://ui-avatars.com/api/?name=1&background=003a75&color=fff',
    position: '-',
    playerType: 'mensalista'
  };

  const top2 = sortedPlayers[1] || {
    name: 'A definir',
    goals: 0,
    photoUrl: 'https://ui-avatars.com/api/?name=2&background=003a75&color=fff',
    position: '-',
    playerType: 'mensalista'
  };

  const top3 = sortedPlayers[2] || {
    name: 'A definir',
    goals: 0,
    photoUrl: 'https://ui-avatars.com/api/?name=3&background=003a75&color=fff',
    position: '-',
    playerType: 'mensalista'
  };

  const totalLeagueGoals = players.reduce((sum, p) => sum + (p.goals || 0), 0);

  const handleExportWhatsApp = () => {
    setExportFeedback(true);
    let text = `⚽ *OUSADIA & ALEGRIA - ARTILHARIA GERAL DA TEMPORADA* ⚽\n\n` +
      `👑 *1º Lugar (Chuteira de Ouro):* ${top1.name} - ${top1.goals || 0} Gols\n` +
      `🥈 *2º Lugar:* ${top2.name} - ${top2.goals || 0} Gols\n` +
      `🥉 *3º Lugar:* ${top3.name} - ${top3.goals || 0} Gols\n\n` +
      `📊 *Total de Gols na Temporada:* ${totalLeagueGoals} gols marcados\n\n` +
      `📲 Acesse a tabela completa no app: https://pelada-app.vercel.app/`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    setTimeout(() => {
      setExportFeedback(false);
      window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
    }, 800);
  };

  const restPlayers = sortedPlayers.slice(3);

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto pb-6 gap-4 animate-fade-in">
      {/* BARRA DE RESUMO + EXPORTAR ZAP */}
      <div className="w-full rounded-2xl bg-surface-container-lowest p-3.5 sm:p-4 shadow-xs border border-surface-container-high/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0 border border-amber-500/30">
            <span className="material-symbols-outlined text-[22px]">emoji_events</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-sm sm:text-base text-navy-deep font-bold">
                Temporada 2026
              </span>
              <span className="bg-secondary-fixed text-on-secondary-fixed text-[10px] px-2 py-0.5 rounded-full uppercase font-bold">
                {totalLeagueGoals} Gols
              </span>
            </div>
            <span className="font-body-sm text-xs text-outline block">
              Ranking oficial de artilharia • {players.length} atletas
            </span>
          </div>
        </div>

        <button 
          onClick={handleExportWhatsApp}
          className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-headline-sm text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">share</span>
          <span>{exportFeedback ? 'COPIADO!' : 'ZAP ARTILHARIA'}</span>
        </button>
      </div>

      {/* PÓDIO DOS ARTILHEIROS (RESPONSIVO EM 3 COLUNAS NO MOBILE E DESKTOP) */}
      <section className="grid grid-cols-3 gap-2 sm:gap-4 items-end pt-2">
        {/* #2 CARD - SILVER */}
        <div className="relative rounded-2xl p-2.5 sm:p-4 bg-surface-container-lowest shadow-sm flex flex-col items-center text-center gap-1 border border-surface-container-high/50">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface font-label-caps text-[11px] sm:text-xs font-bold">
            2º
          </div>
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-slate-300 my-0.5 shadow-xs">
            <img src={top2.photoUrl} alt={top2.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <span className="font-headline-sm text-xs sm:text-sm text-navy-deep font-bold truncate w-full">
            {top2.name}
          </span>
          <span className="text-[10px] text-outline truncate w-full">
            {top2.position}
          </span>
          <div className="flex items-baseline gap-1 mt-1 bg-surface-container-low px-2.5 py-0.5 rounded-full">
            <span className="font-scoreboard-num text-xl sm:text-2xl text-navy-deep leading-none font-bold">
              {top2.goals || 0}
            </span>
            <span className="font-label-caps text-[9px] sm:text-[10px] text-outline">GOLS</span>
          </div>
        </div>

        {/* #1 CARD - GOLDEN ELEVATED */}
        <div className="relative rounded-2xl p-3 sm:p-5 bg-gradient-to-b from-amber-500/15 via-surface-container-lowest to-surface-container-lowest border-2 border-amber-400 shadow-lg flex flex-col items-center text-center gap-1 -translate-y-2">
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-on-primary-fixed shadow-sm font-bold">
            <span className="material-symbols-outlined text-[16px] sm:text-[20px] text-canvas-white">military_tech</span>
          </div>

          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full overflow-hidden border-3 border-amber-400 my-0.5 shadow-sm">
            <img src={top1.photoUrl} alt={top1.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>

          <span className="font-headline-sm text-xs sm:text-base text-navy-deep font-bold truncate w-full">
            {top1.name}
          </span>
          <span className="text-[9px] sm:text-[10px] text-amber-800 bg-amber-400/25 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider truncate max-w-full">
            👑 1º Lugar
          </span>

          <div className="flex items-baseline gap-1 mt-1 bg-amber-400/20 px-3 py-1 rounded-full">
            <span className="font-scoreboard-num text-2xl sm:text-3xl text-primary-container leading-none font-bold">
              {top1.goals || 0}
            </span>
            <span className="font-label-caps text-[10px] sm:text-xs text-navy-deep font-bold">GOLS</span>
          </div>
        </div>

        {/* #3 CARD - BRONZE */}
        <div className="relative rounded-2xl p-2.5 sm:p-4 bg-surface-container-lowest shadow-sm flex flex-col items-center text-center gap-1 border border-surface-container-high/50">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-amber-700/20 text-amber-900 flex items-center justify-center font-label-caps text-[11px] sm:text-xs font-bold">
            3º
          </div>
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-amber-700/30 my-0.5 shadow-xs">
            <img src={top3.photoUrl} alt={top3.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <span className="font-headline-sm text-xs sm:text-sm text-navy-deep font-bold truncate w-full">
            {top3.name}
          </span>
          <span className="text-[10px] text-outline truncate w-full">
            {top3.position}
          </span>
          <div className="flex items-baseline gap-1 mt-1 bg-surface-container-low px-2.5 py-0.5 rounded-full">
            <span className="font-scoreboard-num text-xl sm:text-2xl text-navy-deep leading-none font-bold">
              {top3.goals || 0}
            </span>
            <span className="font-label-caps text-[9px] sm:text-[10px] text-outline">GOLS</span>
          </div>
        </div>
      </section>

      {/* DEMAIS COLOCADOS (4º EM DIANTE - SEM REPETIR O PÓDIO) */}
      {restPlayers.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="font-label-caps text-xs text-outline uppercase tracking-wider font-bold">
              DEMAIS ARTILHEIROS (4º AO {sortedPlayers.length}º)
            </span>
          </div>

          <div className="w-full rounded-2xl bg-surface-container-lowest shadow-xs border border-surface-container-high/40 overflow-hidden divide-y divide-surface-container-high/40">
            {restPlayers.map((player, index) => {
              const rankPos = index + 4;
              const isUser = player.id === currentUser?.uid;

              return (
                <div 
                  key={player.id}
                  className={`flex items-center justify-between p-3 transition-colors ${
                    isUser 
                      ? 'bg-secondary-fixed/30 border-l-4 border-l-secondary' 
                      : 'hover:bg-surface-container-low/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-scoreboard-num text-lg leading-none w-7 text-center shrink-0 text-outline">
                      {rankPos}º
                    </span>

                    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-surface-container shadow-xs">
                      <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-headline-sm text-sm text-navy-deep font-bold truncate">
                          {player.name}
                        </span>
                        {isUser && (
                          <span className="text-[10px] font-bold text-secondary bg-secondary-fixed px-1.5 py-0.5 rounded uppercase shrink-0">
                            Você
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-outline truncate">
                        {player.position}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pl-2">
                    <span className="font-scoreboard-num text-2xl text-primary-container font-bold leading-none">
                      {player.goals || 0}
                    </span>
                    <span className="font-label-caps text-outline text-[11px]">
                      {player.goals === 1 ? 'GOL' : 'GOLS'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default Ranking;
