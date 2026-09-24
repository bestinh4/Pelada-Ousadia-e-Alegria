
import React, { useState } from 'react';
import { Page, Match } from '../types.ts';
import { db, addDoc, collection } from '../services/firebase.ts';
import { broadcastNotification } from '../services/notificationService.ts';

interface CreateMatchProps {
  user: any;
  onPageChange: (page: Page) => void;
}

const CreateMatch: React.FC<CreateMatchProps> = ({ user, onPageChange }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [matchData, setMatchData] = useState({
    location: 'Granja Cantinho do Céu',
    date: new Date().toISOString().split('T')[0],
    time: '20:00',
    price: 40,
    fieldSlots: 30,
    gkSlots: 4
  });

  const mainLogoUrl = "https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png";

  const handleCreate = async () => {
    if (!matchData.location.trim()) return alert("Insira o local.");
    setIsSaving(true);
    try {
      await addDoc(collection(db, "matches"), {
        ...matchData,
        type: 'Mini-Campo',
        confirmedPlayers: 0,
        createdAt: new Date().toISOString()
      });
      
      // Notificar todos os jogadores sobre a nova convocação
      await broadcastNotification(
        "⚽ NOVA CONVOCAÇÃO!", 
        `A pelada na ${matchData.location.toUpperCase()} está aberta! Confirme sua presença.`,
        user.uid
      );

      onPageChange(Page.Dashboard);
    } catch (err) { alert("Falha ao criar."); }
    finally { setIsSaving(false); }
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
              <button 
                onClick={() => onPageChange(Page.Dashboard)} 
                className="w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-navy-deep active:scale-95 transition-all shadow-xs shrink-0"
                title="Voltar ao Início"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-container animate-ping"></span>
                  <span className="font-headline-sm text-headline-sm text-navy-deep font-bold">
                    Nova Convocação de Pelada
                  </span>
                </div>
                <span className="font-body-sm text-body-sm text-outline">
                  Configure a data, local e vagas para abrir a lista
                </span>
              </div>
            </div>

            <span className="bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
              DIRETORIA O&A
            </span>
          </div>
        </div>
      </div>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start w-full">
        {/* Form Column */}
        <div className="lg:col-span-7 flex flex-col gap-space-sm">
          <div className="bg-surface-container-lowest rounded-2xl p-space-md border border-surface-container-high/40 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-surface-container-high/40">
              <span className="material-symbols-outlined text-secondary text-[20px]">edit_calendar</span>
              <h3 className="font-label-caps text-label-caps text-navy-deep uppercase tracking-wider">
                DADOS DO JOGO
              </h3>
            </div>

            <div className="space-y-1">
              <label className="font-label-md text-label-md text-outline block">LOCAL DO CONFRONTO / ARENA</label>
              <input 
                type="text" 
                placeholder="Ex: Granja Cantinho do Céu" 
                value={matchData.location} 
                onChange={e => setMatchData({...matchData, location: e.target.value})} 
                className="w-full h-11 bg-surface-container-low border border-surface-container-high rounded-xl px-3.5 font-semibold text-navy-deep text-body-md focus:bg-canvas-white outline-none transition-all" 
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-label-md text-label-md text-outline block">VAGAS LINHA</label>
                <input 
                  type="number" 
                  value={matchData.fieldSlots} 
                  onChange={e => setMatchData({...matchData, fieldSlots: Number(e.target.value)})} 
                  className="w-full h-11 bg-surface-container-low border border-surface-container-high rounded-xl px-3.5 font-semibold text-navy-deep text-body-md focus:bg-canvas-white outline-none transition-all" 
                />
              </div>
              <div className="space-y-1">
                <label className="font-label-md text-label-md text-outline block">VAGAS GOLEIRO</label>
                <input 
                  type="number" 
                  value={matchData.gkSlots} 
                  onChange={e => setMatchData({...matchData, gkSlots: Number(e.target.value)})} 
                  className="w-full h-11 bg-surface-container-low border border-surface-container-high rounded-xl px-3.5 font-semibold text-navy-deep text-body-md focus:bg-canvas-white outline-none transition-all" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-label-md text-label-md text-outline block">DATA DO JOGO</label>
                <input 
                  type="date" 
                  value={matchData.date} 
                  onChange={e => setMatchData({...matchData, date: e.target.value})} 
                  className="w-full h-11 bg-surface-container-low border border-surface-container-high rounded-xl px-3.5 font-semibold text-navy-deep text-body-md focus:bg-canvas-white outline-none transition-all cursor-pointer" 
                />
              </div>
              <div className="space-y-1">
                <label className="font-label-md text-label-md text-outline block">HORÁRIO</label>
                <input 
                  type="time" 
                  value={matchData.time} 
                  onChange={e => setMatchData({...matchData, time: e.target.value})} 
                  className="w-full h-11 bg-surface-container-low border border-surface-container-high rounded-xl px-3.5 font-semibold text-navy-deep text-body-md focus:bg-canvas-white outline-none transition-all cursor-pointer" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-label-md text-label-md text-outline block">VALOR AVULSO (R$)</label>
              <input 
                type="number" 
                value={matchData.price} 
                onChange={e => setMatchData({...matchData, price: Number(e.target.value)})} 
                className="w-full h-11 bg-surface-container-low border border-surface-container-high rounded-xl px-3.5 font-semibold text-navy-deep text-body-md focus:bg-canvas-white outline-none transition-all" 
              />
            </div>

            <button 
              onClick={handleCreate}
              disabled={isSaving}
              className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-primary-container to-primary-bright text-on-primary rounded-xl font-headline-sm text-headline-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
            >
              {isSaving ? (
                <div className="w-5 h-5 border-2 border-canvas-white/30 border-t-canvas-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">campaign</span> 
                  <span>DISPARAR CONVOCAÇÃO & AVISOS</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tips Column */}
        <div className="lg:col-span-5 flex flex-col gap-space-sm">
          <div className="bg-surface-container-lowest border border-surface-container-high/40 rounded-2xl p-space-md shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-surface-container-high/40">
              <span className="material-symbols-outlined text-secondary text-[20px]">tips_and_updates</span>
              <h3 className="font-label-caps text-label-caps text-navy-deep uppercase tracking-wider">
                DICAS DE ORGANIZAÇÃO
              </h3>
            </div>
            
            <ul className="space-y-3 font-body-sm text-body-sm">
              <li className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-xl bg-surface-container flex items-center justify-center shrink-0 text-navy-deep mt-0.5">
                  <span className="material-symbols-outlined text-[18px]">stadium</span>
                </div>
                <div>
                  <p className="font-headline-sm text-headline-sm text-navy-deep font-bold">Local e Horário Definidos</p>
                  <p className="text-outline mt-0.5">Confirme a reserva da quadra antes de abrir a lista para evitar reagendamentos.</p>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-xl bg-primary-fixed/30 flex items-center justify-center shrink-0 text-primary-container mt-0.5">
                  <span className="material-symbols-outlined text-[18px]">notifications_active</span>
                </div>
                <div>
                  <p className="font-headline-sm text-headline-sm text-navy-deep font-bold">Disparo em Massa</p>
                  <p className="text-outline mt-0.5">Ao confirmar, o sistema enviará um push e aviso para todos os atletas cadastrados.</p>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-xl bg-secondary-fixed/40 flex items-center justify-center shrink-0 text-secondary mt-0.5">
                  <span className="material-symbols-outlined text-[18px]">sports</span>
                </div>
                <div>
                  <p className="font-headline-sm text-headline-sm text-navy-deep font-bold">Vagas de Goleiro</p>
                  <p className="text-outline mt-0.5">O padrão do app comporta goleiros com isenção automática de taxa no financeiro.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CreateMatch;
