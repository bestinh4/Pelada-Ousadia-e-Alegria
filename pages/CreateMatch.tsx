
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
    location: '',
    date: new Date().toISOString().split('T')[0],
    time: '07:00',
    price: 10,
    fieldSlots: 30,
    gkSlots: 5
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
    <div className="flex flex-col animate-fade-in px-6">
      <header className="py-12 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button onClick={() => onPageChange(Page.Dashboard)} className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-navy shadow-soft-white active:scale-90 transition-all">
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          <div className="space-y-1">
            <h2 className="text-3xl font-black text-navy uppercase italic tracking-tighter leading-none">NOVA PELADA</h2>
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">ABRIR CONVOCAÇÃO</p>
          </div>
        </div>
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-soft-white animate-float border border-slate-100 p-2">
          <img src={mainLogoUrl} className="w-8 h-8 object-contain" />
        </div>
      </header>

      <main className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start pb-48">
        <div className="lg:col-span-7">
          <div className="bg-white rounded-[3.5rem] p-10 border border-slate-100 shadow-elite space-y-8 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-48 h-48 opacity-[0.08] pointer-events-none rotate-12">
                <img src={mainLogoUrl} className="w-full h-full grayscale" />
            </div>

            <div className="space-y-4 relative z-10">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-2">LOCAL DO ESTÁDIO</label>
              <input type="text" placeholder="Ex: Arena Ousadia" value={matchData.location} onChange={e => setMatchData({...matchData, location: e.target.value})} className="w-full h-18 bg-slate-50 border border-slate-100 rounded-2xl px-8 font-black text-navy text-lg focus:border-navy outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-6 relative z-10">
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-2">VAGAS LINHA</label>
                 <input type="number" value={matchData.fieldSlots} onChange={e => setMatchData({...matchData, fieldSlots: Number(e.target.value)})} className="w-full h-18 bg-slate-50 border border-slate-100 rounded-2xl px-6 font-black text-navy outline-none" />
              </div>
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-2">VAGAS GOLEIRO</label>
                 <input type="number" value={matchData.gkSlots} onChange={e => setMatchData({...matchData, gkSlots: Number(e.target.value)})} className="w-full h-18 bg-slate-50 border border-slate-100 rounded-2xl px-6 font-black text-navy outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 relative z-10">
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-2">DATA DO JOGO</label>
                 <input type="date" value={matchData.date} onChange={e => setMatchData({...matchData, date: e.target.value})} className="w-full h-18 bg-slate-50 border border-slate-100 rounded-2xl px-6 font-black text-navy outline-none" />
              </div>
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-2">HORÁRIO</label>
                 <input type="time" value={matchData.time} onChange={e => setMatchData({...matchData, time: e.target.value})} className="w-full h-18 bg-slate-50 border border-slate-100 rounded-2xl px-6 font-black text-navy outline-none" />
              </div>
            </div>

            <button 
              onClick={handleCreate}
              disabled={isSaving}
              className="w-full h-22 bg-navy text-white rounded-[2.5rem] font-black uppercase text-[12px] tracking-widest shadow-elite active:scale-95 transition-all flex items-center justify-center gap-4 mt-6"
            >
              {isSaving ? <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin"></div> : (
                <><span className="material-symbols-outlined">send</span> DISPARAR CONVOCAÇÃO</>
              )}
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 mt-10 lg:mt-0">
          <div className="bg-white border border-slate-100 rounded-[3rem] p-10 shadow-soft-white space-y-6">
            <h3 className="text-[11px] font-black text-navy uppercase italic tracking-widest">DICAS DE ORGANIZAÇÃO</h3>
            <ul className="space-y-4">
              <li className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-navy text-sm">info</span>
                </div>
                <p className="text-xs text-slate-400 font-bold leading-relaxed">Defina o local com antecedência para garantir a reserva da quadra.</p>
              </li>
              <li className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-navy text-sm">notifications</span>
                </div>
                <p className="text-xs text-slate-400 font-bold leading-relaxed">A notificação será enviada para todos os atletas cadastrados.</p>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CreateMatch;
