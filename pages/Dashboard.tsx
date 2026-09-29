import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
        return {
          mensalista: parsed.mensalista ?? 60,
          avulso: parsed.avulso ?? 40,
          multa: parsed.multa ?? 20
        };
      }
    } catch {}
    return { mensalista: 60, avulso: 40, multa: 20 };
  });

  // Admin Quick Actions states
  const [isReleasingList, setIsReleasingList] = useState(false);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [priceForm, setPriceForm] = useState({ mensalista: 60, avulso: 40, multa: 20 });
  const [isSavingPrices, setIsSavingPrices] = useState(false);
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
        const normalized = {
          mensalista: Number(data.mensalista) || 60,
          avulso: Number(data.avulso) || 40,
          multa: Number(data.multa) || 20
        };
        setPrices(normalized);
        setPriceForm(normalized);
        try {
          localStorage.setItem('oa_real_finance_cache', JSON.stringify(normalized));
        } catch {}
      }
    });
    return () => unsubPrices();
  }, []);

  const handleSaveFinancePrices = async () => {
    if (!isCurrentUserAdmin) return;
    setIsSavingPrices(true);
    try {
      const payload = {
        mensalista: Math.max(0, Number(priceForm.mensalista) || 0),
        avulso: Math.max(0, Number(priceForm.avulso) || 0),
        multa: Math.max(0, Number(priceForm.multa) || 0),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, "settings", "finance"), payload, { merge: true });
      if (match?.id) {
        await updateDoc(doc(db, "matches", match.id), { price: payload.avulso }).catch(() => {});
      }
      setIsEditingPrices(false);
      alert("Valores de Mensalista, Avulso e Multa atualizados com sucesso!");
    } catch {
      alert("Erro ao salvar valores.");
    } finally {
      setIsSavingPrices(false);
    }
  };

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
          updates.fineAmount = prices.multa || 20;
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
    <div className="flex flex-col w-full max-w-3xl mx-auto pb-6 gap-4 animate-fade-in">
      {/* PAINEL DA DIRETORIA (EXCLUSIVO PARA ADMINISTRADORES) */}
      {isCurrentUserAdmin && (
        <div className="w-full rounded-2xl bg-surface-container-lowest p-3.5 sm:p-4 shadow-sm border border-primary-container/25">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-surface-container-high/50 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-primary-container text-[20px] shrink-0">admin_panel_settings</span>
              <h3 className="font-headline-sm text-sm font-bold text-navy-deep truncate">
                Painel da Diretoria
              </h3>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-navy-deep bg-surface-container px-2.5 py-1 rounded-lg">
              <span>Mensal: R$ {prices.mensalista}</span>
              <span className="text-outline">·</span>
              <span>Avulso: R$ {prices.avulso}</span>
              <span className="text-outline">·</span>
              <span className="text-red-700">Multa: R$ {prices.multa}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3">
            {/* BOTÃO 1: ABRIR LISTA DA PRÓXIMA PELADA */}
            <button
              onClick={handleReleaseNextPelada}
              disabled={isReleasingList}
              className="min-h-[44px] py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all disabled:opacity-50"
              title="Liberar lista da próxima pelada: confirma mensalistas automaticamente e penaliza quem faltou"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">rule_folder</span>
              <span className="truncate">{isReleasingList ? 'LIBERANDO...' : 'ABRIR PRÓXIMA LISTA'}</span>
            </button>

            {/* BOTÃO 2: CADASTRAR NOVO ATLETA */}
            <button
              onClick={() => setIsAddingManual(true)}
              className="min-h-[44px] py-2.5 px-3 bg-gradient-to-r from-primary-container to-primary-bright hover:opacity-95 text-on-primary rounded-xl font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
              title="Cadastrar novo atleta manualmente no sistema"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">person_add</span>
              <span className="truncate">CADASTRAR ATLETA</span>
            </button>

            {/* BOTÃO 3: DEFINIR VALORES (AVULSO, MENSALISTA E MULTA) */}
            <button
              onClick={() => {
                setPriceForm(prices);
                setIsEditingPrices(true);
              }}
              className="min-h-[44px] py-2.5 px-3 bg-navy-deep hover:opacity-95 text-white rounded-xl font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
              title="Definir valores de Avulsos, Mensalistas e Multas"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">payments</span>
              <span className="truncate">DEFINIR VALORES</span>
            </button>
          </div>
        </div>
      )}

      {/* CARD PRINCIPAL DA PELADA & CONFIRMAÇÃO DE PRESENÇA */}
      <div className="relative w-full rounded-2xl bg-surface-container-lowest p-4 sm:p-5 shadow-[0_12px_36px_rgba(0,58,117,0.06)] overflow-hidden border border-surface-container-high/40">
        <div className="relative z-10 flex flex-col gap-3.5">
          {/* Imagem do Campo com Informações Integradas */}
          <div className="relative w-full h-40 sm:h-52 overflow-hidden rounded-xl bg-navy-deep shadow-xs border border-surface-container-high/40">
            <img 
              src={match?.fieldImageUrl || "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80"}
              alt="Campo de Futebol"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-deep/90 via-navy-deep/30 to-black/20"></div>

            {/* Badge de Modalidade no Topo da Imagem */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 bg-navy-deep/80 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-1 rounded-lg border border-white/15">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                Convocação Oficial
              </span>
              {isCurrentUserAdmin && (
                <span className="bg-white/90 backdrop-blur-md text-navy-deep font-label-md text-[11px] px-2.5 py-1 rounded-lg font-bold">
                  Avulso: R$ {prices.avulso},00
                </span>
              )}
            </div>

            {/* Local, Data e Horário na Base da Imagem */}
            <div className="absolute bottom-3 left-3 right-3 flex flex-col sm:flex-row sm:items-end justify-between gap-1.5 text-white">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-amber-400 text-[20px] shrink-0">location_on</span>
                  <h2 className="font-headline-sm text-base sm:text-lg font-bold truncate">
                    {displayLocation}
                  </h2>
                </div>
                <p className="text-xs text-white/85 pl-6 truncate">
                  {match?.date ? new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Sábado'}
                </p>
              </div>

              <div className="inline-flex items-center gap-1 bg-white/15 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-bold self-start sm:self-auto shrink-0 border border-white/15">
                <span className="material-symbols-outlined text-amber-300 text-[16px]">schedule</span>
                <span>Início: {match?.time || '20:00'}</span>
              </div>
            </div>
          </div>

          {/* ÁREA DE CONFIRMAÇÃO DE PRESENÇA (RSVP) */}
          <div>
            {isConfirmed ? (
              <div className="p-3.5 sm:p-4 rounded-xl bg-tertiary-container/10 border border-tertiary-container/30 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-tertiary-container text-on-tertiary flex items-center justify-center shadow-xs shrink-0">
                      <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-headline-sm text-sm sm:text-base font-bold text-navy-deep leading-tight">
                        Presença Confirmada
                      </h3>
                      <p className="font-body-sm text-xs text-outline leading-tight mt-0.5">
                        Prazo limite para retirada: até 18h da véspera ({checkLateRemovalDeadline(match).formattedDeadline})
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => updatePresence('ausente')}
                  disabled={isUpdating}
                  className="w-full min-h-[44px] py-2.5 px-3 rounded-xl font-label-md text-xs font-semibold text-outline hover:text-error hover:bg-error/10 border border-surface-container-high active:scale-[0.98] transition-all touch-manipulation flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">event_busy</span>
                  <span>Não poderei comparecer (Desmarcar)</span>
                </button>
              </div>
            ) : isRefused ? (
              <div className="p-3.5 sm:p-4 rounded-xl bg-surface-container-low border border-surface-container-high/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-error/10 text-error flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px]">cancel</span>
                  </div>
                  <div>
                    <h3 className="font-headline-sm text-sm font-bold text-navy-deep leading-tight">
                      Você marcou ausência
                    </h3>
                    <p className="font-body-sm text-xs text-outline mt-0.5">
                      Mudou de ideia? Confirme para entrar na lista.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => updatePresence('presente')}
                  disabled={isUpdating}
                  className="min-h-[44px] py-2.5 px-4 rounded-xl font-headline-sm text-xs font-bold bg-gradient-to-r from-primary-container to-primary-bright text-on-primary shadow-sm active:scale-[0.98] transition-all touch-manipulation flex items-center justify-center gap-2 shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">sports_soccer</span>
                  <span>Confirmar Presença</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => updatePresence('presente')}
                  disabled={isUpdating}
                  className="sm:col-span-2 min-h-[48px] py-3 px-4 rounded-xl font-headline-sm text-sm font-bold bg-gradient-to-r from-primary-container to-primary-bright text-on-primary shadow-md shadow-primary/20 hover:opacity-95 active:scale-[0.98] transition-all touch-manipulation flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[20px]">sports_soccer</span>
                  <span>Confirmar Presença</span>
                </button>

                <button
                  onClick={() => updatePresence('ausente')}
                  disabled={isUpdating}
                  className="min-h-[48px] py-2.5 px-3 rounded-xl font-label-md text-xs font-semibold text-outline hover:text-navy-deep bg-surface-container-low hover:bg-surface-container transition-all active:scale-[0.98] touch-manipulation flex items-center justify-center gap-1.5 border border-surface-container-high/50"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                  <span>Não vou ir</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: DEFINIR VALORES DE AVULSOS, MENSALISTAS E MULTAS (DIRETORIA) */}
      {isEditingPrices && isCurrentUserAdmin && typeof document !== 'undefined' && createPortal(
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999 }}
          className="bg-navy-deep/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditingPrices(false);
          }}
        >
          <div 
            className="bg-white text-navy-deep max-w-md w-full max-h-[88dvh] rounded-2xl p-4 sm:p-5 border border-surface-container-high/60 shadow-2xl flex flex-col gap-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-surface-container-high/40 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[22px]">payments</span>
                <div>
                  <h3 className="font-headline-sm text-base text-navy-deep font-bold">
                    Definir Valores & Multas
                  </h3>
                  <p className="text-xs text-outline">Configuração exclusiva da Diretoria</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsEditingPrices(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto min-h-0 flex-1 pr-1">
              <div>
                <label className="font-label-md text-xs text-navy-deep font-bold block mb-1">
                  Valor Mensalista (R$)
                </label>
                <input 
                  type="number" 
                  min="0"
                  value={priceForm.mensalista}
                  onChange={(e) => setPriceForm({ ...priceForm, mensalista: Number(e.target.value) })}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-bold"
                />
              </div>

              <div>
                <label className="font-label-md text-xs text-navy-deep font-bold block mb-1">
                  Valor Avulso por Jogo (R$)
                </label>
                <input 
                  type="number" 
                  min="0"
                  value={priceForm.avulso}
                  onChange={(e) => setPriceForm({ ...priceForm, avulso: Number(e.target.value) })}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-bold"
                />
              </div>

              <div>
                <label className="font-label-md text-xs text-red-700 font-bold block mb-1">
                  Valor da Multa por Falta / Atraso (R$)
                </label>
                <input 
                  type="number" 
                  min="0"
                  value={priceForm.multa}
                  onChange={(e) => setPriceForm({ ...priceForm, multa: Number(e.target.value) })}
                  className="w-full h-11 px-3 rounded-xl bg-red-50/50 border border-red-300 outline-none font-body-md text-red-900 font-bold"
                />
                <span className="text-[11px] text-outline mt-1 block">
                  Aplicado automaticamente a quem colocar o nome na lista e faltar à pelada ou retirar após as 18h.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-surface-container-high/40 shrink-0">
              <button 
                type="button"
                onClick={() => setIsEditingPrices(false)}
                className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface font-label-md text-xs font-bold"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleSaveFinancePrices}
                disabled={isSavingPrices}
                className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-headline-sm text-xs font-bold shadow-md active:scale-95 disabled:opacity-50"
              >
                {isSavingPrices ? 'Salvando...' : 'Salvar Valores'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL PARA CADASTRAR NOVO ATLETA (ADMIN) */}
      {isAddingManual && typeof document !== 'undefined' && createPortal(
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999 }}
          className="bg-navy-deep/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddingManual(false);
          }}
        >
          <div 
            className="bg-white text-navy-deep max-w-md w-full max-h-[88dvh] rounded-2xl p-4 sm:p-5 border border-surface-container-high/60 shadow-2xl flex flex-col gap-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-surface-container-high/40 pb-3 shrink-0">
              <h3 className="font-headline-sm text-headline-sm text-navy-deep font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[22px]">person_add</span>
                Cadastrar Novo Atleta
              </h3>
              <button 
                type="button"
                onClick={() => setIsAddingManual(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto min-h-0 flex-1 pr-1">
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

            <div className="flex justify-end gap-2 pt-3 border-t border-surface-container-high/40 shrink-0">
              <button 
                type="button"
                onClick={() => setIsAddingManual(false)}
                className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface font-label-md"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleCreateManualPlayer}
                disabled={isCreating}
                className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-headline-sm flex items-center gap-1 shadow-md shadow-primary/20 active:scale-95 disabled:opacity-50"
              >
                {isCreating ? 'Cadastrando...' : 'Cadastrar Atleta'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Dashboard;
