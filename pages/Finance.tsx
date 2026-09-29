import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Player, Page, Expense, Match } from '../types.ts';
import { MASTER_ADMIN_EMAIL } from '../constants.tsx';
import { db, doc, updateDoc, setDoc, onSnapshot, collection, addDoc, deleteDoc } from '../services/firebase.ts';

const Finance: React.FC<{ players: Player[], currentUser: any, match: Match | null, onPageChange: (page: Page) => void }> = ({ players, currentUser, match, onPageChange }) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'todos' | 'pendentes' | 'pagos'>('todos');
  const [finView, setFinView] = useState<'receitas' | 'despesas' | 'multas'>('receitas');
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
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [priceForm, setPriceForm] = useState({ mensalista: 60, avulso: 40, multa: 20 });
  const [isSavingPrices, setIsSavingPrices] = useState(false);

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

  const currentPlayer = players.find(p => 
    p.id === currentUser?.uid || 
    (currentUser?.email && p.email && p.email.toLowerCase() === currentUser.email.toLowerCase())
  );
  const isMasterUser = currentUser?.email === MASTER_ADMIN_EMAIL;
  const isUserAdmin = currentPlayer?.role === 'admin' || isMasterUser;

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

    const unsubExpenses = onSnapshot(collection(db, "expenses"), (snapshot) => {
      const expenseList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(expenseList);
      try {
        localStorage.setItem('oa_real_expenses_cache', JSON.stringify(expenseList));
      } catch {}
    });

    return () => {
      unsubPrices();
      unsubExpenses();
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
      alert("Valores de Mensalista, Avulso e Multa atualizados com sucesso!");
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
        updates.monthlyPaid = !player.monthlyPaid;
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

      {/* TABELA DE VALORES DEFINIDOS PELA DIRETORIA */}
      <div className="w-full rounded-2xl bg-surface-container-lowest p-3.5 sm:p-4 shadow-xs border border-surface-container-high/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-label-caps text-[11px] text-navy-deep font-bold uppercase tracking-wider">
            TABELA OFICIAL DE VALORES (DIRETORIA)
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
          </div>
        </div>

        <button
          onClick={() => {
            setPriceForm(prices);
            setIsEditingPrices(true);
          }}
          className="h-9 px-3.5 rounded-xl bg-navy-deep hover:opacity-95 text-white font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">tune</span>
          <span>DEFINIR VALORES</span>
        </button>
      </div>

      {/* TABS: RECEITAS VS MULTAS VS DESPESAS */}
      <div className="flex p-1 bg-surface-container-high/60 rounded-xl gap-1">
        <button
          onClick={() => setFinView('receitas')}
          className={`flex-1 py-2.5 rounded-lg font-headline-sm text-xs sm:text-sm transition-all ${
            finView === 'receitas' ? 'bg-surface-container-lowest text-navy-deep shadow-sm font-bold' : 'text-on-surface-variant'
          }`}
        >
          RECEITAS ({filteredPlayers.length})
        </button>
        <button
          onClick={() => setFinView('multas')}
          className={`flex-1 py-2.5 rounded-lg font-headline-sm text-xs sm:text-sm transition-all flex items-center justify-center gap-1 ${
            finView === 'multas' ? 'bg-red-600 text-white shadow-sm font-bold' : 'text-red-700 hover:bg-red-500/10 font-semibold'
          }`}
        >
          <span>MULTAS ({finedPlayers.length})</span>
        </button>
        <button
          onClick={() => setFinView('despesas')}
          className={`flex-1 py-2.5 rounded-lg font-headline-sm text-xs sm:text-sm transition-all ${
            finView === 'despesas' ? 'bg-surface-container-lowest text-navy-deep shadow-sm font-bold' : 'text-on-surface-variant'
          }`}
        >
          DESPESAS ({expenses.length})
        </button>
      </div>

      {/* CONTENT: RECEITAS, MULTAS OU DESPESAS */}
      {finView === 'receitas' ? (
        <div className="flex flex-col gap-space-sm">
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
                        {player.position} • {player.playerType === 'mensalista' ? 'Mensalista' : 'Avulso'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-headline-sm text-headline-sm text-navy-deep">
                      {isExempt ? 'ISENTO' : `R$ ${amount},00`}
                    </span>

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
    </div>
  );
};

export default Finance;
