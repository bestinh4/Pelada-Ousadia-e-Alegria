import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Player, Page, Expense, Match, PaymentReceipt, PixConfig } from '../types.ts';
import { MASTER_ADMIN_EMAIL } from '../constants.tsx';
import { db, doc, updateDoc, setDoc, onSnapshot, collection, addDoc, deleteDoc, query, orderBy, limit } from '../services/firebase.ts';
import { DEFAULT_PIX_CONFIG } from '../utils/pixUtils.ts';
import { PixPaymentModal, PixIcon } from '../components/PixPaymentModal.tsx';
import { getCurrentMonthKey, getMonthName, getMensalistaPaymentInfo, MENSALISTA_DUE_DAY } from '../utils/mensalistaUtils.ts';

const Finance: React.FC<{ players: Player[], currentUser: any, match: Match | null, onPageChange: (page: Page) => void }> = ({ players, currentUser, match, onPageChange }) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'todos' | 'pendentes' | 'pagos'>('todos');
  const [finView, setFinView] = useState<'receitas' | 'comprovantes' | 'despesas' | 'multas'>('receitas');
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
  const [pixConfig, setPixConfig] = useState<PixConfig>(DEFAULT_PIX_CONFIG);
  const [pixForm, setPixForm] = useState<PixConfig>(DEFAULT_PIX_CONFIG);
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [priceForm, setPriceForm] = useState({ mensalista: 60, avulso: 40, multa: 20 });
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [previewReceipt, setPreviewReceipt] = useState<PaymentReceipt | null>(null);
  const [selectedPlayerForPix, setSelectedPlayerForPix] = useState<Player | null>(null);

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const cached = localStorage.getItem('oa_real_expenses_cache');
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({ description: '', amount: 0, category: 'Outros' });
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [isSyncingMensalistas, setIsSyncingMensalistas] = useState(false);
  const [mensalistasSyncSuccess, setMensalistasSyncSuccess] = useState(false);
  const hasAutoSyncedMensalistas = React.useRef(false);

  const currentPlayer = players.find(p => 
    p.id === currentUser?.uid || 
    (currentUser?.email && p.email && p.email.toLowerCase() === currentUser.email.toLowerCase())
  );
  const isMasterUser = currentUser?.email === MASTER_ADMIN_EMAIL;
  const isUserAdmin = currentPlayer?.role === 'admin' || isMasterUser;

  const currentMonthKey = getCurrentMonthKey();
  const currentMonthName = getMonthName();

  // Sincronização automática: Todos os mensalistas já estão pagos para este mês
  useEffect(() => {
    if (!isUserAdmin || players.length === 0 || hasAutoSyncedMensalistas.current) return;
    hasAutoSyncedMensalistas.current = true;

    const mensalistasToUpdate = players.filter(
      p => p.playerType === 'mensalista' && (!p.monthlyPaid || p.monthlyPaidMonth !== currentMonthKey)
    );

    if (mensalistasToUpdate.length > 0) {
      console.log(`[Finance] Marcando ${mensalistasToUpdate.length} mensalista(s) como pagos para o mês atual (${currentMonthKey})...`);
      Promise.all(
        mensalistasToUpdate.map(p =>
          updateDoc(doc(db, "players", p.id), {
            monthlyPaid: true,
            monthlyPaidMonth: currentMonthKey
          }).catch(e => console.error("Erro ao atualizar mensalista:", e))
        )
      ).catch(() => {});
    }
  }, [players, isUserAdmin, currentMonthKey]);

  const handleMarkAllMensalistasPaid = async () => {
    if (!isUserAdmin) return;
    setIsSyncingMensalistas(true);
    try {
      const allMensalistas = players.filter(p => p.playerType === 'mensalista');
      await Promise.all(
        allMensalistas.map(p =>
          updateDoc(doc(db, "players", p.id), {
            monthlyPaid: true,
            monthlyPaidMonth: currentMonthKey
          })
        )
      );
      setMensalistasSyncSuccess(true);
      setTimeout(() => setMensalistasSyncSuccess(false), 3000);
      alert(`✅ Todos os ${allMensalistas.length} mensalistas foram confirmados como PAGOS para ${currentMonthName}!`);
    } catch {
      alert("Erro ao atualizar status dos mensalistas.");
    } finally {
      setIsSyncingMensalistas(false);
    }
  };

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

    const unsubExpenses = onSnapshot(collection(db, "expenses"), (snapshot) => {
      const expenseList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(expenseList);
      try {
        localStorage.setItem('oa_real_expenses_cache', JSON.stringify(expenseList));
      } catch {}
    });

    const qReceipts = query(collection(db, "receipts"), orderBy("createdAt", "desc"), limit(50));
    const unsubReceipts = onSnapshot(qReceipts, (snapshot) => {
      const receiptList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PaymentReceipt));
      setReceipts(receiptList);
    }, () => {});

    return () => {
      unsubPrices();
      unsubExpenses();
      unsubReceipts();
    };
  }, []);

  if (!isUserAdmin) {
    return null;
  }

  const activePlayers = players.filter(p => p.status === 'presente');
  const finedPlayers = players.filter(p => p.hasNoShowFine || p.hasLateRemovalFine);

  const handleSavePrices = async () => {
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
      // Atualiza também o valor nas multas pendentes atuais para manter sincronizado
      await Promise.all(
        finedPlayers.map(fp =>
          updateDoc(doc(db, "players", fp.id), { fineAmount: payload.multa }).catch(() => {})
        )
      );
      setIsEditingPrices(false);
      alert("Valores e Chave Pix Oficial atualizados com sucesso!");
    } catch {
      alert("Erro ao salvar valores.");
    } finally {
      setIsSavingPrices(false);
    }
  };

  const handleClearPlayerFine = async (player: Player, removeSuplente: boolean) => {
    if (!isUserAdmin) return;
    setLoadingId(player.id);
    try {
      const updates: Record<string, any> = {
        hasNoShowFine: false,
        hasLateRemovalFine: false,
        fineAmount: 0,
        fineReason: null
      };
      if (removeSuplente) {
        updates.suplenteNextMatch = false;
      }
      await updateDoc(doc(db, "players", player.id), updates);
    } catch {
      alert("Erro ao atualizar multa do atleta.");
    } finally {
      setLoadingId(null);
    }
  };

  const checkIsExempt = (p: Player) => {
    const isGoleiro = p.position === 'Goleiro';
    const isAdminExempt = p.role === 'admin' && p.email !== MASTER_ADMIN_EMAIL;
    return isGoleiro || isAdminExempt;
  };

  const totals = activePlayers.reduce((acc, p) => {
    if (checkIsExempt(p)) return acc;
    const val = p.playerType === 'mensalista' ? prices.mensalista : prices.avulso;
    const paid = p.playerType === 'mensalista' ? p.monthlyPaid : p.paymentStatus === 'pago';
    if (paid) acc.paid += val; else acc.pending += val;
    return acc;
  }, { paid: 0, pending: 0 });

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netBalance = totals.paid - totalExpenses;

  const filteredPlayers = activePlayers.filter(p => {
    if (filter === 'todos') return true;
    const isExempt = checkIsExempt(p);
    if (isExempt) return filter === 'pagos';
    const isPaid = p.playerType === 'mensalista' ? p.monthlyPaid : p.paymentStatus === 'pago';
    return filter === 'pagos' ? isPaid : !isPaid;
  });

  const togglePaymentStatus = async (player: Player) => {
    if (!isUserAdmin) return;
    setLoadingId(player.id);
    try {
      const isMensalista = player.playerType === 'mensalista';
      const updates: any = {};
      if (isMensalista) {
        const nextPaid = !player.monthlyPaid;
        updates.monthlyPaid = nextPaid;
        updates.monthlyPaidMonth = nextPaid ? currentMonthKey : null;
      } else {
        updates.paymentStatus = player.paymentStatus === 'pago' ? 'pendente' : 'pago';
      }
      await updateDoc(doc(db, "players", player.id), updates);
    } catch {
      alert("Erro ao atualizar pagamento.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleCreateExpense = async () => {
    if (!newExpense.description || newExpense.amount <= 0) return alert("Preencha descrição e valor!");
    setIsSavingExpense(true);
    try {
      await addDoc(collection(db, "expenses"), {
        ...newExpense,
        date: new Date().toISOString()
      });
      setIsAddingExpense(false);
      setNewExpense({ description: '', amount: 0, category: 'Outros' });
    } catch {
      alert("Erro ao lançar despesa.");
    } finally {
      setIsSavingExpense(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto pb-6 gap-4 animate-fade-in">
      {/* BALANCE VAULT CARD (UNIFICADO COM AÇÃO DE DESPESA) */}
      <div className="bg-gradient-to-br from-navy-deep to-secondary text-canvas-white rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between gap-4 relative overflow-hidden">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span className="font-label-caps text-xs text-on-secondary/75 uppercase tracking-widest block mb-1">
              SALDO DISPONÍVEL EM CAIXA
            </span>
            <h2 className="font-scoreboard-num text-4xl sm:text-[44px] leading-none text-canvas-white tracking-wide">
              R$ {netBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h2>
          </div>

          {isUserAdmin && (
            <button 
              onClick={() => setIsAddingExpense(true)}
              className="h-9 px-3.5 bg-gradient-to-r from-primary-container to-primary-bright text-on-primary rounded-xl font-headline-sm text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">add_card</span>
              <span>+ DESPESA</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-canvas-white/10">
          <div className="bg-canvas-white/10 backdrop-blur-md rounded-xl p-2.5 sm:p-3">
            <span className="text-[10px] sm:text-xs text-tertiary-fixed font-bold uppercase block">RECEITAS</span>
            <p className="font-headline-sm text-xs sm:text-base text-canvas-white font-bold mt-0.5">
              R$ {totals.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-canvas-white/10 backdrop-blur-md rounded-xl p-2.5 sm:p-3">
            <span className="text-[10px] sm:text-xs text-primary-fixed font-bold uppercase block">DESPESAS</span>
            <p className="font-headline-sm text-xs sm:text-base text-canvas-white font-bold mt-0.5">
              R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-canvas-white/10 backdrop-blur-md rounded-xl p-2.5 sm:p-3">
            <span className="text-[10px] sm:text-xs text-amber-300 font-bold uppercase block">A RECEBER</span>
            <p className="font-headline-sm text-xs sm:text-base text-amber-300 font-bold mt-0.5">
              R$ {totals.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* TABELA DE VALORES & PIX DEFINIDOS PELA DIRETORIA */}
      <div className="w-full rounded-2xl bg-surface-container-lowest p-3.5 sm:p-4 shadow-xs border border-surface-container-high/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-label-caps text-[11px] text-navy-deep font-bold uppercase tracking-wider">
            TABELA OFICIAL DE VALORES & PIX (DIRETORIA)
          </span>
          <div className="flex items-center gap-2 flex-wrap text-xs font-semibold text-navy-deep">
            <span className="bg-surface-container px-2.5 py-1 rounded-lg">
              Mensalista: <strong>R$ {prices.mensalista},00</strong>
            </span>
            <span className="bg-surface-container px-2.5 py-1 rounded-lg">
              Avulso: <strong>R$ {prices.avulso},00</strong>
            </span>
            <span className="bg-red-50 text-red-800 border border-red-200 px-2.5 py-1 rounded-lg">
              Multa: <strong>R$ {prices.multa},00</strong>
            </span>
            <span className="bg-emerald-50 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-lg">
              Pix Oficial: <strong>{pixConfig.pixKey}</strong>
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            setPriceForm(prices);
            setPixForm(pixConfig);
            setIsEditingPrices(true);
          }}
          className="h-9 px-3.5 rounded-xl bg-navy-deep hover:opacity-95 text-white font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all shrink-0"
        >
          <PixIcon className="w-4 h-4" color="#32BCAD" />
          <span>VALORES & CHAVE PIX</span>
        </button>
      </div>

      {/* TABS: RECEITAS VS COMPROVANTES VS MULTAS VS DESPESAS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 p-1 bg-surface-container-high/60 rounded-xl gap-1">
        <button
          onClick={() => setFinView('receitas')}
          className={`py-2.5 px-2 rounded-lg font-headline-sm text-xs transition-all ${
            finView === 'receitas' ? 'bg-surface-container-lowest text-navy-deep shadow-sm font-bold' : 'text-on-surface-variant'
          }`}
        >
          RECEITAS ({filteredPlayers.length})
        </button>
        <button
          onClick={() => setFinView('comprovantes')}
          className={`py-2.5 px-2 rounded-lg font-headline-sm text-xs transition-all flex items-center justify-center gap-1 ${
            finView === 'comprovantes' ? 'bg-emerald-600 text-white shadow-sm font-bold' : 'text-emerald-800 hover:bg-emerald-500/10 font-semibold'
          }`}
        >
          <span>COMPROVANTES ({receipts.length})</span>
        </button>
        <button
          onClick={() => setFinView('multas')}
          className={`py-2.5 px-2 rounded-lg font-headline-sm text-xs transition-all flex items-center justify-center gap-1 ${
            finView === 'multas' ? 'bg-red-600 text-white shadow-sm font-bold' : 'text-red-700 hover:bg-red-500/10 font-semibold'
          }`}
        >
          <span>MULTAS ({finedPlayers.length})</span>
        </button>
        <button
          onClick={() => setFinView('despesas')}
          className={`py-2.5 px-2 rounded-lg font-headline-sm text-xs transition-all ${
            finView === 'despesas' ? 'bg-surface-container-lowest text-navy-deep shadow-sm font-bold' : 'text-on-surface-variant'
          }`}
        >
          DESPESAS ({expenses.length})
        </button>
      </div>

      {/* CONTENT: RECEITAS, MULTAS OU DESPESAS */}
      {finView === 'receitas' ? (
        <div className="flex flex-col gap-space-sm">
          {/* BANNER REGULAMENTO DOS MENSALISTAS (VENCIMENTO DIA 10) */}
          {(() => {
            const allMensalistas = players.filter(p => p.playerType === 'mensalista');
            const paidMensalistas = allMensalistas.filter(p => p.monthlyPaid && (p.monthlyPaidMonth === currentMonthKey || !p.monthlyPaidMonth));
            const nextMonthDate = new Date();
            nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
            const nextMonthName = nextMonthDate.toLocaleDateString('pt-BR', { month: 'long' });

            return (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-surface-container-lowest border border-emerald-500/40 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[22px]">calendar_month</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-950 font-label-md text-[10px] font-bold uppercase tracking-wider">
                        📅 VENCIMENTO TODO DIA 10
                      </span>
                      <span className="text-[11px] font-bold text-emerald-800">
                        Mês Vigente: {currentMonthName.toUpperCase()}
                      </span>
                    </div>
                    <h4 className="font-headline-sm text-xs sm:text-sm font-bold text-navy-deep mt-0.5">
                      {paidMensalistas.length === allMensalistas.length
                        ? `Todos os ${allMensalistas.length} mensalistas já estão pagos para este mês (${currentMonthName})!`
                        : `${paidMensalistas.length} de ${allMensalistas.length} mensalistas pagos neste mês`}
                    </h4>
                    <p className="text-[11px] text-outline leading-snug">
                      Regra oficial: Para o próximo mês ({nextMonthName}), o prazo para efetuar o pagamento é <strong>até o dia 10/{String(nextMonthDate.getMonth() + 1).padStart(2, '0')}</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleMarkAllMensalistasPaid}
                    disabled={isSyncingMensalistas}
                    className="w-full sm:w-auto min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-surface-container text-emerald-900 border border-emerald-300 font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all shrink-0"
                    title="Confirmar todos os mensalistas como pagos neste mês"
                  >
                    <span className="material-symbols-outlined text-[16px] text-emerald-700">done_all</span>
                    <span>
                      {isSyncingMensalistas
                        ? 'Atualizando...'
                        : mensalistasSyncSuccess
                          ? 'Todos Pagos! ✓'
                          : 'Marcar Mensalistas Pagos'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Subfilter */}
          <div className="flex gap-2">
            {(['todos', 'pendentes', 'pagos'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full font-label-md text-label-md uppercase font-semibold ${
                  filter === f ? 'bg-navy-deep text-on-secondary' : 'bg-surface-container-lowest text-navy-deep hover:bg-surface-container-high'
                }`}
              >
                {f === 'todos' ? 'Todos' : f === 'pendentes' ? 'Pendentes' : 'Pagos'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {filteredPlayers.map(player => {
              const isExempt = checkIsExempt(player);
              const isPaid = isExempt || (player.playerType === 'mensalista' ? player.monthlyPaid : player.paymentStatus === 'pago');
              const amount = isExempt ? 0 : (player.playerType === 'mensalista' ? prices.mensalista : prices.avulso);

              return (
                <div 
                  key={player.id}
                  className="p-space-sm rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-between gap-3 border border-surface-container-high/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-surface-container">
                      <img src={player.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-headline-sm text-headline-sm text-navy-deep break-words">
                        {player.name}
                      </h4>
                      <p className="font-body-sm text-body-sm text-outline break-words">
                        {player.position} • {player.playerType === 'mensalista' ? (
                          <span className="font-semibold text-emerald-800">
                            Mensalista • Mês Pago ✓ (Venc. Dia 10)
                          </span>
                        ) : 'Avulso'}
                      </p>
                      {player.lastReceiptSummary && isPaid && (
                        <p className="text-[11px] text-emerald-700 font-semibold mt-0.5 truncate">
                          ✓ Comprovante: {player.lastReceiptSummary}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-headline-sm text-headline-sm text-navy-deep">
                      {isExempt ? 'ISENTO' : `R$ ${amount},00`}
                    </span>

                    {!isExempt && (
                      <button
                        type="button"
                        onClick={() => setSelectedPlayerForPix(player)}
                        className="px-2.5 py-1 rounded-lg bg-[#32BCAD]/15 hover:bg-[#32BCAD]/25 text-navy-deep border border-[#32BCAD]/30 transition-all active:scale-95 flex items-center gap-1 font-label-md text-[11px] font-bold"
                        title="Abrir QR Code Pix ou enviar comprovante deste atleta"
                      >
                        <PixIcon className="w-3.5 h-3.5" color="#32BCAD" />
                        <span>Pix</span>
                      </button>
                    )}

                    <button
                      onClick={() => !isExempt && togglePaymentStatus(player)}
                      disabled={isExempt || loadingId === player.id}
                      className={`px-2.5 py-1 rounded-full font-label-md text-[11px] font-bold uppercase transition-all ${
                        isPaid ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-error-container text-on-error-container hover:opacity-80'
                      }`}
                    >
                      {isPaid ? 'PAGO' : 'PENDENTE'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : finView === 'comprovantes' ? (
        /* CONTENT: COMPROVANTES ENVIADOS E VALIDADOS AUTOMATICAMENTE */
        <div className="flex flex-col gap-2.5">
          {receipts.length === 0 ? (
            <div className="p-6 rounded-2xl bg-surface-container-lowest border border-surface-container-high/40 text-center flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600 text-[32px]">receipt_long</span>
              <h4 className="font-headline-sm text-sm text-navy-deep font-bold">
                Nenhum Comprovante Enviado Ainda
              </h4>
              <p className="font-body-sm text-xs text-outline max-w-sm">
                Quando os atletas enviarem ou compartilharem o comprovante Pix direto pelo app, a validação automática e a imagem do comprovante aparecerão aqui.
              </p>
            </div>
          ) : (
            receipts.map((rec) => (
              <div
                key={rec.id}
                className="p-3.5 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-emerald-300/60"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-surface-container border border-emerald-300">
                    <img
                      src={rec.playerPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(rec.playerName)}&background=003a75&color=fff`}
                      alt={rec.playerName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-headline-sm text-sm text-navy-deep font-bold">
                        {rec.playerName}
                      </h4>
                      <span className="text-[11px] font-bold text-emerald-700">
                        · Validado Automaticamente ✓
                      </span>
                    </div>
                    <p className="text-xs text-outline mt-0.5">
                      {rec.bankName ? `${rec.bankName} · ` : ''}
                      {rec.receiptDate || new Date(rec.createdAt).toLocaleDateString('pt-BR')}
                      {rec.receiptTime ? ` às ${rec.receiptTime}` : ''}
                      {rec.transactionId ? ` · ID: ${rec.transactionId.slice(0, 12)}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 shrink-0">
                  <span className="font-headline-sm text-sm font-bold text-emerald-700">
                    R$ {Number(rec.extractedAmount || rec.expectedAmount || 0).toFixed(2)}
                  </span>

                  {rec.receiptPreviewUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewReceipt(rec)}
                      className="px-3 py-1.5 rounded-lg bg-navy-deep hover:opacity-95 text-white text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-[15px]">visibility</span>
                      <span>Ver Comprovante</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : finView === 'multas' ? (
        /* CONTENT: MULTAS POR FALTA OU DESISTÊNCIA APÓS AS 18H */
        <div className="flex flex-col gap-2.5">
          {finedPlayers.length === 0 ? (
            <div className="p-6 rounded-2xl bg-surface-container-lowest border border-surface-container-high/40 text-center flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600 text-[32px]">verified</span>
              <h4 className="font-headline-sm text-sm text-navy-deep font-bold">
                Nenhuma Multa Pendente
              </h4>
              <p className="font-body-sm text-xs text-outline max-w-sm">
                Quando a pelada é encerrada, os atletas que colocaram o nome na lista e não compareceram aparecem aqui automaticamente.
              </p>
            </div>
          ) : (
            finedPlayers.map(player => {
              const fineVal = player.fineAmount || prices.multa || 20;
              const reason = player.fineReason || (player.hasNoShowFine ? 'Colocou o nome na lista e não compareceu à pelada (Falta / W.O.)' : 'Retirada de nome após as 18h da véspera');
              return (
                <div
                  key={player.id}
                  className="p-3.5 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-red-300/60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-surface-container border border-red-300">
                      <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-headline-sm text-headline-sm text-navy-deep font-bold">
                          {player.name}
                        </h4>
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold uppercase">
                          🚨 Multa Pendente
                        </span>
                      </div>
                      <p className="text-xs text-red-700 font-medium mt-0.5">
                        {reason}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0 flex-wrap">
                    <span className="font-headline-sm text-sm font-bold text-red-700">
                      R$ {fineVal},00
                    </span>

                    {isUserAdmin && (
                      <>
                        <button
                          onClick={() => handleClearPlayerFine(player, false)}
                          disabled={loadingId === player.id}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold uppercase transition-all active:scale-95"
                          title="Confirmar pagamento da multa"
                        >
                          Receber Multa
                        </button>
                        <button
                          onClick={() => handleClearPlayerFine(player, true)}
                          disabled={loadingId === player.id}
                          className="px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-navy-deep text-[11px] font-bold uppercase transition-all active:scale-95"
                          title="Isentar multa e remover suplência"
                        >
                          Isentar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* CONTENT: DESPESAS */
        <div className="flex flex-col gap-2">
          {expenses.map(expense => (
            <div 
              key={expense.id}
              className="p-space-sm rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-between border border-surface-container-high/40"
            >
              <div>
                <h4 className="font-headline-sm text-headline-sm text-navy-deep">{expense.description}</h4>
                <p className="font-body-sm text-body-sm text-outline">{expense.category}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-headline-sm text-headline-sm text-error">
                  - R$ {expense.amount.toFixed(2)}
                </span>
                {isUserAdmin && (
                  <button 
                    onClick={async () => {
                      if (confirm("Excluir esta despesa?")) {
                        await deleteDoc(doc(db, "expenses", expense.id));
                      }
                    }}
                    className="text-outline hover:text-error p-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: DEFINIR VALORES DE MENSALISTA, AVULSO E MULTA */}
      {isEditingPrices && typeof document !== 'undefined' && createPortal(
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999 }}
          className="bg-navy-deep/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditingPrices(false);
          }}
        >
          <div 
            className="bg-white text-navy-deep rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[88dvh] shadow-2xl flex flex-col gap-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-surface-container-high/50 pb-3 shrink-0">
              <div>
                <h3 className="font-headline-sm text-base text-navy-deep font-bold">
                  DEFINIR VALORES & MULTAS
                </h3>
                <p className="text-xs text-outline">Configuração oficial da Diretoria</p>
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
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md font-bold text-navy-deep"
                />
              </div>

              <div>
                <label className="font-label-md text-xs text-navy-deep font-bold block mb-1">
                  Valor Avulso (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  value={priceForm.avulso}
                  onChange={(e) => setPriceForm({ ...priceForm, avulso: Number(e.target.value) })}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md font-bold text-navy-deep"
                />
              </div>

              <div>
                <label className="font-label-md text-xs text-red-700 font-bold block mb-1">
                  Valor da Multa (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  value={priceForm.multa}
                  onChange={(e) => setPriceForm({ ...priceForm, multa: Number(e.target.value) })}
                  className="w-full h-11 px-3 rounded-xl bg-red-50/60 border border-red-300 outline-none font-body-md font-bold text-red-900"
                />
                <span className="text-[11px] text-outline mt-1 block">
                  Valor cobrado automaticamente nas faltas (sem check-in) e desistências após as 18h.
                </span>
              </div>

              <div className="pt-3 border-t border-surface-container-high/50 flex flex-col gap-2.5">
                <span className="font-label-md text-xs text-emerald-800 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <PixIcon className="w-4 h-4" color="#32BCAD" />
                  <span>Chave Pix Oficial (Cobrança no App)</span>
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
                      Chave Pix Oficial
                    </label>
                    <input
                      type="text"
                      value={pixForm.pixKey}
                      onChange={(e) => setPixForm({ ...pixForm, pixKey: e.target.value })}
                      placeholder="Ex: diiogo49@gmail.com"
                      className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-label-md text-[11px] text-navy-deep font-bold block mb-1">
                    Nome do Recebedor (Titular da Conta)
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

            <div className="flex justify-end gap-2 pt-2 border-t border-surface-container-high/40 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditingPrices(false)}
                className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface font-label-md text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePrices}
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

      {/* MODAL: NOVA DESPESA */}
      {isAddingExpense && typeof document !== 'undefined' && createPortal(
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999 }}
          className="bg-navy-deep/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddingExpense(false);
          }}
        >
          <div 
            className="bg-white text-navy-deep rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-navy-deep">
              LANÇAR DESPESA
            </h3>
            <div className="space-y-2">
              <input 
                type="text" 
                placeholder="Descrição (ex: Aluguel da Quadra)"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                className="w-full p-2.5 rounded-lg bg-surface-container-low border border-surface-container-high outline-none font-body-md"
              />
              <input 
                type="number" 
                placeholder="Valor (R$)"
                value={newExpense.amount || ''}
                onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                className="w-full p-2.5 rounded-lg bg-surface-container-low border border-surface-container-high outline-none font-body-md"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsAddingExpense(false)} className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface font-label-md">
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleCreateExpense} 
                disabled={isSavingExpense}
                className="px-5 py-2 rounded-lg bg-primary-container text-on-primary font-headline-sm"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* MODAL DE VISUALIZAÇÃO DE COMPROVANTE (AUDITORIA DA DIRETORIA) */}
      {previewReceipt && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999 }}
          className="bg-navy-deep/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={() => setPreviewReceipt(null)}
        >
          <div
            className="bg-white text-navy-deep rounded-2xl p-4 sm:p-5 w-full max-w-md max-h-[90dvh] shadow-2xl flex flex-col gap-3 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-surface-container-high/50 pb-2.5 shrink-0">
              <div>
                <h3 className="font-headline-sm text-sm sm:text-base font-bold text-navy-deep">
                  Comprovante de {previewReceipt.playerName}
                </h3>
                <p className="text-xs text-emerald-700 font-semibold">
                  Valor Confirmado: R$ {Number(previewReceipt.extractedAmount || previewReceipt.expectedAmount || 0).toFixed(2)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-2.5 items-center bg-surface-container-low p-2 rounded-xl">
              {previewReceipt.receiptPreviewUrl && (
                <img
                  src={previewReceipt.receiptPreviewUrl}
                  alt="Comprovante Pix"
                  className="max-w-full max-h-[60dvh] object-contain rounded-lg shadow-xs"
                />
              )}
              {previewReceipt.summary && (
                <p className="text-xs text-navy-deep bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl w-full">
                  {previewReceipt.summary}
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL PIX PARA ATLETA SELECIONADO PELA DIRETORIA */}
      {selectedPlayerForPix && (
        <PixPaymentModal
          isOpen={Boolean(selectedPlayerForPix)}
          onClose={() => setSelectedPlayerForPix(null)}
          player={selectedPlayerForPix}
          match={match}
          prices={prices}
          pixConfig={pixConfig}
        />
      )}
    </div>
  );
};

export default Finance;
