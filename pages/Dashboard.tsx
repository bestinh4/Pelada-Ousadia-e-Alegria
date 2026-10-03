import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Match, Player, Page, PixConfig } from '../types.ts';
import { db, doc, updateDoc, setDoc, collection, onSnapshot, addDoc, deleteDoc } from '../services/firebase.ts';
import { MASTER_ADMIN_EMAIL } from '../constants.tsx';
import { getNotificationStatus, requestNotificationPermission, broadcastNotification, sendPendingAthletesReminder } from '../services/notificationService.ts';
import { isLateRemovalTime, checkLateRemovalDeadline, checkMatchEveInfo } from '../utils/timeUtils.ts';
import { DEFAULT_PIX_CONFIG } from '../utils/pixUtils.ts';
import { PixPaymentModal, PixIcon } from '../components/PixPaymentModal.tsx';
import { getCurrentMonthKey, getMonthName, getMensalistaPaymentInfo, MENSALISTA_DUE_DAY } from '../utils/mensalistaUtils.ts';
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
  const [isOpenPeladaModal, setIsOpenPeladaModal] = useState(false);
  const [peladaModalMode, setPeladaModalMode] = useState<'new_list' | 'edit_date'>('new_list');
  const [nextPeladaForm, setNextPeladaForm] = useState({
    date: '',
    time: '20:00',
    location: 'Granja Cantinho do Céu'
  });
  const [isSendingPendingPush, setIsSendingPendingPush] = useState(false);
  const [lastAutoEveSentAt, setLastAutoEveSentAt] = useState<string | null>(null);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [priceForm, setPriceForm] = useState({ mensalista: 60, avulso: 40, multa: 20 });
  const [pixConfig, setPixConfig] = useState<PixConfig>(DEFAULT_PIX_CONFIG);
  const [pixForm, setPixForm] = useState<PixConfig>(DEFAULT_PIX_CONFIG);
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [isPixModalOpen, setIsPixModalOpen] = useState(false);
  const [sharedReceiptFile, setSharedReceiptFile] = useState<File | null>(null);
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
        const normalizedPix: PixConfig = {
          pixKey: data.pixKey || DEFAULT_PIX_CONFIG.pixKey,
          pixKeyType: data.pixKeyType || DEFAULT_PIX_CONFIG.pixKeyType,
          receiverName: data.receiverName || DEFAULT_PIX_CONFIG.receiverName,
          receiverCity: data.receiverCity || DEFAULT_PIX_CONFIG.receiverCity,
          bankLabel: data.bankLabel || DEFAULT_PIX_CONFIG.bankLabel
        };
        setPrices(normalized);
        setPriceForm(normalized);
        setPixConfig(normalizedPix);
        setPixForm(normalizedPix);
        try {
          localStorage.setItem('oa_real_finance_cache', JSON.stringify({ ...normalized, ...normalizedPix }));
        } catch {}
      }
    });
    return () => unsubPrices();
  }, []);

  // Verifica se o atleta acabou de compartilhar um comprovante direto do app do banco (Web Share Target API)
  useEffect(() => {
    const checkSharedReceipt = async () => {
      try {
        if (!('caches' in window)) return;
        const cache = await caches.open('oa-shared-receipt-cache');
        const response = await cache.match('/__shared-receipt-file');
        if (response) {
          const blob = await response.blob();
          const encodedName = response.headers.get('X-Receipt-Name') || 'comprovante.jpg';
          const fileName = decodeURIComponent(encodedName);
          const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
          await cache.delete('/__shared-receipt-file');
          setSharedReceiptFile(file);
          setIsPixModalOpen(true);

          if (window.location.search.includes('shared-receipt')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }
      } catch (e) {
        console.warn('Erro ao recuperar comprovante compartilhado:', e);
      }
    };

    checkSharedReceipt();
  }, []);

  // Correção: O mês de outubro ainda não está pago. Reseta os mensalistas para pendente para pagarem até dia 10.
  const hasResetOctoberMensalistasRef = React.useRef(false);
  useEffect(() => {
    if (players.length === 0 || hasResetOctoberMensalistasRef.current) return;
    const hasAlreadyReset = localStorage.getItem('oa_mensalistas_oct_reset_v2');
    if (hasAlreadyReset) return;
    hasResetOctoberMensalistasRef.current = true;

    const currentMonthKey = getCurrentMonthKey();
    const mensalistasToReset = players.filter(
      p => p.playerType === 'mensalista' && (p.monthlyPaid || p.monthlyPaidMonth === currentMonthKey)
    );

    if (mensalistasToReset.length > 0) {
      Promise.all(
        mensalistasToReset.map(p =>
          updateDoc(doc(db, "players", p.id), {
            monthlyPaid: false,
            monthlyPaidMonth: null
          }).catch(() => {})
        )
      ).then(() => {
        localStorage.setItem('oa_mensalistas_oct_reset_v2', 'true');
      }).catch(() => {});
    } else {
      localStorage.setItem('oa_mensalistas_oct_reset_v2', 'true');
    }
  }, [players]);

  const handleSaveFinancePrices = async () => {
    if (!isCurrentUserAdmin) return;
    setIsSavingPrices(true);
    try {
      const payload = {
        mensalista: Math.max(0, Number(priceForm.mensalista) || 0),
        avulso: Math.max(0, Number(priceForm.avulso) || 0),
        multa: Math.max(0, Number(priceForm.multa) || 0),
        pixKey: (pixForm.pixKey || DEFAULT_PIX_CONFIG.pixKey).trim(),
        pixKeyType: pixForm.pixKeyType || 'email',
        receiverName: (pixForm.receiverName || DEFAULT_PIX_CONFIG.receiverName).trim(),
        receiverCity: (pixForm.receiverCity || DEFAULT_PIX_CONFIG.receiverCity).trim(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, "settings", "finance"), payload, { merge: true });
      if (match?.id) {
        await updateDoc(doc(db, "matches", match.id), { price: payload.avulso }).catch(() => {});
      }
      setIsEditingPrices(false);
      alert("Valores e Chave Pix Oficial atualizados com sucesso!");
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

  // Helpers de data para sugerir a próxima pelada sem repetir a data antiga
  const formatLocalIsoDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getNextSaturdayIso = (): string => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Dom, 6 = Sáb
    let daysUntilSat = (6 - dayOfWeek + 7) % 7;
    if (daysUntilSat === 0) daysUntilSat = 7;
    const nextSat = new Date(now);
    nextSat.setDate(now.getDate() + daysUntilSat);
    return formatLocalIsoDate(nextSat);
  };

  const getPlus7DaysFromLastIso = (): string => {
    if (match?.date) {
      const base = new Date(match.date + 'T12:00:00');
      if (!isNaN(base.getTime())) {
        base.setDate(base.getDate() + 7);
        const candidate = formatLocalIsoDate(base);
        const todayIso = formatLocalIsoDate(new Date());
        if (candidate >= todayIso) return candidate;
      }
    }
    return getNextSaturdayIso();
  };

  // Abrir modal para Liberar Lista da Nova Pelada (exigindo/permitindo definir a nova data)
  const handleReleaseNextPelada = () => {
    if (!isCurrentUserAdmin) return;
    const suggestedDate = getPlus7DaysFromLastIso();
    setPeladaModalMode('new_list');
    setNextPeladaForm({
      date: suggestedDate,
      time: match?.time || '20:00',
      location: displayLocation || 'Granja Cantinho do Céu'
    });
    setIsOpenPeladaModal(true);
  };

  // Abrir modal apenas para corrigir/alterar a data e horário da pelada atual sem resetar a lista
  const handleOpenEditPeladaDate = () => {
    if (!isCurrentUserAdmin) return;
    setPeladaModalMode('edit_date');
    setNextPeladaForm({
      date: match?.date || getNextSaturdayIso(),
      time: match?.time || '20:00',
      location: displayLocation || 'Granja Cantinho do Céu'
    });
    setIsOpenPeladaModal(true);
  };

  // Salvar Nova Pelada (com nova data + liberação da lista) ou Apenas Atualizar Data/Horário
  const handleConfirmSavePelada = async () => {
    if (!isCurrentUserAdmin) return;
    if (!nextPeladaForm.date) {
      alert("Por favor, selecione a data da pelada!");
      return;
    }

    setIsReleasingList(true);
    try {
      const now = new Date().toISOString();
      const cleanLocation = nextPeladaForm.location.trim() || 'Granja Cantinho do Céu';
      const cleanTime = nextPeladaForm.time || '20:00';
      const cleanDate = nextPeladaForm.date;

      const matchPayload = {
        location: cleanLocation,
        date: cleanDate,
        time: cleanTime,
        type: 'Mini-Campo',
        price: prices.avulso || 40,
        fieldSlots: 30,
        gkSlots: 4,
        createdAt: now
      };

      // Atualiza o documento atual (se existir) E garante que seja o mais recente para sincronizar em todos os aparelhos
      if (match?.id) {
        await updateDoc(doc(db, "matches", match.id), matchPayload);
      } else {
        await addDoc(collection(db, "matches"), {
          ...matchPayload,
          confirmedPlayers: 0
        });
      }

      const formattedDateBr = new Date(cleanDate + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      if (peladaModalMode === 'new_list') {
        // Atualizar todos os atletas para a nova pelada (Mensalistas regulares -> presente; Avulsos e Penalizados -> pendente)
        const promises = players.map(async (p) => {
          if (p.playerType === 'mensalista') {
            if (!p.suplenteNextMatch) {
              return updateDoc(doc(db, "players", p.id), {
                status: 'presente',
                confirmedAt: now,
                courtCheckIn: false
              });
            } else {
              return updateDoc(doc(db, "players", p.id), {
                status: 'pendente',
                confirmedAt: null,
                courtCheckIn: false
              });
            }
          } else {
            return updateDoc(doc(db, "players", p.id), {
              status: 'pendente',
              confirmedAt: null,
              courtCheckIn: false,
              paymentStatus: 'pendente'
            });
          }
        });

        await Promise.all(promises);

        // Garantir que nenhuma sessão antiga de times fique presa como ativa
        await deleteDoc(doc(db, "sessions", "current")).catch(() => {});
        localStorage.removeItem('oa_real_session_cache');

        // Disparar notificação oficial com a nova data
        try {
          await broadcastNotification(
            "⚽ NOVA PELADA ABERTA!",
            `Lista liberada para ${formattedDateBr} às ${cleanTime} (${cleanLocation})! Mensalistas já confirmados.`,
            user?.uid
          );
        } catch {}

        setIsOpenPeladaModal(false);
        alert(`✅ Nova pelada aberta para ${formattedDateBr} às ${cleanTime}!\n\nA data foi atualizada, os mensalistas foram confirmados e a lista está pronta.`);
      } else {
        setIsOpenPeladaModal(false);
        alert(`✅ Data e horário da pelada atualizados para ${formattedDateBr} às ${cleanTime}!`);
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar a data da pelada.");
    } finally {
      setIsReleasingList(false);
    }
  };

  // Cadastrar Atleta Manualmente
  const handleCreateManualPlayer = async () => {
    if (!newPlayerData.name.trim()) return alert("Digite o nome do atleta!");
    setIsCreating(true);
    try {
      const isMensal = newPlayerData.playerType === 'mensalista';
      const curMonth = getCurrentMonthKey();
      await addDoc(collection(db, "players"), {
        ...newPlayerData,
        goals: Number(newPlayerData.goals) || 0,
        assists: 0,
        role: 'player',
        photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(newPlayerData.name)}&background=003a75&color=fff&size=256`,
        createdAt: new Date().toISOString(),
        confirmedAt: newPlayerData.status === 'presente' ? new Date().toISOString() : null,
        monthlyPaid: isMensal ? true : false,
        monthlyPaidMonth: isMensal ? curMonth : null
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

  useEffect(() => {
    const unsubReminders = onSnapshot(doc(db, "settings", "reminders"), (snap) => {
      if (snap.exists()) {
        setLastAutoEveSentAt(snap.data()?.lastAutoEveSentAt || null);
      }
    }, () => {});
    return () => unsubReminders();
  }, []);

  const pendingPlayersList = players.filter(p => p.status === 'pendente');
  const eveInfo = checkMatchEveInfo(match);

  const handleSendReminderToPending = async () => {
    if (!isCurrentUserAdmin || isSendingPendingPush) return;
    if (pendingPlayersList.length === 0) {
      alert("Todos os atletas já responderam à convocação (nenhum pendente no momento)!");
      return;
    }

    setIsSendingPendingPush(true);
    try {
      await sendPendingAthletesReminder(match, user?.uid, eveInfo.isEve);
      await setDoc(doc(db, "settings", "reminders"), {
        lastManualReminderAt: new Date().toISOString(),
        pendingCountAtSend: pendingPlayersList.length
      }, { merge: true }).catch(() => {});
      alert(`🔔 Lembrete Push enviado com sucesso para os ${pendingPlayersList.length} atleta(s) com status PENDENTE!`);
    } catch {
      alert("Erro ao enviar lembrete push.");
    } finally {
      setIsSendingPendingPush(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto pb-6 gap-4 animate-fade-in">
      {/* BANNER DE LEMBRETE DE VÉSPERA PARA ATLETAS COM STATUS PENDENTE */}
      {!isConfirmed && !isRefused && (
        <div className={`w-full rounded-2xl p-3.5 sm:p-4 shadow-sm border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          eveInfo.isEve
            ? 'bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-red-500/10 border-amber-500/50'
            : 'bg-amber-50/80 border-amber-300/70'
        }`}>
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[22px]">notifications_active</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-900 font-label-md text-[10px] font-bold uppercase tracking-wider">
                  {eveInfo.isEve ? '⏰ VÉSPERA DA PELADA' : '⚠️ STATUS PENDENTE'}
                </span>
                <span className="text-[11px] font-semibold text-amber-900">
                  Prazo limite: 18h da véspera
                </span>
              </div>
              <h3 className="font-headline-sm text-xs sm:text-sm font-bold text-navy-deep mt-0.5">
                {eveInfo.isEve
                  ? `Amanhã tem pelada (${eveInfo.matchTime}) e sua presença ainda está pendente!`
                  : 'Você ainda não confirmou sua presença para a próxima pelada!'}
              </h3>
              <p className="text-[11px] text-outline leading-snug">
                Confirme agora para garantir sua vaga na lista antes do sorteio das equipes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {getNotificationStatus() === 'default' && (
              <button
                type="button"
                onClick={() => requestNotificationPermission(user?.uid)}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-surface-container text-navy-deep border border-amber-400/50 font-label-md text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
                title="Ativar lembretes push no celular"
              >
                <span className="material-symbols-outlined text-[16px] text-amber-600">notifications</span>
                <span>Ativar Push</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => updatePresence('presente')}
              disabled={isUpdating}
              className="flex-1 sm:flex-initial min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-primary-container to-primary-bright text-on-primary font-headline-sm text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              <span>Confirmar Agora</span>
            </button>
          </div>
        </div>
      )}

      {/* PAINEL DA DIRETORIA (EXCLUSIVO PARA ADMINISTRADORES) */}
      {isCurrentUserAdmin && (
        <div className="w-full rounded-2xl bg-surface-container-lowest p-3.5 sm:p-4 shadow-sm border border-primary-container/25 flex flex-col gap-3">
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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

            {/* BOTÃO 2: HISTÓRICO DE PELADAS ENCERRADAS */}
            <button
              onClick={() => {
                localStorage.setItem('oa_open_history_tab', 'true');
                onPageChange(Page.TeamBalancing);
              }}
              className="min-h-[44px] py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
              title="Procurar peladas encerradas no histórico e fazer alterações de presença ou multas"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">history</span>
              <span className="truncate">HISTÓRICO DE PELADAS</span>
            </button>

            {/* BOTÃO 3: CADASTRAR NOVO ATLETA */}
            <button
              onClick={() => setIsAddingManual(true)}
              className="min-h-[44px] py-2.5 px-3 bg-gradient-to-r from-primary-container to-primary-bright hover:opacity-95 text-on-primary rounded-xl font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
              title="Cadastrar novo atleta manualmente no sistema"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">person_add</span>
              <span className="truncate">CADASTRAR ATLETA</span>
            </button>

            {/* BOTÃO 4: DEFINIR VALORES (AVULSO, MENSALISTA E MULTA) */}
            <button
              onClick={() => {
                setPriceForm(prices);
                setPixForm(pixConfig);
                setIsEditingPrices(true);
              }}
              className="min-h-[44px] py-2.5 px-3 bg-navy-deep hover:opacity-95 text-white rounded-xl font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
              title="Definir valores de Avulsos, Mensalistas, Multas e Chave Pix"
            >
              <PixIcon className="w-4 h-4" color="#32BCAD" />
              <span className="truncate">VALORES & PIX</span>
            </button>
          </div>

          {/* BARRA DE LEMBRETE PUSH AUTOMÁTICO DE VÉSPERA PARA PENDENTES */}
          <div className="p-2.5 sm:p-3 rounded-xl bg-surface-container-low border border-surface-container-high/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">schedule_send</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-navy-deep">
                    Lembrete Push de Véspera (Automático)
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                    Ativo
                  </span>
                </div>
                <p className="text-[11px] text-outline truncate">
                  {pendingPlayersList.length} atleta(s) pendente(s) · Dispara automaticamente na véspera
                  {lastAutoEveSentAt ? ` (Último envio: ${new Date(lastAutoEveSentAt).toLocaleDateString('pt-BR')})` : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendReminderToPending}
              disabled={isSendingPendingPush || pendingPlayersList.length === 0}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all shrink-0 disabled:opacity-50"
              title="Disparar notificação push agora exclusivamente para os atletas com status Pendente"
            >
              <span className="material-symbols-outlined text-[16px]">notifications_active</span>
              <span>
                {isSendingPendingPush
                  ? 'Enviando Push...'
                  : `Lembrar Pendentes (${pendingPlayersList.length})`}
              </span>
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
                <div className="flex items-center gap-2 pl-6 flex-wrap">
                  <p className="text-xs text-white/90 font-semibold truncate">
                    {match?.date ? new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' }) : 'Sábado'}
                  </p>
                  {isCurrentUserAdmin && (
                    <button
                      type="button"
                      onClick={handleOpenEditPeladaDate}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-bold uppercase tracking-wide shadow-xs active:scale-95 transition-all"
                      title="Alterar a data ou horário desta pelada"
                    >
                      <span className="material-symbols-outlined text-[13px]">edit_calendar</span>
                      <span>Alterar Data</span>
                    </button>
                  )}
                </div>
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

          {/* COBRANÇA PIX DIRETO NO APP & ENVIO AUTOMÁTICO DE COMPROVANTE */}
          {currentPlayer && (
            (() => {
              const isGoleiroExempt = currentPlayer.position === 'Goleiro';
              const isMensal = currentPlayer.playerType === 'mensalista';
              const mensalistaInfo = isMensal ? getMensalistaPaymentInfo(currentPlayer) : null;
              const isPaidNow = isGoleiroExempt || (isMensal ? Boolean(mensalistaInfo?.isPaid) : currentPlayer.paymentStatus === 'pago');
              const hasFineNow = Boolean(currentPlayer.hasNoShowFine || currentPlayer.hasLateRemovalFine);
              const fineValNow = hasFineNow ? (currentPlayer.fineAmount || prices.multa || 20) : 0;
              const baseValNow = isGoleiroExempt ? 0 : (isMensal ? prices.mensalista : prices.avulso);
              const totalDueNow = (isPaidNow ? 0 : baseValNow) + fineValNow;

              return (
                <div
                  className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                    isPaidNow && !hasFineNow
                      ? 'bg-emerald-50/70 border-emerald-300/70'
                      : hasFineNow
                        ? 'bg-red-50/70 border-red-300/80'
                        : isMensal && mensalistaInfo?.isOverdue
                          ? 'bg-red-50/70 border-red-300/80'
                          : 'bg-surface-container-low border-surface-container-high/70'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                        isPaidNow && !hasFineNow
                          ? 'bg-emerald-600 text-white'
                          : hasFineNow || (isMensal && mensalistaInfo?.isOverdue)
                            ? 'bg-red-600 text-white'
                            : 'bg-[#32BCAD]/15 text-[#32BCAD] border border-[#32BCAD]/30'
                      }`}
                    >
                      {isPaidNow && !hasFineNow ? (
                        <span className="material-symbols-outlined text-[22px]">verified</span>
                      ) : (
                        <PixIcon className="w-5 h-5" color={hasFineNow || (isMensal && mensalistaInfo?.isOverdue) ? '#ffffff' : '#32BCAD'} />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
                          {isMensal ? 'Mensalidade Oficial (Vencimento Dia 10)' : 'Taxa da Pelada (Avulso)'}
                        </span>
                        <span className="text-outline">·</span>
                        {isGoleiroExempt && !hasFineNow ? (
                          <span className="text-[11px] font-bold text-emerald-700 uppercase">
                            Goleiro Isento 🛡️
                          </span>
                        ) : isPaidNow && !hasFineNow ? (
                          <span className="text-[11px] font-bold text-emerald-700 uppercase">
                            {isMensal ? 'Mensalidade Paga ✅' : 'Pagamento Confirmado ✅'}
                          </span>
                        ) : isMensal && mensalistaInfo?.isOverdue ? (
                          <span className="text-[11px] font-bold text-red-800 uppercase">
                            Mensalidade Vencida ⚠️
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-amber-800 uppercase">
                            {isMensal ? 'Aguardando Pagamento (Até dia 10) ⏳' : 'Aguardando Pagamento ⏳'}
                          </span>
                        )}
                      </div>

                      <h4 className="font-headline-sm text-xs sm:text-sm font-bold text-navy-deep mt-0.5">
                        {isPaidNow && !hasFineNow ? (
                          isGoleiroExempt ? (
                            'Goleiros titulares possuem isenção na pelada'
                          ) : isMensal ? (
                            `Sua mensalidade de ${getMonthName()} (R$ ${prices.mensalista},00) está confirmada!`
                          ) : (
                            `Seu pagamento (R$ ${prices.avulso},00) já está confirmado!`
                          )
                        ) : hasFineNow && !isPaidNow ? (
                          `Total a pagar: R$ ${totalDueNow},00 (${isMensal ? 'Mensal' : 'Pelada'} R$ ${baseValNow} + Multa R$ ${fineValNow})`
                        ) : hasFineNow ? (
                          `Você possui uma multa pendente de R$ ${fineValNow},00`
                        ) : isMensal ? (
                          mensalistaInfo?.isOverdue
                            ? `Mensalidade vencida em ${mensalistaInfo.deadlineDateFormatted}. Pague R$ ${baseValNow},00 no Pix para regularizar sua vaga.`
                            : `Valor: R$ ${baseValNow},00 • Prazo para pagamento até ${mensalistaInfo?.deadlineDateFormatted} (${mensalistaInfo?.daysRemaining} dias restantes)`
                        ) : (
                          `Valor: R$ ${baseValNow},00 • Pague no Pix e envie o comprovante para baixa automática`
                        )}
                      </h4>

                      {isMensal && isPaidNow && !hasFineNow && (
                        <p className="text-[11px] text-emerald-800 font-semibold mt-0.5">
                          Próximo vencimento: {mensalistaInfo?.nextDueDateFormatted} (prazo até dia 10)
                        </p>
                      )}

                      {currentPlayer.lastReceiptSummary && isPaidNow && (
                        <p className="text-[11px] text-emerald-800 font-medium mt-0.5 truncate">
                          Último comprovante validado: {currentPlayer.lastReceiptSummary}
                        </p>
                      )}
                    </div>
                  </div>

                  {(() => {
                    // Para o Mensalista: o botão é "Pagar Mensalidade" e SOME quando o pagamento for confirmado
                    if (isMensal) {
                      if (isPaidNow && !hasFineNow) {
                        return null; // Some completamente quando o pagamento for confirmado!
                      }
                      return (
                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => setIsPixModalOpen(true)}
                            className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl font-headline-sm text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all bg-[#32BCAD] hover:bg-[#28a99b] text-white shadow-[#32BCAD]/25"
                          >
                            <PixIcon className="w-4 h-4" color="#ffffff" />
                            <span>{hasFineNow ? 'Pagar Mensalidade + Multa' : 'Pagar Mensalidade'}</span>
                          </button>
                        </div>
                      );
                    }

                    // Para o Avulso: aparece toda pelada
                    if (!isGoleiroExempt || hasFineNow) {
                      return (
                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => setIsPixModalOpen(true)}
                            className={`w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl font-headline-sm text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all ${
                              isPaidNow && !hasFineNow
                                ? 'bg-white hover:bg-surface-container text-navy-deep border border-emerald-300'
                                : 'bg-[#32BCAD] hover:bg-[#28a99b] text-white shadow-[#32BCAD]/25'
                            }`}
                          >
                            <PixIcon
                              className="w-4 h-4"
                              color={isPaidNow && !hasFineNow ? '#32BCAD' : '#ffffff'}
                            />
                            <span>
                              {isPaidNow && !hasFineNow
                                ? 'Ver Pix / Novo Comprovante'
                                : hasFineNow
                                  ? 'Pagar Pelada + Multa'
                                  : 'Pagar com Pix / Comprovante'}
                            </span>
                          </button>
                        </div>
                      );
                    }

                    return null;
                  })()}
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* MODAL DE PAGAMENTO PIX & VERIFICAÇÃO AUTOMÁTICA DE COMPROVANTE */}
      {currentPlayer && (
        <PixPaymentModal
          isOpen={isPixModalOpen}
          onClose={() => setIsPixModalOpen(false)}
          player={currentPlayer}
          match={match}
          prices={prices}
          pixConfig={pixConfig}
          initialSharedFile={sharedReceiptFile}
          onClearSharedFile={() => setSharedReceiptFile(null)}
        />
      )}

      {/* MODAL: ABRIR NOVA PELADA / DEFINIR DATA E HORÁRIO (DIRETORIA) */}
      {isOpenPeladaModal && isCurrentUserAdmin && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999 }}
          className="bg-navy-deep/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpenPeladaModal(false);
          }}
        >
          <div
            className="bg-white text-navy-deep max-w-md w-full max-h-[90dvh] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-surface-container-high/60 shadow-2xl flex flex-col gap-3.5 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-surface-container-high/50 pb-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[22px]">calendar_month</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-headline-sm text-sm sm:text-base text-navy-deep font-bold truncate">
                    {peladaModalMode === 'new_list' ? 'Abrir Nova Pelada & Definir Data' : 'Alterar Data e Horário da Pelada'}
                  </h3>
                  <p className="text-[11px] text-outline truncate">
                    Escolha a data oficial da pelada para atualizar o painel e a lista
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpenPeladaModal(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Alternador de Modo: Abrir Nova Lista vs Apenas Alterar Data */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-surface-container-low border border-surface-container-high/50 shrink-0">
              <button
                type="button"
                onClick={() => setPeladaModalMode('new_list')}
                className={`py-2 px-2.5 rounded-lg font-headline-sm text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  peladaModalMode === 'new_list'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-navy-deep hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">rule_folder</span>
                <span>Abrir Nova Lista</span>
              </button>
              <button
                type="button"
                onClick={() => setPeladaModalMode('edit_date')}
                className={`py-2 px-2.5 rounded-lg font-headline-sm text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  peladaModalMode === 'edit_date'
                    ? 'bg-navy-deep text-white shadow-xs'
                    : 'text-navy-deep hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">edit_calendar</span>
                <span>Só Mudar Data</span>
              </button>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto min-h-0 flex-1 pr-1">
              {/* Campo de Data da Nova Pelada + Atalhos Rápidos */}
              <div className="p-3 rounded-xl bg-surface-container-low border border-surface-container-high/60 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="font-label-md text-xs text-navy-deep font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] text-primary-container">event</span>
                    <span>DATA DA NOVA PELADA</span>
                  </label>
                  {match?.date && (
                    <span className="text-[10px] text-outline font-medium">
                      Anterior: {new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>

                <input
                  type="date"
                  value={nextPeladaForm.date}
                  onChange={(e) => setNextPeladaForm({ ...nextPeladaForm, date: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl bg-white border-2 border-primary-container/40 focus:border-primary-container outline-none font-headline-sm text-sm text-navy-deep font-bold cursor-pointer"
                />

                {/* Atalhos rápidos de data */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-bold text-outline uppercase mr-1">Atalhos:</span>
                  <button
                    type="button"
                    onClick={() => setNextPeladaForm({ ...nextPeladaForm, date: getNextSaturdayIso() })}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-surface-container text-navy-deep border border-surface-container-high text-[11px] font-bold active:scale-95 transition-all"
                  >
                    Próximo Sábado
                  </button>
                  {match?.date && (
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(match.date + 'T12:00:00');
                        if (!isNaN(d.getTime())) {
                          d.setDate(d.getDate() + 7);
                          setNextPeladaForm({ ...nextPeladaForm, date: formatLocalIsoDate(d) });
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-surface-container text-navy-deep border border-surface-container-high text-[11px] font-bold active:scale-95 transition-all"
                    >
                      +7 Dias da Última
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setNextPeladaForm({ ...nextPeladaForm, date: formatLocalIsoDate(new Date()) })}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-surface-container text-navy-deep border border-surface-container-high text-[11px] font-bold active:scale-95 transition-all"
                  >
                    Hoje
                  </button>
                </div>
              </div>

              {/* Horário e Local */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-5">
                  <label className="font-label-md text-xs text-navy-deep font-bold block mb-1">
                    HORÁRIO DE INÍCIO
                  </label>
                  <input
                    type="time"
                    value={nextPeladaForm.time}
                    onChange={(e) => setNextPeladaForm({ ...nextPeladaForm, time: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-sm text-navy-deep font-bold cursor-pointer"
                  />
                </div>

                <div className="sm:col-span-7">
                  <label className="font-label-md text-xs text-navy-deep font-bold block mb-1">
                    LOCAL DA PELADA
                  </label>
                  <input
                    type="text"
                    value={nextPeladaForm.location}
                    onChange={(e) => setNextPeladaForm({ ...nextPeladaForm, location: e.target.value })}
                    placeholder="Granja Cantinho do Céu"
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-sm text-navy-deep font-semibold"
                  />
                </div>
              </div>

              {/* Resumo do que acontecerá ao confirmar */}
              {peladaModalMode === 'new_list' ? (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5 text-emerald-900">
                    <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                    <span>O que será feito ao confirmar:</span>
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-emerald-900/90">
                    <li>
                      A data da pelada será atualizada para{' '}
                      <strong>
                        {nextPeladaForm.date
                          ? new Date(nextPeladaForm.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                          : 'a data escolhida'}
                      </strong>.
                    </li>
                    <li>
                      <strong>{players.filter(p => p.playerType === 'mensalista' && !p.suplenteNextMatch).length} Mensalista(s)</strong> serão confirmados automaticamente na lista.
                    </li>
                    {players.filter(p => p.playerType === 'mensalista' && p.suplenteNextMatch).length > 0 && (
                      <li className="text-amber-900 font-semibold">
                        {players.filter(p => p.playerType === 'mensalista' && p.suplenteNextMatch).length} Mensalista(s) penalizado(s) ficarão na suplência.
                      </li>
                    )}
                    <li>Todos os atletas avulsos ficarão com status &quot;Pendente&quot; para confirmar presença.</li>
                  </ul>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-navy-deep text-xs">
                  <p className="font-semibold">
                    ℹ️ Apenas a data, horário e local serão atualizados. As confirmações de presença atuais da lista serão mantidas.
                  </p>
                </div>
              )}
            </div>

            {/* Botões de Ação */}
            <div className="flex justify-end gap-2 pt-3 border-t border-surface-container-high/40 shrink-0">
              <button
                type="button"
                onClick={() => setIsOpenPeladaModal(false)}
                className="px-4 py-2.5 rounded-xl bg-surface-container-high text-on-surface font-label-md text-xs font-bold active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSavePelada}
                disabled={isReleasingList || !nextPeladaForm.date}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-headline-sm text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[17px]">
                  {peladaModalMode === 'new_list' ? 'campaign' : 'save'}
                </span>
                <span>
                  {isReleasingList
                    ? 'Salvando...'
                    : peladaModalMode === 'new_list'
                      ? 'Abrir Nova Pelada & Liberar Lista'
                      : 'Salvar Nova Data'}
                </span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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

              <div className="pt-3 border-t border-surface-container-high/50 flex flex-col gap-2.5">
                <span className="font-label-md text-xs text-emerald-800 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <PixIcon className="w-4 h-4" color="#32BCAD" />
                  <span>Configuração do Pix Oficial (Recebimento no App)</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="font-label-md text-[11px] text-navy-deep font-bold block mb-1">
                      Tipo de Chave
                    </label>
                    <select
                      value={pixForm.pixKeyType}
                      onChange={(e) => setPixForm({ ...pixForm, pixKeyType: e.target.value as any })}
                      className="w-full h-10 px-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-bold"
                    >
                      <option value="email">E-mail</option>
                      <option value="cpf">CPF</option>
                      <option value="cnpj">CNPJ</option>
                      <option value="phone">Celular</option>
                      <option value="evp">Chave Aleatória</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="font-label-md text-[11px] text-navy-deep font-bold block mb-1">
                      Chave Pix Oficial da Pelada
                    </label>
                    <input
                      type="text"
                      value={pixForm.pixKey}
                      onChange={(e) => setPixForm({ ...pixForm, pixKey: e.target.value })}
                      placeholder="Ex: diiogo49@gmail.com ou CPF/Celular"
                      className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-label-md text-[11px] text-navy-deep font-bold block mb-1">
                    Nome do Recebedor (Titular da Conta Pix)
                  </label>
                  <input
                    type="text"
                    value={pixForm.receiverName}
                    onChange={(e) => setPixForm({ ...pixForm, receiverName: e.target.value })}
                    placeholder="Ex: DIOGO / OUSADIA E ALEGRIA"
                    className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-bold"
                  />
                </div>
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
