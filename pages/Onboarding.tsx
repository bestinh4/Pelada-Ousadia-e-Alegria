
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
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Stadium Aura Background */}
      <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-primary-container/10 blur-3xl pointer-events-none animate-pulse-slow"></div>
      <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-secondary/10 blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-[400px] bg-surface-container-lowest rounded-2xl shadow-[0_12px_36px_rgba(0,58,117,0.08)] border border-surface-container-high/40 p-6 sm:p-8 flex flex-col z-10 animate-fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-surface-container p-2.5 mb-4 shadow-xs border border-surface-container-high/50 flex items-center justify-center">
            <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-primary-container animate-ping"></span>
            <span className="font-label-md text-label-md text-primary-container uppercase tracking-wider font-semibold">
              FICHA DO ATLETA
            </span>
          </div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-navy-deep uppercase tracking-wide text-center">
            CONTRATAÇÃO OFICIAL
          </h1>
          <p className="font-body-sm text-body-sm text-outline text-center mt-1">
            Complete seu cadastro para disputar a temporada
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="font-label-md text-label-md text-outline block">COMO É SEU APELIDO / NOME?</label>
            <input 
              required
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 bg-surface-container-low border border-surface-container-high rounded-xl px-4 font-semibold text-navy-deep text-body-md focus:bg-canvas-white outline-none transition-all"
              placeholder="Ex: Luka Modrić"
            />
          </div>

          <div className="space-y-1">
            <label className="font-label-md text-label-md text-outline block">ONDE VOCÊ JOGA?</label>
            <select 
              required
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full h-11 bg-surface-container-low border border-surface-container-high rounded-xl px-4 font-semibold text-navy-deep text-body-md focus:bg-canvas-white outline-none transition-all"
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

          <div className="bg-surface-container-low border border-surface-container-high/60 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-secondary text-[18px]">info</span>
              <p className="font-label-caps text-label-caps text-navy-deep uppercase tracking-wider">REGIME CONTRATUAL</p>
            </div>
            <p className="font-body-sm text-body-sm text-outline leading-relaxed">
              Sua entrada está registrada como <span className="text-navy-deep font-bold">AVULSO</span>. Para migrar para Mensalista, solicite à diretoria após o primeiro jogo.
            </p>
          </div>

          <button 
            type="submit" 
            disabled={isSaving || !name || !position}
            className="w-full h-12 bg-gradient-to-r from-primary-container to-primary-bright text-on-primary rounded-xl font-headline-sm text-headline-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-canvas-white/30 border-t-canvas-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">sports_soccer</span>
                <span>ASSINAR CONTRATO</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Onboarding;
