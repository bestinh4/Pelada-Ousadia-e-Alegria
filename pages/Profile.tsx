import { logout, db, doc, updateDoc, setDoc, auth, updateProfile } from '../services/firebase.ts';
import React, { useRef, useState, useEffect } from 'react';
import { Player, Page } from '../types.ts';
import { MASTER_ADMIN_EMAIL, MAIN_LOGO_URL } from '../constants.tsx';
import { requestNotificationPermission, getNotificationStatus, sendPushNotification } from '../services/notificationService.ts';

const Profile: React.FC<{ 
  player: Player; 
  currentUser?: any;
  currentUserEmail?: string; 
  isMaintenance?: boolean;
  onPageChange: (page: Page) => void;
  onLogout?: () => void;
  onPreviewMaintenance?: () => void;
}> = ({ player, currentUser, currentUserEmail, isMaintenance = false, onPageChange, onLogout, onPreviewMaintenance }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);
  const [editedName, setEditedName] = useState(player.name);
  const [editedPosition, setEditedPosition] = useState(player.position);
  const [editedPlayerType, setEditedPlayerType] = useState(player.playerType || 'avulso');
  const [notifStatus, setNotifStatus] = useState(getNotificationStatus());
  
  // Sincronizar campos quando o perfil for carregado do Firestore
  useEffect(() => {
    if (player) {
      setEditedName(player.name || '');
      setEditedPosition(player.position || 'Atacante');
      setEditedPlayerType(player.playerType || 'avulso');
    }
  }, [player?.id, player?.name, player?.position, player?.playerType]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMaster = currentUserEmail === MASTER_ADMIN_EMAIL || currentUser?.email === MASTER_ADMIN_EMAIL;
  const isAdm = player.role === 'admin' || isMaster;

  const isDirty = editedName !== player.name || editedPosition !== player.position || (isAdm && editedPlayerType !== player.playerType);

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto px-margin pb-space-xl gap-space-md animate-fade-in">
      {/* HEADER CARD */}
      <div className="relative w-full rounded-2xl bg-surface-container-lowest p-space-md shadow-[0_12px_36px_rgba(0,58,117,0.06)] overflow-hidden border border-surface-container-high/40 transition-all">
        {/* Stadium Aura Decoration */}
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-primary-container/10 blur-2xl pointer-events-none animate-pulse-slow"></div>
        <div className="absolute -left-12 -bottom-12 w-36 h-36 rounded-full bg-secondary/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary-container/10 text-primary-container flex items-center justify-center shrink-0 border border-primary-container/20">
              <span className="material-symbols-outlined text-[22px]">badge</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary-container animate-ping"></span>
                <span className="font-headline-sm text-headline-sm text-navy-deep font-bold">
                  Meu Perfil Oficial
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-outline">
                Carteira de Atleta • Configurações
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
              {isAdm ? 'DIRETORIA' : 'ATLETA'}
            </span>
            <button 
              onClick={async () => {
                try { await logout(); } catch {}
                if (onLogout) onLogout();
              }} 
              className="h-9 px-3 rounded-xl bg-surface-container-low hover:bg-error/10 text-error font-headline-sm text-headline-sm flex items-center gap-1.5 border border-surface-container-high/60 active:scale-95 transition-all"
              title="Sair da Conta"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              <span>SAIR</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-space-md items-start">
        {/* Left Column: Player Card */}
        <div className="md:col-span-5 flex flex-col items-center">
          <div className="w-full bg-surface-container-lowest rounded-2xl p-space-md flex flex-col items-center text-center shadow-sm relative overflow-hidden border border-surface-container-high/40">
            <div className="relative my-3">
              <div 
                className={`w-28 h-28 rounded-2xl border-4 ${isAdm ? 'border-primary-container ring-4 ring-primary-container/20' : 'border-surface-container-low'} shadow-md overflow-hidden relative z-10 bg-surface-container cursor-pointer`} 
                onClick={() => fileInputRef.current?.click()}
              >
                <img src={player.photoUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                {isUploading && (
                  <div className="absolute inset-0 bg-navy-deep/60 backdrop-blur-xs flex items-center justify-center">
                    <div className="w-7 h-7 border-3 border-canvas-white border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="absolute -bottom-2 -right-2 w-9 h-9 bg-navy-deep text-on-secondary rounded-xl flex items-center justify-center z-20 shadow-md active:scale-95 transition-all"
                title="Alterar Foto"
              >
                <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  setIsUploading(true);
                  const reader = new FileReader();
                  reader.onloadend = async () => {
                    const photoBase64 = reader.result as string;
                    try {
                      const targetId = player.id || currentUser?.uid;
                      if (!targetId) return;

                      // 1. Salvar no Firestore
                      await setDoc(doc(db, "players", targetId), { 
                        photoUrl: photoBase64,
                        id: targetId,
                        updatedAt: new Date().toISOString()
                      }, { merge: true });

                      // Sincronizar em user.uid se for diferente
                      if (currentUser?.uid && targetId !== currentUser.uid) {
                        await setDoc(doc(db, "players", currentUser.uid), { 
                          photoUrl: photoBase64,
                          updatedAt: new Date().toISOString()
                        }, { merge: true }).catch(() => {});
                      }

                      // 2. Atualizar no Firebase Auth
                      if (auth.currentUser) {
                        await updateProfile(auth.currentUser, { photoURL: photoBase64 }).catch(() => {});
                      }

                      // 3. Atualizar no localStorage caso esteja em modo direto
                      const saved = localStorage.getItem('oa_preview_user');
                      if (saved) {
                        try {
                          const parsed = JSON.parse(saved);
                          parsed.photoURL = photoBase64;
                          localStorage.setItem('oa_preview_user', JSON.stringify(parsed));
                        } catch {}
                      }
                      alert("Foto de perfil alterada com sucesso!");
                    } catch (err) {
                      console.error("Erro ao salvar foto de perfil:", err);
                      alert("Erro ao salvar a foto de perfil. Tente novamente.");
                    } finally {
                      setIsUploading(false);
                    }
                  };
                  reader.readAsDataURL(file);
                }} 
              />
            </div>

            <h3 className="font-headline-sm text-headline-sm text-navy-deep font-bold mt-1 break-words text-center max-w-full">
              {player.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap justify-center">
              <span className="font-label-md text-label-md text-primary-container uppercase tracking-wider bg-primary-fixed/40 px-2 py-0.5 rounded-full font-bold">
                {player.position}
              </span>
              <span className="font-label-md text-label-md text-navy-deep uppercase tracking-wider bg-surface-container px-2 py-0.5 rounded-full font-semibold">
                {player.playerType || 'AVULSO'}
              </span>
              {isAdm && (
                <span className="font-label-md text-label-md text-on-primary uppercase tracking-wider bg-navy-deep px-2 py-0.5 rounded-full font-bold">
                  DIRETORIA
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 w-full pt-4 mt-3 border-t border-surface-container-high/40">
               <div className="bg-surface-container-low rounded-xl p-3 text-center">
                  <span className="font-label-md text-label-md text-outline uppercase block">GOLS</span>
                  <span className="font-scoreboard-num text-[36px] text-navy-deep leading-none">{player.goals || 0}</span>
               </div>
               <div className="bg-primary-fixed/20 rounded-xl p-3 text-center">
                  <span className="font-label-md text-label-md text-primary-container uppercase block">ASSISTS</span>
                  <span className="font-scoreboard-num text-[36px] text-primary-container leading-none">{player.assists || 0}</span>
               </div>
            </div>
          </div>
        </div>

        {/* Right Column: Edits */}
        <div className="md:col-span-7 flex flex-col gap-space-sm">
          <div className="w-full bg-surface-container-lowest p-space-md rounded-2xl shadow-sm space-y-4 border border-surface-container-high/40">
            <div className="flex items-center gap-2 pb-2 border-b border-surface-container-high/40">
              <span className="material-symbols-outlined text-secondary text-[20px]">badge</span>
              <h4 className="font-label-caps text-label-caps text-navy-deep uppercase tracking-wider">DADOS DO ATLETA</h4>
            </div>

            <div className="space-y-1">
              <label className="font-label-md text-label-md text-outline block">NOME DE GUERRA</label>
              <input 
                type="text" 
                value={editedName} 
                onChange={(e) => setEditedName(e.target.value)} 
                className="w-full h-11 bg-surface-container-low border border-surface-container-high rounded-xl px-3 font-semibold text-navy-deep text-body-md focus:bg-canvas-white outline-none transition-all" 
              />
            </div>

            <div className="space-y-1">
              <label className="font-label-md text-label-md text-outline block">POSIÇÃO EM CAMPO</label>
              <select 
                value={editedPosition} 
                onChange={(e) => setEditedPosition(e.target.value)} 
                className="w-full h-11 bg-surface-container-low border border-surface-container-high rounded-xl px-3 font-semibold text-navy-deep text-body-md focus:bg-canvas-white outline-none transition-all cursor-pointer"
              >
                <option value="Goleiro">Goleiro</option>
                <option value="Zagueiro">Zagueiro</option>
                <option value="Lateral">Lateral</option>
                <option value="Volante">Volante</option>
                <option value="Meia">Meia</option>
                <option value="Atacante">Atacante</option>
              </select>
            </div>

            {isAdm && (
              <div className="space-y-1">
                <label className="font-label-md text-label-md text-outline block">CATEGORIA DE COBRANÇA</label>
                <select 
                  value={editedPlayerType} 
                  onChange={(e) => setEditedPlayerType(e.target.value as any)} 
                  className="w-full h-11 bg-surface-container-low border border-surface-container-high rounded-xl px-3 font-semibold text-navy-deep text-body-md focus:bg-canvas-white outline-none transition-all cursor-pointer"
                >
                  <option value="avulso">Avulso (Paga por jogo)</option>
                  <option value="mensalista">Mensalista VIP (Plano Fixo)</option>
                </select>
              </div>
            )}

            {isDirty && (
              <button 
                onClick={async () => {
                  if (!editedName.trim()) {
                    return alert("O nome não pode ficar em branco.");
                  }
                  setIsSaving(true);
                  try {
                    const targetId = player.id || currentUser?.uid;
                    if (!targetId) throw new Error("ID do atleta não encontrado");

                    const updates: any = {
                      id: targetId,
                      name: editedName.trim(),
                      position: editedPosition,
                      playerType: editedPlayerType,
                      updatedAt: new Date().toISOString()
                    };

                    if (player.email || currentUser?.email) {
                      updates.email = player.email || currentUser?.email;
                    }

                    // 1. Salvar no Firestore usando setDoc com merge para não falhar se for documento novo
                    await setDoc(doc(db, "players", targetId), updates, { merge: true });

                    // Se player.id for diferente do user.uid, sincroniza também em user.uid
                    if (currentUser?.uid && targetId !== currentUser.uid) {
                      await setDoc(doc(db, "players", currentUser.uid), updates, { merge: true }).catch(() => {});
                    }

                    // 2. Se o usuário estiver autenticado no Firebase Auth, atualiza displayName
                    if (auth.currentUser) {
                      await updateProfile(auth.currentUser, { displayName: editedName.trim() }).catch(() => {});
                    }

                    // 3. Atualizar no localStorage caso esteja em modo direto/preview
                    const saved = localStorage.getItem('oa_preview_user');
                    if (saved) {
                      try {
                        const parsed = JSON.parse(saved);
                        parsed.displayName = editedName.trim();
                        localStorage.setItem('oa_preview_user', JSON.stringify(parsed));
                      } catch {}
                    }

                    alert("Perfil atualizado com sucesso!");
                  } catch (err) {
                    console.error("Erro ao salvar perfil:", err);
                    alert("Erro ao atualizar dados. Verifique sua conexão e tente novamente.");
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving}
                className="w-full py-3 bg-gradient-to-r from-primary-container to-primary-bright text-on-primary font-headline-sm text-headline-sm rounded-xl shadow-md active:scale-95 transition-transform"
              >
                {isSaving ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}
              </button>
            )}
          </div>

          {/* Notifications Card */}
          <div className="w-full bg-surface-container-lowest p-space-md rounded-2xl shadow-sm border border-surface-container-high/40 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[22px]">notifications</span>
                </div>
                <div>
                  <h5 className="font-headline-sm text-headline-sm text-navy-deep">Notificações no Celular & PC</h5>
                  <p className="font-body-sm text-body-sm text-outline">
                    {notifStatus === 'granted' ? 'Ativadas para convocações' : 'Desativadas no navegador'}
                  </p>
                </div>
              </div>

              {notifStatus !== 'granted' ? (
                <button 
                  onClick={async () => {
                    const res = await requestNotificationPermission(player.id);
                    setNotifStatus(res ? 'granted' : 'denied');
                  }}
                  className="px-3 py-1.5 bg-navy-deep text-on-secondary rounded-lg font-label-md text-label-md active:scale-95"
                >
                  Ativar
                </button>
              ) : (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Ativo
                </span>
              )}
            </div>

            {/* Test button for mobile validation */}
            <button
              onClick={() => {
                sendPushNotification(
                  "⚽ TESTE DE NOTIFICAÇÃO!",
                  "Notificação oficial funcionando perfeitamente no seu dispositivo!"
                );
              }}
              className="w-full py-2 px-3 bg-surface-container hover:bg-surface-container-high rounded-xl text-xs font-bold text-navy-deep flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">vibration</span>
              <span>Testar Notificação Agora (com Vibração)</span>
            </button>
          </div>

          {/* MASTER ADMIN: MODO MANUTENÇÃO */}
          {isMaster && (
            <div className="w-full bg-surface-container-lowest p-space-md rounded-2xl shadow-sm border border-amber-500/40 relative overflow-hidden flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[22px]">engineering</span>
                  </div>
                  <div>
                    <h5 className="font-headline-sm text-headline-sm text-navy-deep font-bold flex items-center gap-1.5">
                      <span>Modo Manutenção</span>
                      <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
                        ADM MASTER
                      </span>
                    </h5>
                    <p className="font-body-sm text-xs text-outline leading-tight">
                      Bloqueia o acesso para atletas comuns e exibe tela de manutenção.
                    </p>
                  </div>
                </div>

                <div className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                  isMaintenance 
                    ? 'bg-amber-600 text-white animate-pulse' 
                    : 'bg-surface-container text-outline'
                }`}>
                  {isMaintenance ? 'ATIVADO' : 'DESATIVADO'}
                </div>
              </div>

              <div className="pt-2 border-t border-surface-container-high/40 flex flex-col sm:flex-row gap-2">
                <button
                  disabled={isTogglingMaintenance}
                  onClick={async () => {
                    const nextState = !isMaintenance;
                    const confirmText = nextState 
                      ? "Deseja ATIVAR O MODO MANUTENÇÃO? Apenas diretores poderão mexer no aplicativo."
                      : "Deseja DESATIVAR O MODO MANUTENÇÃO e liberar o aplicativo para todos?";
                    if (!confirm(confirmText)) return;

                    setIsTogglingMaintenance(true);
                    try {
                      await setDoc(doc(db, "settings", "system"), { 
                        isMaintenance: nextState,
                        updatedAt: new Date().toISOString() 
                      }, { merge: true });
                      alert(nextState ? "Modo de Manutenção ATIVADO!" : "Modo de Manutenção DESATIVADO!");
                    } catch (e) {
                      alert("Erro ao alterar modo de manutenção.");
                    } finally {
                      setIsTogglingMaintenance(false);
                    }
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-headline-sm text-xs uppercase tracking-wider font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 ${
                    isMaintenance
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isMaintenance ? 'lock_open' : 'lock'}
                  </span>
                  <span>{isMaintenance ? 'Desativar Manutenção (Liberar App)' : 'Ativar Modo Manutenção'}</span>
                </button>

                {onPreviewMaintenance && (
                  <button
                    type="button"
                    onClick={onPreviewMaintenance}
                    className="py-2.5 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-navy-deep font-headline-sm text-xs uppercase tracking-wider font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5 border border-surface-container-high"
                    title="Veja exatamente como os atletas visualizam a tela de manutenção"
                  >
                    <span className="material-symbols-outlined text-[18px]">visibility</span>
                    <span>Ver Tela de Bloqueio</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
