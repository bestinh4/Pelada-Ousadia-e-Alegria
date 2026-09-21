
import React from 'react';
import { Player, Page } from '../types.ts';

const Ranking: React.FC<{ players: Player[], currentUser: any, onPageChange: (page: Page) => void }> = ({ players, onPageChange }) => {
  const mainLogoUrl = "https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png";

  const handleShareRanking = (type: 'whatsapp' | 'copy') => {
    const topScorers = players
      .filter(p => p.goals > 0)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 10);

    if (topScorers.length === 0) return alert("Nenhum gol registrado para compartilhar!");

    let msg = `🏆 *RANKING DE ARTILHARIA O&A* 🇭🇷\n`;
    msg += `_Temporada Elite Series_\n`;
    msg += `-------------------------------------------\n\n`;

    topScorers.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '⚽';
      msg += `${medal} *${i + 1}º ${p.name.toUpperCase()}* - ${p.goals} Gols\n`;
    });

    msg += `\n-------------------------------------------\n`;
    msg += `⚽ *Acesse o App:* https://pelada-app.vercel.app/\n`;
    msg += `_Gestão Ousadia & Alegria_`;

    if (type === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      navigator.clipboard.writeText(msg).then(() => alert("Ranking copiado para a área de transferência!"));
    }
  };

  return (
    <div className="flex flex-col animate-fade-in px-4 sm:px-6">
      <header className="py-8 sm:py-12 flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-black text-navy uppercase italic tracking-tighter leading-none">
            ARTILHARIA
          </h2>
          <p className="text-[9px] sm:text-[10px] font-black text-primary uppercase tracking-[0.4em]">
            RANKING DE GOLS
          </p>
        </div>
        <div className="flex gap-2 sm:gap-4">
          <div className="flex gap-2">
            <button 
              onClick={() => handleShareRanking('copy')}
              className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-2xl flex items-center justify-center shadow-soft-white border border-slate-100 text-navy active:scale-90 transition-all"
              title="Copiar Ranking"
            >
              <span className="material-symbols-outlined text-xl">content_copy</span>
            </button>
            <button 
              onClick={() => handleShareRanking('whatsapp')}
              className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-2xl flex items-center justify-center shadow-soft-white border border-slate-100 text-navy active:scale-90 transition-all"
              title="Compartilhar no WhatsApp"
            >
              <span className="material-symbols-outlined text-xl">share</span>
            </button>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-2xl flex items-center justify-center shadow-soft-white animate-float border border-slate-100 p-2">
            <img src={mainLogoUrl} className="w-6 h-6 sm:w-8 sm:h-8 object-contain" />
          </div>
        </div>
      </header>

      <main className="pb-48">
        <div className="space-y-8 sm:space-y-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
            {players.filter(p => p.goals > 0).sort((a,b) => b.goals - a.goals).slice(0, 3).map((p, i) => {
              const rankColors = [
                'bg-amber-400 shadow-glow-amber border-amber-500', 
                'bg-slate-300 shadow-soft-white border-slate-400', 
                'bg-orange-400 shadow-glow-orange border-orange-500'
              ];
              const rankIcons = ['trophy', 'military_tech', 'military_tech'];
              const rankLabels = ['ARTILHEIRO', 'VICE-ARTILHEIRO', 'TERCEIRO LUGAR'];
              const isFirst = i === 0;

              return (
                <div key={p.id} className={`relative pt-12 pb-8 sm:pb-10 px-6 sm:px-8 rounded-[2.5rem] sm:rounded-[3.5rem] border-2 text-center flex flex-col items-center bg-white ${rankColors[i].split(' ')[2]} ${isFirst ? 'scale-105 sm:scale-110 z-20 shadow-xl' : 'scale-100 z-10 opacity-90'}`}>
                  <div className={`absolute -top-6 sm:-top-8 w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] sm:rounded-[2rem] border-4 border-white flex items-center justify-center text-white shadow-2xl ${rankColors[i].split(' ')[0]}`}>
                     <span className="material-symbols-outlined text-3xl sm:text-4xl">{rankIcons[i]}</span>
                  </div>
                  
                  <div className="mt-2 sm:mt-4 mb-4 sm:mb-6">
                    <img src={p.photoUrl} className="w-24 h-24 sm:w-32 sm:h-32 rounded-[2rem] sm:rounded-[2.5rem] object-cover border-4 border-slate-50 shadow-xl mx-auto" alt="" />
                  </div>

                  <div className="space-y-1 mb-4 sm:mb-6">
                    <span className="text-[9px] sm:text-[10px] font-black text-primary uppercase tracking-[0.3em]">{rankLabels[i]}</span>
                    <h3 className="text-xl sm:text-2xl font-black text-navy uppercase italic tracking-tighter leading-none">{p.name}</h3>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-300 uppercase tracking-widest">{p.position}</p>
                  </div>

                  <div className="w-full pt-4 sm:pt-6 border-t border-slate-50 flex justify-around">
                    <div className="text-center">
                      <p className="text-3xl sm:text-4xl font-condensed italic font-black text-navy leading-none">{p.goals}</p>
                      <p className="text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">GOLS</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl sm:text-4xl font-condensed italic font-black text-primary leading-none">{p.assists || 0}</p>
                      <p className="text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">ASSISTS</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-100 rounded-[2.5rem] sm:rounded-[3.5rem] p-6 sm:p-10 shadow-soft-white">
            <div className="flex flex-col sm:flex-row items-center justify-between mb-8 sm:mb-10 px-2 sm:px-4 gap-4">
              <h3 className="text-[10px] sm:text-[12px] font-black uppercase tracking-[0.5em] text-navy italic">CLASSIFICAÇÃO GERAL</h3>
              <span className="text-[9px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest">{players.filter(p => p.goals > 0).length} ATLETAS COM GOL</span>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {players.filter(p => p.goals > 0).sort((a,b) => b.goals - a.goals).slice(3).map((p, i) => (
                <div key={p.id} className="bg-slate-50/50 border border-slate-100 rounded-[1.75rem] sm:rounded-[2.5rem] p-4 sm:p-6 flex items-center justify-between group hover:bg-white hover:border-navy/20 transition-all">
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white border border-slate-100 flex items-center justify-center font-black italic text-xs sm:text-base text-navy shadow-sm">{i + 4}</div>
                    <img src={p.photoUrl} className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-[1.5rem] object-cover border-2 border-white shadow-sm" alt="" />
                    <div>
                      <h4 className="text-sm sm:text-[16px] font-black text-navy uppercase italic leading-none mb-1">{p.name}</h4>
                      <p className="text-[9px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest">{p.position}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 sm:gap-10">
                    <div className="text-center">
                       <p className="text-2xl sm:text-3xl font-condensed italic font-black text-navy leading-none">{p.goals}</p>
                       <p className="text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-widest">GOLS</p>
                    </div>
                    <div className="text-center w-12 sm:w-16">
                       <p className="text-2xl sm:text-3xl font-condensed italic font-black text-primary leading-none">{p.assists || 0}</p>
                       <p className="text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-widest">ASSISTS</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Ranking;
