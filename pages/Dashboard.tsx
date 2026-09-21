
import React, { useState, useEffect } from 'react';
import { Match, Player, Page, MatchHistory } from '../types.ts';
import { db, doc, updateDoc, deleteDoc, collection, getDocs, writeBatch, query, orderBy, limit, onSnapshot, addDoc } from '../services/firebase.ts';
import { MASTER_ADMIN_EMAIL } from '../constants.tsx';
import { getNotificationStatus, requestNotificationPermission, broadcastNotification } from '../services/notificationService.ts';
import { isLateRemovalTime } from '../utils/timeUtils.ts';

interface DashboardProps {
  match: Match | null;
  players: Player[];
  user: any;
  onPageChange: (page: Page) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ match, players = [], user, onPageChange }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [lineProgress, setLineProgress] = useState(0);
  const [gkProgress, setGkProgress] = useState(0);
  const [showNotifyBanner, setShowNotifyBanner] = useState(false);
  const [history, setHistory] = useState<MatchHistory[]>([]);

  const mainLogoUrl = "https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png";

  const [prices, setPrices] = useState({ mensalista: 60, avulso: 40 });

  useEffect(() => {
    // Verifica se precisa mostrar o banner de notificações
    const status = getNotificationStatus();
    if (status === 'default' || status === 'denied') {
      setShowNotifyBanner(true);
    }

    // Buscar preços
    const unsubPrices = onSnapshot(doc(db, "settings", "finance"), (docSnap) => {
      if (docSnap.exists()) setPrices(docSnap.data() as any);
    });

    // Buscar histórico de partidas
    const fetchHistory = async () => {
      try {
        const q = query(collection(db, "matchHistory"), orderBy("timestamp", "desc"), limit(5));
        const snap = await getDocs(q);
        const historyData = snap.docs.map(d => ({ id: d.id, ...d.data() } as MatchHistory));
        setHistory(historyData);
      } catch (e) {
        console.error("Erro ao buscar histórico:", e);
      }
    };
    fetchHistory();

    return () => unsubPrices();
  }, []);

  const currentPlayer = players.find(p => p.id === user?.uid);
  const isConfirmed = currentPlayer?.status === 'presente';
  const isRefused = currentPlayer?.status === 'ausente';
  const isAdmin = currentPlayer?.role === 'admin' || user?.email === MASTER_ADMIN_EMAIL;
  
  const isPaid = currentPlayer?.playerType === 'mensalista' ? currentPlayer?.monthlyPaid : currentPlayer?.paymentStatus === 'pago';
  const myPrice = currentPlayer?.playerType === 'mensalista' ? prices.mensalista : prices.avulso;

  const confirmedPlayers = players.filter(p => p.status === 'presente');
  const pendingPlayers = players.filter(p => p.status === 'pendente');
  const refusedPlayers = players.filter(p => p.status === 'ausente');
  const fieldSlots = match?.fieldSlots || 30;
  const gkSlots = match?.gkSlots !== undefined ? match.gkSlots : 5;

  // Auto-ajustar partida atual de 4 para 5 vagas se necessário
  useEffect(() => {
    if (match && match.id && (match.gkSlots === undefined || match.gkSlots === 4)) {
      updateDoc(doc(db, "matches", match.id), { gkSlots: 5 }).catch(() => {});
    }
  }, [match?.id, match?.gkSlots]);

  const handleUpdateGkSlots = async (delta: number) => {
    if (!match?.id || !isAdmin) return;
    const newSlots = Math.max(1, gkSlots + delta);
    await updateDoc(doc(db, "matches", match.id), { gkSlots: newSlots }).catch(() => {});
  };

  const confirmedGKs = confirmedPlayers.filter(p => p.position === 'Goleiro').sort((a, b) => {
    const timeA = a.confirmedAt ? new Date(a.confirmedAt).getTime() : new Date(a.createdAt || 0).getTime();
    const timeB = b.confirmedAt ? new Date(b.confirmedAt).getTime() : new Date(b.createdAt || 0).getTime();
    return timeA - timeB;
  });
  
  const confirmedField = confirmedPlayers.filter(p => p.position !== 'Goleiro').sort((a, b) => {
    const timeA = a.confirmedAt ? new Date(a.confirmedAt).getTime() : new Date(a.createdAt || 0).getTime();
    const timeB = b.confirmedAt ? new Date(b.confirmedAt).getTime() : new Date(b.createdAt || 0).getTime();
    return timeA - timeB;
  });

  const isGk = currentPlayer?.position === 'Goleiro';
  const myIndex = isGk 
    ? confirmedGKs.findIndex(p => p.id === user?.uid)
    : confirmedField.findIndex(p => p.id === user?.uid);

  const isInWaitingList = isConfirmed && (
    (isGk && myIndex >= gkSlots) || 
    (!isGk && myIndex >= fieldSlots)
  );

  useEffect(() => {
    if (!match) {
      setLineProgress(0);
      setGkProgress(0);
      return;
    }
    const timer = setTimeout(() => {
      setLineProgress(Math.min(100, (confirmedField.length / fieldSlots) * 100));
      setGkProgress(Math.min(100, (confirmedGKs.length / gkSlots) * 100));
    }, 400);
    return () => clearTimeout(timer);
  }, [confirmedField.length, confirmedGKs.length, fieldSlots, gkSlots, match]);

  const updatePresence = async (newStatus: 'presente' | 'ausente' | 'pendente') => {
    if (!user || isUpdating || !match) return;
    setIsUpdating(true);
    try {
      // Se estiver confirmando, aproveita para pedir permissão de notificação se ainda não tiver
      if (newStatus === 'presente' && getNotificationStatus() === 'default') {
        await requestNotificationPermission(user.uid);
      }

      const updates: any = { status: newStatus };
      
      if (newStatus === 'presente') {
        updates.confirmedAt = new Date().toISOString();
      } else {
        updates.confirmedAt = null;
        
        // REGISTRO DE DESISTÊNCIA TARDIA (Após 18h de Sábado)
        if (isConfirmed && isLateRemovalTime()) {
          await addDoc(collection(db, "lateRemovals"), {
            playerId: user.uid,
            playerName: currentPlayer?.name || "Atleta",
            timestamp: new Date().toISOString(),
            matchId: match.id,
            matchLocation: match.location
          });
          console.log("⚠️ Desistência tardia registrada para:", currentPlayer?.name);
        }
      }

      await updateDoc(doc(db, "players", user.uid), updates);
    } catch (e) { alert("Erro de conexão."); } finally { setIsUpdating(false); }
  };

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission(user?.uid);
    if (granted) setShowNotifyBanner(false);
  };

  const handleSendReminder = async () => {
    if (isUpdating || !match) return;
    if (!confirm(`Deseja enviar um lembrete para os ${pendingPlayers.length} atletas que ainda não confirmaram?`)) return;

    setIsUpdating(true);
    try {
      await broadcastNotification(
        "⏰ LEMBRETE DE JOGO!", 
        `A pelada na ${match.location.toUpperCase()} está chegando! Confirme sua presença agora.`,
        user.uid
      );
      alert("Lembrete enviado com sucesso!");
    } catch (e) {
      alert("Erro ao enviar lembrete.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClearAllMatches = async () => {
    if (isUpdating) return;
    if (!confirm("⚠️ ATENÇÃO: Deseja finalizar o evento atual? Isso apagará a convocação, a arena e resetará a lista de presença para a próxima.")) return;
    
    setIsUpdating(true);
    try {
      const batch = writeBatch(db);

      // 1. Apagar convocações
      const matchesSnap = await getDocs(collection(db, "matches"));
      matchesSnap.docs.forEach(d => batch.delete(d.ref));

      // 2. Apagar arena (sessão)
      batch.delete(doc(db, "sessions", "current"));

      // 3. Resetar jogadores
      players.forEach(p => {
        if (p.status === 'presente') {
          batch.update(doc(db, "players", p.id), { 
            status: 'pendente',
            confirmedAt: null 
          });
        }
      });
      
      await batch.commit();
      alert("Evento finalizado com sucesso!");
    } catch (e) { 
      alert("Erro ao finalizar evento."); 
    } finally { 
      setIsUpdating(false); 
    }
  };

  return (
    <div className="flex flex-col animate-fade-in px-6">
      <header className="py-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-soft-white animate-float border border-slate-100 p-2">
            <img src={mainLogoUrl} className="w-10 h-10 object-contain" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-black text-navy uppercase italic tracking-tighter leading-none">ARENA O&A</h1>
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">ESTÁDIO DIGITAL</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <a 
            href="https://pelada-app.vercel.app/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="lg:hidden w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-soft-white border border-slate-100 text-primary active:scale-95 transition-all"
            title="Site Principal"
          >
            <span className="material-symbols-outlined">language</span>
          </a>
          {isAdmin && !match && (
            <button onClick={() => onPageChange(Page.CreateMatch)} className="w-12 h-12 bg-navy text-white rounded-2xl flex items-center justify-center shadow-elite animate-float">
               <span className="material-symbols-outlined text-3xl">add</span>
            </button>
          )}
        </div>
      </header>

      {showNotifyBanner && (
        <div className="mb-8 animate-slide-up">
          <div className={`${getNotificationStatus() === 'denied' ? 'bg-amber-500' : 'bg-primary'} rounded-[2rem] p-6 flex items-center justify-between shadow-glow-red overflow-hidden relative`}>
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-xl"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center animate-bounce">
                <span className="material-symbols-outlined text-white">
                  {getNotificationStatus() === 'denied' ? 'warning' : 'notifications_active'}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none mb-1">
                  {getNotificationStatus() === 'denied' ? 'NOTIFICAÇÕES BLOQUEADAS' : 'ALERTAS DA ARENA'}
                </p>
                <p className="text-[11px] font-medium text-white/80">
                  {getNotificationStatus() === 'denied' 
                    ? 'Clique para saber como desbloquear' 
                    : 'Ative para saber quem confirmou!'}
                </p>
              </div>
            </div>
            <button 
              onClick={handleEnableNotifications}
              className="bg-white text-navy px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all relative z-10"
            >
              {getNotificationStatus() === 'denied' ? 'AJUDA' : 'ATIVAR'}
            </button>
          </div>
        </div>
      )}

      <main className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start pb-40">
        <div className="lg:col-span-7 space-y-8">
          {match ? (
            <div className="bg-white border border-slate-100 relative overflow-hidden rounded-[3rem] p-10 text-navy shadow-elite min-h-[520px] flex flex-col justify-between">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 opacity-[0.08] pointer-events-none animate-float select-none">
                  <img src={mainLogoUrl} className="w-full h-full object-contain grayscale" />
              </div>

              <div className="relative z-10">
                <div className="flex justify-between items-start mb-8">
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-primary uppercase tracking-[0.4em] block">PRÓXIMA ARENA</span>
                    <h2 className="text-5xl font-condensed italic font-black uppercase tracking-tight text-navy leading-none">{match.location}</h2>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-3">
                      <button 
                        onClick={handleSendReminder} 
                        disabled={isUpdating || pendingPlayers.length === 0}
                        className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 active:bg-navy active:text-white transition-all disabled:opacity-50"
                        title="Enviar Lembrete"
                      >
                        <span className="material-symbols-outlined">notification_important</span>
                      </button>
                      <button onClick={handleClearAllMatches} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 active:bg-primary active:text-white transition-all">
                        <span className="material-symbols-outlined">delete_sweep</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-8">
                  <div className="space-y-3">
                    <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-navy/40 italic">
                      <span>JOGADORES DE LINHA</span>
                      <span className="text-navy">{confirmedField.length} / {fieldSlots}</span>
                    </div>
                    <div className="h-3.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100 p-0.5">
                      <div className="h-full bg-navy shadow-[0_0_15px_rgba(0,81,162,0.3)] transition-all duration-1000 rounded-full" style={{ width: `${lineProgress}%` }}></div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-navy/40 italic">
                      <span>GOLEIROS</span>
                      <div className="flex items-center gap-2">
                        <span className="text-primary font-bold">{confirmedGKs.length} / {gkSlots}</span>
                        {isAdmin && (
                          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 not-italic">
                            <button 
                              onClick={() => handleUpdateGkSlots(-1)}
                              disabled={gkSlots <= 1}
                              className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-white hover:text-navy text-xs font-black transition-all disabled:opacity-30"
                              title="Diminuir vaga de goleiro"
                            >
                              -
                            </button>
                            <button 
                              onClick={() => handleUpdateGkSlots(1)}
                              className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-white hover:text-navy text-xs font-black transition-all"
                              title="Aumentar vaga de goleiro"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="h-3.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100 p-0.5">
                      <div className="h-full bg-primary shadow-[0_0_15px_rgba(227,6,19,0.3)] transition-all duration-1000 rounded-full" style={{ width: `${gkProgress}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative z-10 pt-10">
                <div className="flex items-center gap-10 mb-8 border-t border-slate-100 pt-8">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                       <span className="material-symbols-outlined text-navy text-sm">calendar_today</span>
                     </div>
                     <p className="text-sm font-black italic uppercase">{new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase()}</p>
                   </div>
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                       <span className="material-symbols-outlined text-navy text-sm">schedule</span>
                     </div>
                     <p className="text-sm font-black italic uppercase">{match.time}H</p>
                   </div>
                </div>

                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4">
                    <button 
                      onClick={() => updatePresence(isConfirmed ? 'pendente' : 'presente')}
                      disabled={isUpdating}
                      className={`h-24 rounded-[2.5rem] font-black uppercase text-[13px] tracking-widest shadow-2xl active:scale-95 transition-all flex flex-col items-center justify-center gap-2 ${isConfirmed ? (isInWaitingList ? 'bg-amber-500 text-white shadow-glow-amber' : 'bg-navy text-white shadow-elite') : 'bg-primary text-white shadow-glow-red'}`}
                    >
                      {isUpdating ? <div className="w-8 h-8 border-4 border-current/20 border-t-current rounded-full animate-spin"></div> : (
                        <>
                          <span className="material-symbols-outlined text-3xl">
                            {isConfirmed ? (isInWaitingList ? 'hourglass_top' : 'check_circle') : 'sports_soccer'}
                          </span>
                          <div className="flex flex-col items-center">
                            <span className="leading-none">{isConfirmed ? (isInWaitingList ? 'NA ESPERA' : 'PRESENÇA CONFIRMADA') : 'CONFIRMAR PRESENÇA'}</span>
                            {isConfirmed && <span className="text-[9px] opacity-60 mt-1 font-bold lowercase tracking-normal">Clique para cancelar</span>}
                          </div>
                        </>
                      )}
                    </button>
                  </div>

                  {isAdmin && confirmedPlayers.length >= 4 && (
                    <button 
                      onClick={() => onPageChange(Page.TeamBalancing)}
                      className="w-full h-16 bg-white text-navy border-2 border-slate-100 rounded-[1.75rem] font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3 shadow-soft-white"
                    >
                      <span className="material-symbols-outlined text-lg">shuffle</span>
                      SORTEIO DE TIMES
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-24 flex flex-col items-center justify-center text-center space-y-10 animate-fade-in bg-white border border-slate-100 rounded-[4rem] shadow-soft-white p-12">
               <img src={mainLogoUrl} className="w-32 h-32 object-contain opacity-20 animate-float" />
               <div>
                  <h3 className="text-3xl font-black text-navy uppercase italic tracking-tighter">LISTA FECHADA</h3>
                  <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.4em] mt-4">Aguardando convocação da diretoria</p>
               </div>
               {isAdmin && (
                 <button onClick={() => onPageChange(Page.CreateMatch)} className="h-18 px-12 bg-navy text-white rounded-3xl font-black uppercase text-[11px] tracking-widest shadow-elite active:scale-95 transition-all flex items-center gap-3">
                   <span className="material-symbols-outlined">add_circle</span>
                   ABRIR CONVOCAÇÃO
                 </button>
               )}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-8 mt-12 lg:mt-0">
          <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-xl">workspace_premium</span>
                <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-navy italic">ARTILHARIA ELITE</h3>
              </div>
              <button onClick={() => onPageChange(Page.Ranking)} className="text-[10px] font-black text-primary uppercase border-b border-primary/20 pb-0.5">VER TODOS</button>
            </div>
            
            <div className="space-y-4">
              {players.filter(p => p.goals > 0).sort((a,b) => b.goals - a.goals).slice(0, 5).map((p, i) => {
                const isTop3 = i < 3;
                const rankColors = [
                  'bg-amber-400 text-white shadow-glow-amber', // 1st
                  'bg-slate-300 text-white shadow-soft-white', // 2nd
                  'bg-orange-400 text-white shadow-glow-orange', // 3rd
                ];
                const rankIcons = ['trophy', 'military_tech', 'military_tech'];
                
                return (
                  <div 
                    key={p.id} 
                    className={`bg-white border p-6 rounded-[2.5rem] flex items-center justify-between transition-all group hover:scale-[1.02] ${isTop3 ? 'border-navy/10 shadow-elite' : 'border-slate-100 shadow-soft-white'}`}
                  >
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black italic text-lg shrink-0 ${isTop3 ? rankColors[i] : 'bg-slate-50 text-navy border border-slate-100'}`}>
                        {isTop3 ? (
                          <span className="material-symbols-outlined text-2xl">{rankIcons[i]}</span>
                        ) : (
                          i + 1
                        )}
                      </div>
                      <div className="relative">
                        <img src={p.photoUrl} className={`w-16 h-16 rounded-[1.5rem] object-cover border-2 ${isTop3 ? 'border-navy/10' : 'border-slate-50'}`} />
                        {isTop3 && (
                          <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-lg flex items-center justify-center shadow-lg ${rankColors[i]}`}>
                             <span className="text-[10px] font-black">{i+1}º</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col justify-center">
                        <p className="text-[16px] font-black text-navy uppercase italic leading-none mb-1.5">{p.name}</p>
                        <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{p.position}</p>
                      </div>
                    </div>
                    <div className="flex flex-col justify-center items-end">
                       <p className={`text-4xl font-condensed italic font-black leading-none tracking-tighter ${isTop3 ? 'text-navy' : 'text-primary'}`}>{p.goals}</p>
                       <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">GOLS</p>
                    </div>
                  </div>
                );
              })}
              
              {players.filter(p => p.goals > 0).length === 0 && (
                <div className="py-20 text-center bg-white border border-dashed border-slate-100 rounded-[3rem]">
                   <span className="material-symbols-outlined text-4xl text-slate-100 mb-4">sports_soccer</span>
                   <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">A TEMPORADA AINDA NÃO COMEÇOU</p>
                </div>
              )}
            </div>
          </section>

          {/* Seção de Histórico de Partidas */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 px-2">
              <span className="material-symbols-outlined text-navy text-xl">history</span>
              <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-navy italic">ÚLTIMOS JOGOS</h3>
            </div>

            <div className="space-y-4">
              {history.length > 0 ? history.map((h) => (
                <div key={h.id} className="bg-white border border-slate-100 p-6 rounded-[2.5rem] shadow-soft-white flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 text-center">
                      <p className="text-[11px] font-black text-navy uppercase italic truncate mb-2">{h.teamAName}</p>
                      <span className="text-4xl font-condensed italic font-black text-navy">{h.scoreA}</span>
                    </div>
                    <div className="px-4 flex flex-col items-center">
                      <span className="text-[10px] font-black text-slate-200 uppercase mb-1">X</span>
                      <div className="w-px h-8 bg-slate-100"></div>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-[11px] font-black text-navy uppercase italic truncate mb-2">{h.teamBName}</p>
                      <span className="text-4xl font-condensed italic font-black text-navy">{h.scoreB}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
                      {new Date(h.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {h.winnerId !== 'draw' && (
                      <span className="text-[8px] font-black bg-success/10 text-success px-3 py-1 rounded-full uppercase tracking-widest">
                        VITÓRIA {h.winnerId === 'draw' ? 'EMPATE' : (h.scoreA > h.scoreB ? 'TIME A' : 'TIME B')}
                      </span>
                    )}
                    {h.winnerId === 'draw' && (
                      <span className="text-[8px] font-black bg-slate-100 text-slate-400 px-3 py-1 rounded-full uppercase tracking-widest">
                        EMPATE
                      </span>
                    )}
                  </div>
                </div>
              )) : (
                <div className="py-16 text-center bg-white border border-dashed border-slate-100 rounded-[3rem]">
                   <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">NENHUM JOGO REGISTRADO</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
