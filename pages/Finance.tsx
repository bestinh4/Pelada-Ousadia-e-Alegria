
import React, { useState, useEffect } from 'react';
import { Player, Page, Expense, Match } from '../types.ts';
import { MASTER_ADMIN_EMAIL } from '../constants.tsx';
import { db, doc, updateDoc, onSnapshot, collection, addDoc, deleteDoc } from '../services/firebase.ts';
import { broadcastNotification } from '../services/notificationService.ts';

const Finance: React.FC<{ players: Player[], currentUser: any, match: Match | null, onPageChange: (page: Page) => void }> = ({ players, currentUser, match, onPageChange }) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [filter, setFilter] = useState<'todos' | 'pendentes' | 'pagos'>('todos');
  const [finView, setFinView] = useState<'receitas' | 'despesas'>('receitas');
  const [prices, setPrices] = useState({ mensalista: 60, avulso: 40 });
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({ description: '', amount: 0, category: 'Outros' });
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  const currentPlayer = players.find(p => p.id === currentUser?.uid);
  const isMasterUser = currentUser?.email === MASTER_ADMIN_EMAIL;
  const isUserAdmin = currentPlayer?.role === 'admin' || isMasterUser;
  const mainLogoUrl = "https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png";

  useEffect(() => {
    const unsubPrices = onSnapshot(doc(db, "settings", "finance"), (docSnap) => {
      if (docSnap.exists()) setPrices(docSnap.data() as any);
    });

    const unsubExpenses = onSnapshot(collection(db, "expenses"), (snapshot) => {
      const expenseList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(expenseList);
    });

    return () => {
      unsubPrices();
      unsubExpenses();
    };
  }, []);

  const activePlayers = players.filter(p => p.status === 'presente');
  
  const fieldSlots = match?.fieldSlots || 30;
  const gkSlots = match?.gkSlots !== undefined ? match.gkSlots : 5;

  const confirmedGKs = activePlayers.filter(p => p.position === 'Goleiro').sort((a, b) => {
    const timeA = a.confirmedAt ? new Date(a.confirmedAt).getTime() : new Date(a.createdAt || 0).getTime();
    const timeB = b.confirmedAt ? new Date(b.confirmedAt).getTime() : new Date(b.createdAt || 0).getTime();
    return timeA - timeB;
  });
  
  const confirmedField = activePlayers.filter(p => p.position !== 'Goleiro').sort((a, b) => {
    const timeA = a.confirmedAt ? new Date(a.confirmedAt).getTime() : new Date(a.createdAt || 0).getTime();
    const timeB = b.confirmedAt ? new Date(b.confirmedAt).getTime() : new Date(b.createdAt || 0).getTime();
    return timeA - timeB;
  });

  const getWaitingInfo = (p: Player) => {
    const isGk = p.position === 'Goleiro';
    const list = isGk ? confirmedGKs : confirmedField;
    const slots = isGk ? gkSlots : fieldSlots;
    const index = list.findIndex(x => x.id === p.id);
    
    if (index >= slots) {
      return { isInWaiting: true, position: index - slots + 1 };
    }
    return { isInWaiting: false, position: 0 };
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

  return (
    <div className="flex flex-col animate-fade-in px-4 sm:px-6">
      <header className="py-8 sm:py-12 flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-black text-navy uppercase italic tracking-tighter leading-none">
            COFRE O&A
          </h2>
          <p className="text-[9px] sm:text-[10px] font-black text-primary uppercase tracking-[0.4em]">
            GESTOR FINANCEIRO
          </p>
        </div>
        <div className="flex gap-2 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-2xl flex items-center justify-center shadow-soft-white animate-float border border-slate-100 p-2">
            <img src={mainLogoUrl} className="w-6 h-6 sm:w-8 sm:h-8 object-contain" />
          </div>
        </div>
      </header>

      <main className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start pb-48">
        <div className="lg:col-span-5 space-y-8 sm:space-y-10">
          <div className="bg-white border border-slate-100 rounded-[2.5rem] sm:rounded-[3rem] p-8 sm:p-10 relative overflow-hidden shadow-elite min-h-[300px] sm:min-h-[350px] flex flex-col justify-between">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 sm:w-72 h-64 sm:h-72 opacity-[0.08] pointer-events-none animate-float">
                <img src={mainLogoUrl} className="w-full h-full object-contain grayscale" />
            </div>

            <div className="relative z-10">
              <span className="text-[9px] sm:text-[11px] font-black text-navy/30 uppercase tracking-[0.4em] block mb-2 sm:mb-4 italic">SALDO EM CAIXA</span>
              <h2 className={`text-4xl sm:text-6xl font-condensed italic font-black tracking-tighter leading-none ${netBalance >= 0 ? 'text-navy' : 'text-primary'}`}>
                R$ {netBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h2>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-4 sm:gap-6 pt-8 sm:pt-10 border-t border-slate-50">
              <div className="space-y-1 sm:space-y-2">
                 <span className="text-[9px] sm:text-[10px] font-black text-success uppercase tracking-widest">RECEITAS</span>
                 <p className="text-xl sm:text-2xl font-condensed italic font-black text-navy">R$ {totals.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="space-y-1 sm:space-y-2">
                 <span className="text-[9px] sm:text-[10px] font-black text-primary uppercase tracking-widest">DESPESAS</span>
                 <p className="text-xl sm:text-2xl font-condensed italic font-black text-navy">R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
            
            <div className="relative z-10 pt-6 flex justify-between items-center">
              <div className="space-y-1">
                 <span className="text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-widest">PENDENTE (A RECEBER)</span>
                 <p className="text-lg sm:text-xl font-condensed italic font-black text-slate-400">R$ {totals.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              {isUserAdmin && (
                <button 
                  onClick={() => setIsAddingExpense(true)}
                  className="w-10 h-10 sm:w-12 h-12 bg-navy text-white rounded-2xl flex items-center justify-center shadow-elite active:scale-90 transition-all"
                  title="Adicionar Despesa"
                >
                  <span className="material-symbols-outlined">add_card</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex bg-white border border-slate-100 p-1.5 sm:p-2 rounded-full shadow-soft-white">
            {(['receitas', 'despesas'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFinView(v)}
                className={`flex-1 py-3 sm:py-4 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] transition-all ${finView === v ? 'bg-navy text-white shadow-elite' : 'text-slate-300 hover:text-navy/60'}`}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 mt-8 sm:mt-10 lg:mt-0">
          {finView === 'receitas' ? (
            <div className="space-y-4 sm:space-y-6">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-full flex-1">
                  {(['todos', 'pendentes', 'pagos'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`flex-1 py-2 sm:py-3 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-[0.1em] transition-all ${filter === f ? 'bg-white text-navy shadow-sm' : 'text-slate-400 hover:text-navy/60'}`}
                    >
                      {f === 'todos' ? 'GERAL' : f === 'pendentes' ? 'DÉBITO' : 'QUITADO'}
                    </button>
                  ))}
                </div>
                
                {isUserAdmin && totals.pending > 0 && (
                  <button 
                    onClick={async () => {
                      if (confirm(`Deseja enviar um lembrete para os atletas com pagamentos pendentes?`)) {
                        setIsSendingReminder(true);
                        try {
                          await broadcastNotification(
                            "💰 COFRE O&A: LEMBRETE", 
                            "Olá, craque! Notamos que seu pagamento da pelada ainda não caiu. Fortalece o nosso cofre para mantermos a arena nota 10! 🙏⚽",
                            currentUser.uid
                          );
                          alert("Lembrete enviado com sucesso!");
                        } catch (e) {
                          alert("Erro ao enviar lembrete.");
                        } finally {
                          setIsSendingReminder(false);
                        }
                      }
                    }}
                    disabled={isSendingReminder}
                    className="h-10 sm:h-12 px-6 bg-navy text-white rounded-2xl flex items-center justify-center gap-2 shadow-elite active:scale-95 transition-all text-[9px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">campaign</span>
                    COBRAR PENDENTES
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:gap-4">
                {filteredPlayers.map((p) => {
                  const isExempt = checkIsExempt(p);
                  const isPaid = isExempt || (p.playerType === 'mensalista' ? p.monthlyPaid : p.paymentStatus === 'pago');
                  const waitingInfo = getWaitingInfo(p);
                  const playerPrice = p.playerType === 'mensalista' ? prices.mensalista : prices.avulso;
                  
                  return (
                    <div key={p.id} className={`bg-white border rounded-[2rem] sm:rounded-[2.5rem] p-4 sm:p-6 flex items-center justify-between shadow-soft-white group transition-all ${!isPaid ? 'border-primary/20 bg-primary/[0.02]' : 'border-slate-100 hover:border-navy/20'}`}>
                      <div className="flex items-center gap-3 sm:gap-5">
                        <div className="relative">
                          <img src={p.photoUrl} className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl object-cover border ${!isPaid ? 'border-primary/30' : 'border-slate-50'}`} alt="" />
                          <div className={`absolute -bottom-1 -right-1 w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 border-white flex items-center justify-center shadow-md ${isPaid ? 'bg-success' : 'bg-primary animate-pulse'}`}>
                             <span className="material-symbols-outlined text-white text-[10px] sm:text-[14px] font-black">{isPaid ? 'check' : 'priority_high'}</span>
                          </div>
                        </div>
                        <div className="space-y-0.5 sm:space-y-1">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <h4 className="text-sm sm:text-[16px] font-black text-navy uppercase italic leading-none">{p.name}</h4>
                            {waitingInfo.isInWaiting && (
                              <span className="bg-amber-500 text-white text-[7px] sm:text-[8px] font-black px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg uppercase tracking-widest animate-bounce">
                                #{waitingInfo.position}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 sm:gap-2">
                             <p className="text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-widest">{isExempt ? (p.position === 'Goleiro' ? 'GOLEIRO' : 'DIRETORIA') : p.playerType.toUpperCase()}</p>
                             {isExempt && <span className="text-[8px] sm:text-[9px] font-black text-primary uppercase">ISENTO</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:gap-6">
                        {!isPaid && !isExempt && (
                          <div className="text-right">
                            <p className="text-lg sm:text-2xl font-condensed italic font-black text-primary leading-none">R$ {playerPrice}</p>
                            <p className="text-[7px] sm:text-[8px] font-black text-primary/40 uppercase tracking-widest">PENDENTE</p>
                          </div>
                        )}
                        
                        {isUserAdmin && !isExempt && (
                          <button 
                            onClick={async () => {
                              setLoadingId(p.id);
                              const pRef = doc(db, "players", p.id);
                              if (p.playerType === 'mensalista') await updateDoc(pRef, { monthlyPaid: !p.monthlyPaid });
                              else await updateDoc(pRef, { paymentStatus: p.paymentStatus === 'pago' ? 'pendente' : 'pago' });
                              setLoadingId(null);
                            }}
                            className={`h-10 sm:h-12 px-4 sm:px-6 rounded-xl sm:rounded-2xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${isPaid ? 'bg-slate-50 text-slate-400 border border-slate-100' : 'bg-primary text-white shadow-glow-red active:scale-95'}`}
                          >
                            {loadingId === p.id ? '...' : (isPaid ? 'REVERTER' : 'QUITAR')}
                          </button>
                        )}
                        
                        {isExempt && (
                           <div className="h-10 sm:h-12 px-4 sm:px-6 flex items-center text-[8px] sm:text-[10px] font-black text-slate-200 uppercase tracking-widest">
                              LIBERADO
                           </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:gap-6">
              {expenses.length > 0 ? expenses.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((e) => (
                <div key={e.id} className="bg-white border border-slate-100 rounded-[2rem] sm:rounded-[2.5rem] p-4 sm:p-6 flex items-center justify-between shadow-soft-white group hover:border-navy/20 transition-all">
                  <div className="flex items-center gap-3 sm:gap-5">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-slate-50 flex items-center justify-center text-navy border border-slate-100">
                      <span className="material-symbols-outlined text-xl sm:text-2xl">receipt_long</span>
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-[15px] font-black text-navy uppercase italic leading-none mb-1 sm:mb-1.5">{e.description}</h4>
                      <p className="text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-widest">{e.category} • {new Date(e.date).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4">
                    <p className="text-lg sm:text-xl font-condensed italic font-black text-primary leading-none">R$ {e.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    {isUserAdmin && (
                      <button 
                        onClick={async () => {
                          if (confirm("Excluir este gasto?")) {
                            await deleteDoc(doc(db, "expenses", e.id));
                          }
                        }}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-50 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <span className="material-symbols-outlined text-xs sm:text-sm">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              )) : (
                <div className="py-16 sm:py-20 text-center bg-slate-50 border border-dashed border-slate-100 rounded-[2.5rem] sm:rounded-[3rem]">
                  <p className="text-[9px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Nenhuma despesa registrada</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {isAddingExpense && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-md z-[2000] flex items-center justify-center p-6">
           <div className="w-full max-w-[400px] bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-slide-up">
              <div className="p-8 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                       <span className="material-symbols-outlined text-2xl">add_card</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-navy uppercase italic tracking-tighter leading-none">NOVO GASTO</h3>
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">REGISTRO DE SAÍDA</p>
                    </div>
                 </div>
                 <button onClick={() => setIsAddingExpense(false)} className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-300 active:scale-90">
                    <span className="material-symbols-outlined">close</span>
                 </button>
              </div>
              
              <div className="p-8 space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-1">DESCRIÇÃO</label>
                    <input 
                      type="text" 
                      value={newExpense.description} 
                      onChange={e => setNewExpense({...newExpense, description: e.target.value})} 
                      placeholder="Ex: Aluguel da Quadra"
                      className="w-full h-16 bg-slate-50 rounded-2xl border border-slate-100 px-6 font-black text-navy outline-none focus:border-primary" 
                    />
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-1">VALOR (R$)</label>
                    <input 
                      type="number" 
                      value={newExpense.amount} 
                      onChange={e => setNewExpense({...newExpense, amount: Number(e.target.value)})} 
                      className="w-full h-16 bg-slate-50 rounded-2xl border border-slate-100 px-6 font-black text-navy text-2xl outline-none focus:border-primary" 
                    />
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-1">CATEGORIA</label>
                    <select 
                      value={newExpense.category} 
                      onChange={e => setNewExpense({...newExpense, category: e.target.value})} 
                      className="w-full h-16 bg-slate-50 rounded-2xl border border-slate-100 px-6 font-black text-navy outline-none focus:border-primary"
                    >
                      <option value="Quadra">Quadra</option>
                      <option value="Equipamento">Equipamento</option>
                      <option value="Evento">Evento</option>
                      <option value="Outros">Outros</option>
                    </select>
                 </div>

                 <button 
                  onClick={async () => {
                    if (!newExpense.description || newExpense.amount <= 0) return alert("Preencha os dados corretamente.");
                    setIsSavingExpense(true);
                    try {
                      await addDoc(collection(db, "expenses"), {
                        ...newExpense,
                        date: new Date().toISOString()
                      });
                      setIsAddingExpense(false);
                      setNewExpense({ description: '', amount: 0, category: 'Outros' });
                    } catch (e) {
                      alert("Erro ao salvar gasto.");
                    } finally {
                      setIsSavingExpense(false);
                    }
                  }}
                  disabled={isSavingExpense}
                  className="w-full h-20 bg-navy text-white rounded-[2rem] font-black uppercase text-[12px] tracking-[0.2em] shadow-elite active:scale-95 transition-all mt-4"
                 >
                    {isSavingExpense ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto"></div> : "REGISTRAR GASTO"}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Finance;
