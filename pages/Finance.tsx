import React, { useState, useEffect } from 'react';
import { Player, Page, Expense, Match } from '../types.ts';
import { MASTER_ADMIN_EMAIL, MAIN_LOGO_URL } from '../constants.tsx';
import { db, doc, updateDoc, onSnapshot, collection, addDoc, deleteDoc } from '../services/firebase.ts';
import { broadcastNotification } from '../services/notificationService.ts';

const Finance: React.FC<{ players: Player[], currentUser: any, match: Match | null, onPageChange: (page: Page) => void }> = ({ players, currentUser, match, onPageChange }) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [filter, setFilter] = useState<'todos' | 'pendentes' | 'pagos'>('todos');
  const [finView, setFinView] = useState<'receitas' | 'despesas'>('receitas');
  const [prices, setPrices] = useState(() => {
    try {
      const cached = localStorage.getItem('oa_real_finance_cache');
      if (cached) return JSON.parse(cached);
    } catch {}
    return { mensalista: 60, avulso: 40 };
  });
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

  const currentPlayer = players.find(p => p.id === currentUser?.uid);
  const isMasterUser = currentUser?.email === MASTER_ADMIN_EMAIL;
  const isUserAdmin = currentPlayer?.role === 'admin' || isMasterUser;

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

  const activePlayers = players.filter(p => p.status === 'presente');

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
    <div className="flex flex-col w-full max-w-2xl mx-auto px-margin pb-space-xl gap-space-md animate-fade-in">
      {/* HEADER CARD */}
      <div className="relative w-full rounded-2xl bg-surface-container-lowest p-space-md shadow-[0_12px_36px_rgba(0,58,117,0.06)] overflow-hidden border border-surface-container-high/40 transition-all">
        {/* Stadium Aura Decoration */}
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-primary-container/10 blur-2xl pointer-events-none animate-pulse-slow"></div>
        <div className="absolute -left-12 -bottom-12 w-36 h-36 rounded-full bg-secondary/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col gap-space-sm">
          {/* Header Row: Title + Logo Badge */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-tertiary-container/15 text-tertiary-container flex items-center justify-center shrink-0 border border-tertiary-container/30">
                <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse"></span>
                  <span className="font-headline-sm text-headline-sm text-navy-deep font-bold">
                    Cofre & Finanças
                  </span>
                </div>
                <span className="font-body-sm text-body-sm text-outline">
                  Contabilidade O&A • Gestão de Mensalidades e PIX
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
                FINANCEIRO
              </span>
              {isUserAdmin && (
                <button 
                  onClick={() => setIsAddingExpense(true)}
                  className="h-9 px-3 bg-gradient-to-r from-primary-container to-primary-bright text-on-primary rounded-xl font-headline-sm text-headline-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
                >
                  <span className="material-symbols-outlined text-[18px]">add_card</span>
                  <span>DESPESA</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* BALANCE VAULT CARD */}
      <div className="bg-gradient-to-br from-navy-deep to-secondary text-canvas-white rounded-2xl p-space-md shadow-xl flex flex-col justify-between gap-space-md relative overflow-hidden">
        <div>
          <span className="font-label-caps text-label-caps text-on-secondary/70 uppercase tracking-widest block mb-1">
            SALDO DISPONÍVEL EM CAIXA
          </span>
          <h2 className="font-scoreboard-num text-[44px] leading-none text-canvas-white tracking-wide">
            R$ {netBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-canvas-white/10">
          <div className="bg-canvas-white/10 backdrop-blur-md rounded-xl p-3">
            <span className="font-label-md text-label-md text-tertiary-fixed font-bold uppercase block">RECEITAS</span>
            <p className="font-headline-sm text-headline-sm text-canvas-white">
              R$ {totals.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-canvas-white/10 backdrop-blur-md rounded-xl p-3">
            <span className="font-label-md text-label-md text-primary-fixed font-bold uppercase block">DESPESAS</span>
            <p className="font-headline-sm text-headline-sm text-canvas-white">
              R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-canvas-white/80 font-label-md text-label-md">
          <span>Pendente de Cobrança:</span>
          <span className="font-bold text-amber-300">
            R$ {totals.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* TABS: RECEITAS VS DESPESAS */}
      <div className="flex p-1 bg-surface-container-high/60 rounded-xl gap-1">
        <button
          onClick={() => setFinView('receitas')}
          className={`flex-1 py-2.5 rounded-lg font-headline-sm text-headline-sm transition-all ${
            finView === 'receitas' ? 'bg-surface-container-lowest text-navy-deep shadow-sm font-bold' : 'text-on-surface-variant'
          }`}
        >
          RECEITAS ({filteredPlayers.length})
        </button>
        <button
          onClick={() => setFinView('despesas')}
          className={`flex-1 py-2.5 rounded-lg font-headline-sm text-headline-sm transition-all ${
            finView === 'despesas' ? 'bg-surface-container-lowest text-navy-deep shadow-sm font-bold' : 'text-on-surface-variant'
          }`}
        >
          DESPESAS ({expenses.length})
        </button>
      </div>

      {/* CONTENT: RECEITAS */}
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

      {/* MODAL: NOVA DESPESA */}
      {isAddingExpense && (
        <div className="fixed inset-0 bg-navy-deep/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-canvas-white rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4">
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
              <button onClick={() => setIsAddingExpense(false)} className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface font-label-md">
                Cancelar
              </button>
              <button 
                onClick={handleCreateExpense} 
                disabled={isSavingExpense}
                className="px-5 py-2 rounded-lg bg-primary-container text-on-primary font-headline-sm"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;
