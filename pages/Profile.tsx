
import { logout, db, doc, updateDoc } from '../services/firebase.ts';
import React, { useRef, useState, useEffect } from 'react';
import { Player, Page } from '../types.ts';
import { MASTER_ADMIN_EMAIL } from '../constants.tsx';
import { requestNotificationPermission, getNotificationStatus, sendPushNotification, broadcastNotification, resetNotificationsRoutine } from '../services/notificationService.ts';

const Profile: React.FC<{ player: Player, currentUserEmail?: string, onPageChange: (page: Page) => void }> = ({ player, currentUserEmail, onPageChange }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedName, setEditedName] = useState(player.name);
  const [editedPosition, setEditedPosition] = useState(player.position);
  const [editedPlayerType, setEditedPlayerType] = useState(player.playerType || 'avulso');
  const [notifStatus, setNotifStatus] = useState(getNotificationStatus());
  const [fcmToken, setFcmToken] = useState<string | null>(player.fcmToken || null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainLogoUrl = "https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png";
  const isMaster = currentUserEmail === MASTER_ADMIN_EMAIL;
  const isAdm = player.role === 'admin' || isMaster;

  const isDirty = editedName !== player.name || editedPosition !== player.position || (isAdm && editedPlayerType !== player.playerType);

  return (
    <div className="flex flex-col animate-fade-in px-6">
      <header className="py-12 flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-navy uppercase italic tracking-tighter leading-none">MEU PERFIL</h2>
          <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">CADASTRO DE ATLETA</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => logout()} className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-primary shadow-soft-white active:scale-90 transition-all">
             <span className="material-symbols-outlined text-2xl">logout</span>
          </button>
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-soft-white animate-float border border-slate-100 p-2">
            <img src={mainLogoUrl} className="w-8 h-8 object-contain" />
          </div>
        </div>
      </header>

      <main className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start pb-48">
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="relative mb-14">
             <div className={`w-40 h-40 rounded-[3rem] border-4 ${isAdm ? 'border-primary shadow-glow-red' : 'border-white'} shadow-elite overflow-hidden relative z-10 bg-white group cursor-pointer`} onClick={() => fileInputRef.current?.click()}>
               <img src={player.photoUrl} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-700" alt="" />
               {isUploading && <div className="absolute inset-0 bg-navy/40 flex items-center justify-center animate-pulse"><div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin"></div></div>}
             </div>
             <button onClick={() => fileInputRef.current?.click()} className="absolute -bottom-3 -right-3 w-14 h-14 bg-navy text-white rounded-[1.5rem] border-4 border-white flex items-center justify-center z-20 shadow-xl active:scale-90 transition-all">
               <span className="material-symbols-outlined">add_a_photo</span>
             </button>
             <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={async (e) => {
               const file = e.target.files?.[0]; if (!file) return;
               setIsUploading(true);
               const reader = new FileReader();
               reader.onloadend = async () => {
                 await updateDoc(doc(db, "players", player.id), { photoUrl: reader.result as string });
                 setIsUploading(false);
               };
               reader.readAsDataURL(file);
             }} />
          </div>

          <div className="grid grid-cols-2 gap-6 w-full">
             <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-soft-white text-center">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block mb-2">GOLS</span>
                <span className="text-5xl font-condensed italic font-black text-navy">{player.goals || 0}</span>
             </div>
             <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-soft-white text-center">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block mb-2">ASSISTS</span>
                <span className="text-5xl font-condensed italic font-black text-navy">{player.assists || 0}</span>
             </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-10 mt-10 lg:mt-0">
          <div className="w-full space-y-10 bg-white border border-slate-100 p-10 rounded-[3.5rem] shadow-elite relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-48 h-48 opacity-[0.08] pointer-events-none rotate-12">
                <img src={mainLogoUrl} className="w-full h-full grayscale" />
            </div>

            <div className="space-y-4 relative z-10">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-2">NOME DE GUERRA</label>
              <input type="text" value={editedName} onChange={(e) => setEditedName(e.target.value)} className="w-full h-18 bg-slate-50 border border-slate-100 rounded-2xl px-8 font-black text-navy text-lg focus:border-navy outline-none" />
            </div>

            <div className="space-y-4 relative z-10">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-2">POSIÇÃO EM CAMPO</label>
              <select value={editedPosition} onChange={(e) => setEditedPosition(e.target.value)} className="w-full h-18 bg-slate-50 border border-slate-100 rounded-2xl px-8 font-black text-navy text-lg focus:border-navy outline-none">
                <option value="Goleiro">Goleiro</option>
                <option value="Zagueiro">Zagueiro</option>
                <option value="Lateral">Lateral</option>
                <option value="Volante">Volante</option>
                <option value="Meia">Meia</option>
                <option value="Atacante">Atacante</option>
              </select>
            </div>

            {isAdm ? (
              <div className="space-y-4 relative z-10">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-2">MODALIDADE CONTRATUAL</label>
                <div className="grid grid-cols-2 gap-4">
                   <button onClick={() => setEditedPlayerType('mensalista')} className={`h-18 rounded-2xl border-2 flex items-center justify-center font-black uppercase text-[11px] tracking-widest transition-all ${editedPlayerType === 'mensalista' ? 'bg-navy border-navy text-white shadow-elite' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>MENSALISTA</button>
                   <button onClick={() => setEditedPlayerType('avulso')} className={`h-18 rounded-2xl border-2 flex items-center justify-center font-black uppercase text-[11px] tracking-widest transition-all ${editedPlayerType === 'avulso' ? 'bg-primary border-primary text-white shadow-glow-red' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>AVULSO</button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 relative z-10">
                 <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest block mb-2">STATUS CONTRATUAL</span>
                 <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${player.playerType === 'mensalista' ? 'bg-navy' : 'bg-primary'} animate-pulse`}></div>
                    <p className="text-[13px] font-black text-navy uppercase italic">{player.playerType || 'AVULSO'}</p>
                 </div>
                 <p className="text-[9px] text-slate-400 mt-2 italic">*Alterações permitidas apenas pela diretoria.</p>
              </div>
            )}

            {isDirty && (
              <button 
                onClick={async () => {
                  setIsSaving(true);
                  const updates: any = { name: editedName, position: editedPosition };
                  if (isAdm) updates.playerType = editedPlayerType;
                  await updateDoc(doc(db, "players", player.id), updates);
                  setIsSaving(false); alert("Salvo!");
                }}
                className="w-full h-20 bg-navy text-white rounded-[2rem] font-black uppercase text-[12px] tracking-widest shadow-elite active:scale-95 transition-all mt-6"
              >
                {isSaving ? "PROCESSANDO..." : "SALVAR ALTERAÇÕES"}
              </button>
            )}
          </div>

          <div className="w-full space-y-6">
             <div className="bg-white border border-slate-100 p-8 rounded-[3rem] shadow-soft-white">
                <div className="flex items-center justify-between mb-6">
                   <div>
                      <h4 className="text-[11px] font-black text-navy uppercase italic tracking-tighter leading-none mb-1">NOTIFICAÇÕES DO SISTEMA</h4>
                      <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">STATUS: {notifStatus.toUpperCase()}</p>
                   </div>
                   <div className={`w-3 h-3 rounded-full ${notifStatus === 'granted' ? 'bg-success' : 'bg-primary'} animate-pulse`}></div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                   {notifStatus !== 'granted' && (
                      <button 
                        onClick={async () => {
                          const granted = await requestNotificationPermission(player.id);
                          setNotifStatus(getNotificationStatus());
                          if (granted) {
                            alert("Notificações ativadas!");
                            window.location.reload();
                          }
                        }}
                        className="w-full h-16 bg-navy text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-elite flex items-center justify-center gap-3 active:scale-95 transition-all"
                      >
                        <span className="material-symbols-outlined text-lg">notifications_active</span>
                        ATIVAR ALERTAS NO DISPOSITIVO
                      </button>
                   )}

                   {fcmToken && (
                     <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                       <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">CÓDIGO DE PUSH (TOKEN)</p>
                       <p className="text-[9px] font-mono text-navy break-all opacity-50">{fcmToken.substring(0, 40)}...</p>
                     </div>
                   )}
                   
                    <button 
                      onClick={() => {
                        console.log("🚀 Botão de teste clicado");
                        sendPushNotification("TESTE LOCAL! ⚽", "Esta notificação aparece apenas para você.");
                      }}
                      className="w-full h-16 bg-slate-50 border border-slate-100 text-navy rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all"
                   >
                      <span className="material-symbols-outlined text-lg">notification_important</span>
                      TESTAR ALERTA LOCAL
                   </button>

                   {isAdm && (
                     <button 
                        onClick={async () => {
                          if (confirm("Isso enviará uma notificação para TODOS os jogadores online. Continuar?")) {
                            await broadcastNotification("TESTE GERAL! 📢", "O administrador está testando o sistema de avisos.", player.id);
                            alert("Sinal de teste enviado!");
                          }
                        }}
                        className="w-full h-16 bg-navy text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-elite"
                     >
                        <span className="material-symbols-outlined text-lg">campaign</span>
                        TESTAR AVISO GERAL (BROADCAST)
                     </button>
                   )}

                   <button 
                      onClick={async () => {
                        if (confirm("Deseja resetar as configurações de notificação? Isso limpará o cache e tentará re-sincronizar seu dispositivo.")) {
                          await resetNotificationsRoutine(player.id);
                        }
                      }}
                      className="w-full h-16 bg-slate-50 border border-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all"
                   >
                      <span className="material-symbols-outlined text-lg">refresh</span>
                      RESETAR / CORRIGIR NOTIFICAÇÕES
                   </button>
                </div>
                <p className="text-[9px] text-slate-400 mt-4 italic text-center leading-relaxed">
                  *Para evitar alertas de spam, as notificações agora são solicitadas apenas quando você clica no botão acima. Certifique-se de permitir no seu navegador.
                </p>
             </div>
          </div>

          <div className="w-full space-y-6">
             <div className="bg-white border border-slate-100 p-8 rounded-[3rem] shadow-soft-white">
                <div className="flex items-center gap-3 mb-6">
                   <span className="material-symbols-outlined text-primary text-xl">link</span>
                   <h4 className="text-[11px] font-black text-navy uppercase italic tracking-tighter leading-none">LINKS ÚTEIS</h4>
                </div>
                <a 
                  href="https://pelada-app.vercel.app/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full h-16 bg-slate-50 border border-slate-100 text-navy rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-between px-6 active:scale-95 transition-all group"
                >
                   <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary group-hover:rotate-12 transition-transform">language</span>
                      SITE PRINCIPAL (VERCEL)
                   </div>
                   <span className="material-symbols-outlined text-sm opacity-30">open_in_new</span>
                </a>
             </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;
