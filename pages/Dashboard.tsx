import React, { useState, useEffect } from 'react';
import { Match, Player, Page } from '../types.ts';
import { db, doc, updateDoc, setDoc, collection, onSnapshot, addDoc } from '../services/firebase.ts';
import { MASTER_ADMIN_EMAIL } from '../constants.tsx';
import { getNotificationStatus, requestNotificationPermission, broadcastNotification } from '../services/notificationService.ts';
import { isLateRemovalTime, checkLateRemovalDeadline } from '../utils/timeUtils.ts';
import { playSound } from '../utils/sound.ts';

interface DashboardProps {
  match: Match | null;
  players: Player[];
  user: any;
  currentUserRole?: 'admin' | 'player';
  onPageChange: (page: Page) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  match, 
  players = [], 
  user, 
  currentUserRole, 
  onPageChange 
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [prices, setPrices] = useState(() => {
    try {
      const cached = localStorage.getItem('oa_real_finance_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        return { mensalista: parsed.mensalista ?? 60, avulso: parsed.avulso ?? 40 };
      }
    } catch {}
    return { mensalista: 60, avulso: 40 };
  });

  // Admin Quick Actions states
  const [isReleasingList, setIsReleasingList] = useState(false);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlayerData, setNewPlayerData] = useState({
    name: '',
    position: 'Atacante',
    playerType: 'avulso' as 'mensalista' | 'avulso',
    status: 'presente' as 'presente' | 'pendente' | 'ausente',
    goals: 0
  });

  useEffect(() => {
    const unsubPrices = onSnapshot(doc(db, "settings", "finance"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        setPrices(data);
        try {
          localStorage.setItem('oa_real_finance_cache', JSON.stringify(data));
        } catch {}
      }
    });
    return () => unsubPrices();
  }, []);

  // Presença do atleta atual
  const currentPlayer = players.find(p => 
    p.id === user?.uid || 
    (user?.email && p.email && p.email.toLowerCase() === user.email.toLowerCase())
  );
  const isConfirmed = currentPlayer?.status === 'presente';
  const isRefused = currentPlayer?.status === 'ausente';

  const isMaster = user?.email === MASTER_ADMIN_EMAIL;
  const isCurrentUserAdmin = isMaster || currentUserRole === 'admin' || currentPlayer?.role === 'admin';

  const displayLocation = match?.location && match.location.trim().toLowerCase() !== 'granja' && match.location.trim().toLowerCase() !== 'arena central' && match.location.trim().toLowerCase() !== 'elite arena pro'
    ? match.location
    : 'Granja Cantinho do Céu';

  // Sincronizar no Firestore se o local salvo anteriormente estiver apenas como "Granja"
  useEffect(() => {
    if (match?.id && match.location?.trim().toLowerCase() === 'granja') {
      updateDoc(doc(db, "matches", match.id), { location: 'Granja Cantinho do Céu' }).catch(() => {});
    }
  }, [match]);

  const updatePresence = async (newStatus: 'presente' | 'ausente') => {
    if (!user || isUpdating) return;

    if (newStatus === 'ausente' && isConfirmed) {
      const deadlineInfo = checkLateRemovalDeadline(match);
      if (deadlineInfo.isLate) {
        const confirmMsg = 
          `⚠️ MULTA POR CANCELAMENTO APÓS AS 18H DA VÉSPERA ⚠️\n\n` +
          `O regulamento oficial da pelada estabelece que a retirada do nome deve ser feita até às 18:00 do dia anterior à pelada (${deadlineInfo.formattedDeadline}).\n\n` +
          `Como o horário limite foi ultrapassado, ao retirar o nome agora será gerada uma MULTA em seu nome. A Diretoria comunicará o valor a ser pago e você entrará como suplente na próxima rodada.\n\n` +
          `Deseja realmente confirmar a desistência e assumir a multa?`;

        if (!confirm(confirmMsg)) {
          return;
        }
      }
    }

    setIsUpdating(true);
    try {
      if (newStatus === 'presente') {
        playSound('cheer');
        if (getNotificationStatus() === 'default') {
          await requestNotificationPermission(user.uid);
        }
      }

      const updates: any = { status: newStatus };
      if (newStatus === 'presente') {
        updates.confirmedAt = new Date().toISOString();
      } else {
        updates.confirmedAt = null;
        const deadlineInfo = checkLateRemovalDeadline(match);
        if (isConfirmed && deadlineInfo.isLate && match) {
          await addDoc(collection(db, "lateRemovals"), {
            playerId: user.uid,
            playerName: currentPlayer?.name || user.displayName || "Atleta",
            timestamp: new Date().toISOString(),
            matchId: match.id,
            matchLocation: match.location || 'Granja Cantinho do Céu',
            matchDate: match.date || '',
            status: 'pendente',
            reason: 'Retirada de nome após as 18h da véspera'
          }).catch(() => {});

          updates.hasLateRemovalFine = true;
          updates.suplenteNextMatch = true;
        }
      }

      const targetId = currentPlayer?.id || user.uid;
      await setDoc(doc(db, "players", targetId), updates, { merge: true });
      if (targetId !== user.uid) {
        await setDoc(doc(db, "players", user.uid), updates, { merge: true }).catch(() => {});
      }
    } catch (e) {
      alert("Erro ao atualizar presença.");
    } finally {
      setIsUpdating(false);
    }
  };

  // Liberar Lista para a Próxima Pelada
  const handleReleaseNextPelada = async () => {
    if (!isCurrentUserAdmin) return;
    
    const mensalistasToConfirm = players.filter(p => p.playerType === 'mensalista' && !p.suplenteNextMatch);
    const mensalistasPenalized = players.filter(p => p.playerType === 'mensalista' && p.suplenteNextMatch);
    
    const confirmMsg = `Deseja LIBERAR A LISTA PARA A PRÓXIMA PELADA?\n\n` +
      `✅ ${mensalistasToConfirm.length} Mensalista(s) serão confirmados automaticamente.\n` +
      (mensalistasPenalized.length > 0 ? `⚠️ ${mensalistasPenalized.length} Mensalista(s) faltoso(s) ficarão na suplência por penalidade: ${mensalistasPenalized.map(m => m.name).join(', ')}.\n` : '') +
      `🔄 Todos os atletas avulsos voltarão para o status "Pendente".\n\n` +
      `Confirma a liberação oficial da lista?`;
      
    if (!confirm(confirmMsg)) return;

    setIsReleasingList(true);
    try {
      const now = new Date().toISOString();
      const promises = players.map(async (p) => {
        if (p.playerType === 'mensalista') {
          if (!p.suplenteNextMatch) {
            return updateDoc(doc(db, "players", p.id), {
              status: 'presente',
              confirmedAt: now
            });
          } else {
            return updateDoc(doc(db, "players", p.id), {
              status: 'pendente',
              confirmedAt: null
            });
          }
        } else {
          return updateDoc(doc(db, "players", p.id), {
            status: 'pendente',
            confirmedAt: null
          });
        }
      });

      await Promise.all(promises);

      // Disparar notificação para todos
      try {
        await broadcastNotification(
          "⚽ LISTA DA PELADA LIBERADA!",
          "A lista oficial para a próxima pelada está aberta! Mensalistas já foram confirmados automaticamente.",
          user?.uid
        );
      } catch {}

      alert("Lista da próxima pelada liberada com sucesso! Mensalistas confirmados e notificações disparadas.");
    } catch (e) {
      console.error(e);
      alert("Erro ao liberar lista da próxima pelada.");
    } finally {
      setIsReleasingList(false);
    }
  };

  // Cadastrar Atleta Manualmente
  const handleCreateManualPlayer = async () => {
    if (!newPlayerData.name.trim()) return alert("Digite o nome do atleta!");
    setIsCreating(true);
    try {
      await addDoc(collection(db, "players"), {
        ...newPlayerData,
        goals: Number(newPlayerData.goals) || 0,
        assists: 0,
        role: 'player',
        photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(newPlayerData.name)}&background=003a75&color=fff&size=256`,
        createdAt: new Date().toISOString(),
        confirmedAt: newPlayerData.status === 'presente' ? new Date().toISOString() : null
      });
      setIsAddingManual(false);
      setNewPlayerData({ name: '', position: 'Atacante', playerType: 'avulso', status: 'presente', goals: 0 });
      alert("Atleta cadastrado com sucesso!");
    } catch (e) {
      alert("Erro ao cadastrar atleta.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto px-margin pb-space-xl gap-space-md animate-fade-in">
      {/* PAINEL DA DIRETORIA (AÇÕES EXCLUSIVAS PARA O ADMINISTRADOR NA PÁGINA INICIAL) */}
      {isCurrentUserAdmin && (
        <div className="relative w-full rounded-2xl bg-surface-container-lowest p-4 shadow-sm border border-primary-container/30 overflow-hidden">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-surface-container-high/50 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-container/15 text-primary-container flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-sm font-bold text-navy-deep leading-tight">
                  Painel da Diretoria
                </h3>
                <span className="text-[11px] text-outline">
                  Ações rápidas de gestão da pelada
                </span>
              </div>
            </div>

            <span className="bg-primary-fixed text-primary-container font-label-md text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
              DIRETOR
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3">
            {/* BOTÃO 1: ABRIR LISTA DA PRÓXIMA PELADA */}
            <button
              onClick={handleReleaseNextPelada}
              disabled={isReleasingList}
              className="py-3 px-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl font-headline-sm text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all disabled:opacity-50"
              title="Liberar lista da próxima pelada: confirma mensalistas automaticamente e penaliza quem faltou"
            >
              <span className="material-symbols-outlined text-[20px]">rule_folder</span>
              <span>{isReleasingList ? 'LIBERANDO LISTA...' : 'ABRIR LISTA PRÓXIMA PELADA'}</span>
            </button>

            {/* BOTÃO 2: CADASTRAR NOVO ATLETA */}
            <button
              onClick={() => setIsAddingManual(true)}
              className="py-3 px-3.5 bg-gradient-to-r from-primary-container to-primary-bright hover:opacity-95 text-on-primary rounded-xl font-headline-sm text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
              title="Cadastrar novo atleta manualmente no sistema"
            >
              <span className="material-symbols-outlined text-[20px]">person_add</span>
              <span>CADASTRAR NOVO ATLETA</span>
            </button>
          </div>
        </div>
      )}

      {/* MATCH INFORMATION CARD & ATTENDANCE CONFIRMATION */}
      <div className="relative w-full rounded-2xl bg-surface-container-lowest p-space-md shadow-[0_12px_36px_rgba(0,58,117,0.06)] overflow-hidden border border-surface-container-high/40 transition-all">
        {/* Stadium Aura Decoration */}
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-primary-container/10 blur-2xl pointer-events-none animate-pulse-slow"></div>
        <div className="absolute -left-12 -bottom-12 w-36 h-36 rounded-full bg-secondary/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col gap-space-sm">
          {/* Header Row: Title & Subtitle + Match Type Badge */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary-container/10 text-primary-container flex items-center justify-center shrink-0 border border-primary-container/20">
                <span className="material-symbols-outlined text-[22px]">sports_soccer</span>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-container animate-ping shrink-0"></span>
                  <span className="font-headline-sm text-headline-sm text-navy-deep font-bold truncate">
                    Convocação Oficial
                  </span>
                </div>
                <span className="font-body-sm text-body-sm text-outline truncate">
                  Confirmação de Presença
                </span>
              </div>
            </div>

            <span className="bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold shrink-0">
              {match?.type || 'Mini-Campo'}
            </span>
          </div>

          {/* SOCCER FIELD BANNER IMAGE (Limpa e alinhada) */}
          <div className="relative w-full h-40 sm:h-48 overflow-hidden rounded-xl bg-navy-deep mt-1 shadow-xs border border-surface-container-high/40">
            <img 
              src={match?.fieldImageUrl || "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80"}
              alt="Campo de Futebol"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-deep/60 via-transparent to-black/20"></div>
          </div>

          {/* DETALHES TÉCNICOS: NOME DA GRANJA LOGO ACIMA DA DATA */}
          <div className="flex flex-col gap-2.5 bg-surface-container-low p-3.5 sm:p-4 rounded-xl border border-surface-container-high/60 shadow-xs">
            {/* Linha 1: Nome da Granja / Local e Valor Avulso */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="material-symbols-outlined text-secondary text-[22px] shrink-0">location_on</span>
                <span className="font-headline-sm text-headline-sm text-navy-deep font-bold truncate">
                  {displayLocation}
                </span>
              </div>
              <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-primary-container to-primary-bright text-on-primary shadow-xs shrink-0">
                <span className="text-[10px] uppercase tracking-wider font-semibold opacity-90">Avulso:</span>
                <span className="font-headline-sm text-headline-sm whitespace-nowrap">R$ {match?.price || prices.avulso},00</span>
              </div>
            </div>

            {/* Linha 2: Data e Horário (logo abaixo do nome da granja) */}
            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-surface-container-high/50 text-on-surface-variant font-body-sm text-body-sm flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-outline text-[18px] shrink-0">event</span>
                <span className="font-semibold text-navy-deep break-words">
                  {match?.date ? new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '15 de Fevereiro, 2026'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 font-semibold text-navy-deep shrink-0 whitespace-nowrap">
                <span className="material-symbols-outlined text-primary-container text-[18px]">schedule</span>
                <span>Início: <strong className="text-primary-container">{match?.time || '20:00'}</strong></span>
              </div>
            </div>
          </div>

          {/* ÁREA DE CONFIRMAÇÃO DE PRESENÇA (RSVP) */}
          <div className="pt-0.5">
            {isConfirmed ? (
              /* CARD DE CONFIRMADO */
              <div className="p-3.5 sm:p-4 rounded-xl bg-tertiary-container/10 border border-tertiary-container/30 flex flex-col gap-2.5 animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-tertiary-container text-on-tertiary flex items-center justify-center shadow-xs shrink-0">
                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-headline-sm text-headline-sm font-bold text-navy-deep leading-tight">
                      Presença Confirmada!
                    </h3>
                    <p className="font-body-sm text-body-sm text-outline leading-tight mt-0.5">
                      Você está na lista oficial para o jogo.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => updatePresence('ausente')}
                  disabled={isUpdating}
                  className="w-full mt-0.5 py-2.5 min-h-[44px] px-3 rounded-xl font-label-md text-label-md font-semibold text-outline hover:text-error hover:bg-error/10 border border-surface-container-high active:scale-[0.98] transition-all touch-manipulation flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">event_busy</span>
                  <span>Não poderei comparecer (Desmarcar)</span>
                </button>

                <div className="flex items-center gap-1.5 text-[11px] text-outline justify-center text-center px-1">
                  <span className="material-symbols-outlined text-[15px] text-amber-600 shrink-0">schedule</span>
                  <span>Prazo sem multa: até 18h da véspera ({checkLateRemovalDeadline(match).formattedDeadline})</span>
                </div>

                {currentPlayer?.hasLateRemovalFine && (
                  <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 flex items-center gap-2 text-xs font-semibold mt-1">
                    <span className="material-symbols-outlined text-[18px] text-amber-700 shrink-0">info</span>
                    <span>Você possui pendência de multa por retirada de nome após as 18h da véspera. A Diretoria comunicará o valor a ser pago.</span>
                  </div>
                )}
              </div>
            ) : isRefused ? (
              /* CARD DE AUSENTE */
              <div className="p-3.5 sm:p-4 rounded-xl bg-surface-container-low border border-surface-container-high/60 flex flex-col gap-2.5 animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-error/10 text-error flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px]">cancel</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-headline-sm text-headline-sm font-bold text-navy-deep leading-tight">
                      Você marcou ausência
                    </h3>
                    <p className="font-body-sm text-body-sm text-outline leading-tight mt-0.5">
                      Mudou de ideia? Ainda dá tempo de jogar!
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => updatePresence('presente')}
                  disabled={isUpdating}
                  className="w-full mt-0.5 py-3.5 min-h-[48px] px-4 rounded-xl font-headline-sm text-headline-sm font-bold bg-gradient-to-r from-primary-container to-primary-bright text-on-primary shadow-md active:scale-[0.98] transition-all touch-manipulation flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[20px]">sports_soccer</span>
                  <span>Confirmar Minha Presença</span>
                </button>
              </div>
            ) : (
              /* BOTÕES DE ESCOLHA (PENDENTE) */
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => updatePresence('presente')}
                  disabled={isUpdating}
                  className="w-full py-3.5 min-h-[50px] px-4 rounded-xl font-headline-sm text-headline-sm font-bold bg-gradient-to-r from-primary-container to-primary-bright text-on-primary shadow-md shadow-primary/25 hover:opacity-95 active:scale-[0.98] transition-all touch-manipulation flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[22px]">sports_soccer</span>
                  <span>Confirmar Presença</span>
                </button>

                <button
                  onClick={() => updatePresence('ausente')}
                  disabled={isUpdating}
                  className="w-full py-2.5 min-h-[44px] px-3 rounded-xl font-label-md text-label-md font-semibold text-outline hover:text-navy-deep hover:bg-surface-container-low transition-all active:scale-[0.98] touch-manipulation flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                  <span>Não vou poder ir</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL PARA CADASTRAR NOVO ATLETA (ADMIN) */}
      {isAddingManual && (
        <div className="fixed inset-0 z-50 bg-navy-deep/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-md w-full rounded-2xl p-5 border border-surface-container-high/60 shadow-2xl flex flex-col gap-4 animate-pop-in">
            <div className="flex items-center justify-between border-b border-surface-container-high/40 pb-3">
              <h3 className="font-headline-sm text-headline-sm text-navy-deep font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[22px]">person_add</span>
                Cadastrar Novo Atleta
              </h3>
              <button 
                onClick={() => setIsAddingManual(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="font-label-md text-xs text-outline block mb-1">Nome Completo / Apelido</label>
                <input 
                  type="text" 
                  value={newPlayerData.name}
                  onChange={(e) => setNewPlayerData({ ...newPlayerData, name: e.target.value })}
                  placeholder="Ex: Paulão da Zaga"
                  className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-md text-xs text-outline block mb-1">Posição</label>
                  <select 
                    value={newPlayerData.position}
                    onChange={(e) => setNewPlayerData({ ...newPlayerData, position: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-semibold"
                  >
                    <option value="Atacante">Atacante</option>
                    <option value="Meia">Meia</option>
                    <option value="Zagueiro">Zagueiro</option>
                    <option value="Lateral">Lateral</option>
                    <option value="Goleiro">Goleiro</option>
                  </select>
                </div>

                <div>
                  <label className="font-label-md text-xs text-outline block mb-1">Categoria</label>
                  <select 
                    value={newPlayerData.playerType}
                    onChange={(e) => setNewPlayerData({ ...newPlayerData, playerType: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-semibold"
                  >
                    <option value="avulso">Avulso</option>
                    <option value="mensalista">Mensalista</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-md text-xs text-outline block mb-1">Status Inicial</label>
                  <select 
                    value={newPlayerData.status}
                    onChange={(e) => setNewPlayerData({ ...newPlayerData, status: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-semibold"
                  >
                    <option value="presente">Confirmado (Presente)</option>
                    <option value="pendente">Pendente</option>
                    <option value="ausente">Ausente</option>
                  </select>
                </div>

                <div>
                  <label className="font-label-md text-xs text-outline block mb-1">Gols Marcados</label>
                  <input 
                    type="number" 
                    min="0"
                    value={newPlayerData.goals}
                    onChange={(e) => setNewPlayerData({ ...newPlayerData, goals: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-semibold"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-surface-container-high/40 mt-1">
              <button 
                onClick={() => setIsAddingManual(false)}
                className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface font-label-md"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCreateManualPlayer}
                disabled={isCreating}
                className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-headline-sm flex items-center gap-1 shadow-md shadow-primary/20 active:scale-95 disabled:opacity-50"
              >
                {isCreating ? 'Cadastrando...' : 'Cadastrar Atleta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
