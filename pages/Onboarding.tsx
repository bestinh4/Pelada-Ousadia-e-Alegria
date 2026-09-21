
import React, { useState } from 'react';
import { db, doc, setDoc } from '../services/firebase.ts';
import { Page } from '../types.ts';
import { sendPushNotification, broadcastNotification } from '../services/notificationService.ts';

interface OnboardingProps {
  user: any;
  onComplete: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ user, onComplete }) => {
  const [name, setName] = useState(user?.displayName || "");
  const [position, setPosition] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  const logoUrl = "https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !position || isSaving) return;

    setIsSaving(true);
    try {
      const playerDocRef = doc(db, "players", user.uid);
      await setDoc(playerDocRef, {
        id: user.uid,
        name: name,
        email: user.email,
        photoUrl: user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0051a2&color=fff`,
        goals: 0,
        assists: 0,
        concededGoals: 0,
        position: position,
        playerType: 'avulso', // Definido como padrão obrigatório
        paymentStatus: 'pendente',
        status: 'pendente',
        role: 'player'
      });
      
      await broadcastNotification(
        "🚀 NOVO ATLETA!", 
        `${name} acaba de assinar com a Arena O&A!`,
        user.uid
      );
      
      onComplete();
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar perfil.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-neo-dots flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="w-full max-w-[380px] bg-white rounded-[2.5rem] shadow-elite border border-slate-100 p-10 flex flex-col z-10 animate-scale-up">
        <div className="flex flex-col items-center mb-10">
          <img src={logoUrl} alt="Logo" className="w-24 h-24 object-contain mb-6 drop-shadow-xl" />
          <h1 className="text-2xl font-black text-navy uppercase italic tracking-tighter leading-none">CONTRATAÇÃO</h1>
          <p className="text-[10px] font-black uppercase text-primary tracking-[0.4em] mt-2 text-center">FICHA DO ATLETA</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-300 px-1">COMO É CHAMADO?</label>
            <input 
              required
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-14 bg-slate-50 border border-slate-100 rounded-2xl px-6 font-bold text-navy focus:border-primary outline-none transition-all"
              placeholder="Ex: Luka Modrić"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-300 px-1">ONDE VOCÊ JOGA?</label>
            <select 
              required
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full h-14 bg-slate-50 border border-slate-100 rounded-2xl px-6 font-bold text-navy focus:border-primary outline-none transition-all"
            >
              <option value="" disabled>Selecione sua posição...</option>
              <option value="Goleiro">Goleiro (ISENTO 🧤)</option>
              <option value="Zagueiro">Zagueiro</option>
              <option value="Lateral">Lateral</option>
              <option value="Volante">Volante</option>
              <option value="Meia">Meia</option>
              <option value="Atacante">Atacante</option>
            </select>
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-navy text-sm">info</span>
              <p className="text-[9px] font-black text-navy uppercase tracking-widest">REGIME CONTRATUAL</p>
            </div>
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
              Sua entrada está registrada como <span className="text-primary font-black">AVULSO</span>. Para migrar para Mensalista, solicite à diretoria após o primeiro jogo.
            </p>
          </div>

          <button 
            type="submit" 
            disabled={isSaving || !name || !position}
            className="w-full h-20 bg-primary text-white rounded-[1.75rem] font-black uppercase text-[12px] tracking-[0.4em] shadow-glow-red shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 mt-6"
          >
            {isSaving ? (
              <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : "ASSINAR CONTRATO"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Onboarding;
