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
    name: 'Gabriel Gol',
    goals: 24,
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    position: 'Atacante',
    playerType: 'mensalista'
  };

  const top2 = sortedPlayers[1] || {
    name: 'Matheuzinho',
    goals: 19,
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    position: 'Meia-atacante',
    playerType: 'mensalista'
  };

  const top3 = sortedPlayers[2] || {
    name: 'Luan Canhota',
    goals: 15,
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    position: 'Ponta',
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

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto px-margin pb-space-xl gap-space-md animate-fade-in">
      {/* HEADER CARD */}
      <div className="relative w-full rounded-2xl bg-surface-container-lowest p-space-md shadow-[0_12px_36px_rgba(0,58,117,0.06)] overflow-hidden border border-surface-container-high/40 transition-all">
        {/* Stadium Aura Decoration */}
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-primary-container/10 blur-2xl pointer-events-none animate-pulse-slow"></div>
        <div className="absolute -left-12 -bottom-12 w-36 h-36 rounded-full bg-secondary/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col gap-space-sm">
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0 border border-amber-500/30">
                <span className="material-symbols-outlined text-[22px]">emoji_events</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-container animate-ping"></span>
                  <span className="font-headline-sm text-headline-sm text-navy-deep font-bold">
                    Artilharia & Ranking Geral
                  </span>
                </div>
                <span className="font-body-sm text-body-sm text-outline">
                  Temporada 2026 • Scout oficial de gols marcados
                </span>
              </div>
            </div>

            <span className="bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
              AO VIVO
            </span>
          </div>
        </div>
      </div>

      {/* TOP 3 PODIUM CARDS */}
      <section className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between">
          <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider">
            PÓDIO DOS ARTILHEIROS
          </span>
          <span className="font-body-sm text-body-sm text-outline">
            {totalLeagueGoals} gols somados
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md items-end">
          {/* #2 CARD - SILVER */}
          <div className="order-2 md:order-1 relative rounded-2xl p-space-md bg-surface-container-lowest shadow-md flex flex-col items-center text-center gap-space-xs border border-surface-container-high/40 animate-slide-up transition-transform duration-300 hover:scale-[1.02]">
            <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface font-label-caps text-label-caps font-bold shadow-sm">
              2º
            </div>
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-surface-container-highest my-1 shadow-sm">
              <img src={top2.photoUrl} alt={top2.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <span className="font-headline-sm text-headline-sm text-navy-deep font-bold break-words max-w-full text-center">
              {top2.name}
            </span>
            <span className="font-body-sm text-body-sm text-outline -mt-1">
              {top2.position}
            </span>
            <div className="flex items-baseline gap-1 mt-1 bg-surface-container-low px-3 py-1 rounded-full">
              <span className="font-scoreboard-num text-[28px] text-navy-deep leading-none font-bold">
                {top2.goals || 0}
              </span>
              <span className="font-label-caps text-[11px] text-outline">GOLS</span>
            </div>
          </div>

          {/* #1 CARD - GOLDEN ELEVATED */}
          <div className="order-1 md:order-2 relative rounded-2xl p-space-md bg-gradient-to-b from-amber-500/10 via-surface-container-lowest to-surface-container-lowest border-2 border-amber-400 shadow-xl flex flex-col items-center text-center gap-space-xs -translate-y-2 md:-translate-y-4 animate-pop-in transition-transform duration-300 hover:scale-[1.03]">
            {/* Animated Trophy */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-on-primary-fixed shadow-md shadow-amber-400/30 font-label-caps text-label-caps font-bold animate-bounce-slow">
              <span className="material-symbols-outlined text-[20px] text-canvas-white">military_tech</span>
            </div>

            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-amber-400 my-1 shadow-md shadow-amber-400/20">
              <img src={top1.photoUrl} alt={top1.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>

            <span className="font-headline-sm text-headline-sm text-navy-deep font-bold break-words max-w-full text-center">
              {top1.name}
            </span>
            <span className="font-label-caps text-[11px] text-amber-700 bg-amber-400/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              👑 Chuteira de Ouro
            </span>

            {/* Huge Goal Stat */}
            <div className="flex items-baseline gap-1.5 mt-2 bg-gradient-to-r from-amber-400/20 to-primary-container/10 px-4 py-1.5 rounded-full">
              <span className="font-scoreboard-num text-[38px] text-primary-container leading-none font-bold">
                {top1.goals || 0}
              </span>
              <span className="font-label-caps text-[13px] text-navy-deep font-bold">GOLS MARCADOS</span>
            </div>
          </div>

          {/* #3 CARD - BRONZE */}
          <div className="order-3 md:order-3 relative rounded-2xl p-space-md bg-surface-container-lowest shadow-md flex flex-col items-center text-center gap-space-xs border border-surface-container-high/40 animate-slide-up transition-transform duration-300 hover:scale-[1.02]">
            <div className="w-8 h-8 rounded-full bg-amber-700/20 text-amber-900 flex items-center justify-center font-label-caps text-label-caps font-bold shadow-sm">
              3º
            </div>
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-amber-700/30 my-1 shadow-sm">
              <img src={top3.photoUrl} alt={top3.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <span className="font-headline-sm text-headline-sm text-navy-deep font-bold break-words max-w-full text-center">
              {top3.name}
            </span>
            <span className="font-body-sm text-body-sm text-outline -mt-1">
              {top3.position}
            </span>
            <div className="flex items-baseline gap-1 mt-1 bg-surface-container-low px-3 py-1 rounded-full">
              <span className="font-scoreboard-num text-[28px] text-navy-deep leading-none font-bold">
                {top3.goals || 0}
              </span>
              <span className="font-label-caps text-[11px] text-outline">GOLS</span>
            </div>
          </div>
        </div>
      </section>

      {/* FULL LEADERBOARD TABLE - STRICTLY GOALS */}
      <section className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-container text-[20px]">sports_soccer</span>
            <h2 className="font-headline-sm text-headline-sm text-navy-deep font-bold">
              Classificação dos Artilheiros
            </h2>
          </div>
          <span className="font-label-md text-label-md text-outline">
            {players.length} Atletas
          </span>
        </div>

        <div className="w-full rounded-2xl bg-surface-container-lowest shadow-sm border border-surface-container-high/40 overflow-hidden divide-y divide-surface-container-high/40">
          {sortedPlayers.map((player, idx) => {
            const isPodium = idx < 3;
            const isUser = player.id === currentUser?.uid;

            return (
              <div 
                key={player.id}
                className={`flex items-center justify-between p-space-sm transition-colors ${
                  isUser 
                    ? 'bg-secondary-fixed/30 border-l-4 border-l-secondary' 
                    : 'hover:bg-surface-container-low/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`font-scoreboard-num text-[20px] leading-none w-6 text-center shrink-0 ${
                    idx === 0 
                      ? 'text-amber-500 font-bold' 
                      : idx === 1 
                        ? 'text-slate-400 font-bold' 
                        : idx === 2 
                          ? 'text-amber-700 font-bold' 
                          : 'text-outline'
                  }`}>
                    {idx + 1}º
                  </span>

                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-surface-container shadow-xs">
                    <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-headline-sm text-headline-sm text-navy-deep break-words">
                          {player.name}
                        </span>
                        {isUser && (
                          <span className="text-[10px] font-bold text-secondary bg-secondary-fixed px-1.5 py-0.2 rounded uppercase shrink-0">
                            Você
                          </span>
                        )}
                      </div>
                      <span className="font-body-sm text-body-sm text-outline break-words">
                        {player.position} • {player.playerType === 'mensalista' ? 'Mensalista' : 'Avulso'}
                      </span>
                    </div>
                </div>

                {/* Single Scout: Gols Marcados */}
                <div className="flex items-center gap-1.5 shrink-0 pl-2">
                  <span className="font-scoreboard-num text-[28px] text-primary-container font-bold leading-none">
                    {player.goals || 0}
                  </span>
                  <span className="font-label-caps text-label-caps text-outline text-[12px]">
                    {player.goals === 1 ? 'GOL' : 'GOLS'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* WHATSAPP EXPORT CARD */}
      <section className="rounded-2xl p-space-md bg-gradient-to-br from-tertiary-container via-tertiary to-navy-deep text-on-tertiary shadow-xl flex flex-col sm:flex-row items-center justify-between gap-space-sm">
        <div className="flex flex-col">
          <span className="font-headline-sm text-headline-sm font-bold">
            Compartilhar Artilharia no WhatsApp
          </span>
          <span className="font-body-sm text-body-sm opacity-90">
            Envie o resumo dos maiores goleadores direto no grupo da pelada!
          </span>
        </div>

        <button 
          onClick={handleExportWhatsApp}
          className="w-full sm:w-auto px-5 py-3 rounded-xl bg-canvas-white text-navy-deep font-headline-sm text-headline-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all shrink-0 hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[20px] text-tertiary">share</span>
          <span>{exportFeedback ? 'COPIADO!' : 'ENVIAR PRO ZAP'}</span>
        </button>
      </section>
    </div>
  );
};

export default Ranking;
