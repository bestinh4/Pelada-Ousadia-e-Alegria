
import React, { useState, useEffect } from 'react';
import { Player, Page } from '../types.ts';
import { MatchSession, Team } from '../domain/types.ts';
import { db, doc, setDoc, onSnapshot, deleteDoc } from '../services/firebase.ts';
import { motion, AnimatePresence } from 'motion/react';

interface TeamBalancingProps {
  players: Player[];
  onPageChange: (page: Page) => void;
}

const TeamBalancing: React.FC<TeamBalancingProps> = ({ players, onPageChange }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingArena, setIsSavingArena] = useState(false);
  const [session, setSession] = useState<MatchSession | null>(null);

  const mainLogoUrl = "https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png";
  const confirmedPlayers = players
    .filter(p => p.status === 'presente')
    .sort((a, b) => {
      const timeA = a.confirmedAt ? new Date(a.confirmedAt).getTime() : 0;
      const timeB = b.confirmedAt ? new Date(b.confirmedAt).getTime() : 0;
      return timeA - timeB;
    });

  // Listener para a sessão atual (compartilhada)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "sessions", "current"), (snap) => {
      if (snap.exists()) {
        setSession(snap.data() as MatchSession);
      } else {
        setSession(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setSelectedIds(new Set(confirmedPlayers.map(p => p.id)));
  }, [players]);

  const handleGenerateNormal = async () => {
    const selectedPlayers = players.filter(p => selectedIds.has(p.id));
    if (selectedPlayers.length < 4) return alert("Selecione pelo menos 4 atletas.");
    
    setIsGenerating(true);
    
    // Simulação de embaralhamento para efeito visual
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    // Agrupar por categorias de posição para equilíbrio rigoroso
    const groups = {
      gks: selectedPlayers.filter(p => p.position === 'Goleiro').sort(() => Math.random() - 0.5),
      defenders: selectedPlayers.filter(p => p.position === 'Zagueiro' || p.position === 'Lateral').sort(() => Math.random() - 0.5),
      midfielders: selectedPlayers.filter(p => p.position === 'Volante' || p.position === 'Meia').sort(() => Math.random() - 0.5),
      attackers: selectedPlayers.filter(p => p.position === 'Atacante').sort(() => Math.random() - 0.5)
    };

    const totalFieldPlayers = groups.defenders.length + groups.midfielders.length + groups.attackers.length;

    // 1. Definir número de times
    let numTeams = Math.ceil(totalFieldPlayers / 6);
    if (groups.gks.length > numTeams) numTeams = groups.gks.length;
    if (numTeams < 2 && selectedPlayers.length >= 4) numTeams = 2;
    if (numTeams === 0) numTeams = 1;

    const teams: Team[] = Array.from({ length: numTeams }, (_, i) => ({
      id: `team_${i}_${Date.now()}`,
      name: `ESQUADRÃO ${String.fromCharCode(65 + i)}`,
      playerIds: [],
      hasGoalkeeper: false,
      consecutiveWins: 0,
      totalWins: 0,
      isIncomplete: true
    }));

    // 2. Distribuir Goleiros (1 por time)
    for (let i = 0; i < teams.length; i++) {
      if (groups.gks.length > 0) {
        const gk = groups.gks.pop()!;
        teams[i].playerIds.push(gk.id);
        teams[i].hasGoalkeeper = true;
      }
    }

    // 3. Função auxiliar para distribuir um grupo de jogadores de forma equilibrada
    const distributeGroup = (playerGroup: Player[]) => {
      let teamIdx = 0;
      while (playerGroup.length > 0) {
        const p = playerGroup.pop()!;
        
        // Encontrar o time com menos jogadores de linha que ainda tenha vaga
        // Começamos do teamIdx para rotacionar a distribuição inicial
        let found = false;
        for (let i = 0; i < teams.length; i++) {
          const idx = (teamIdx + i) % teams.length;
          const fieldCount = teams[idx].hasGoalkeeper ? teams[idx].playerIds.length - 1 : teams[idx].playerIds.length;
          
          if (fieldCount < 6) {
            teams[idx].playerIds.push(p.id);
            teamIdx = (idx + 1) % teams.length;
            found = true;
            break;
          }
        }

        // Se por algum motivo bizarro não couber nos times calculados (segurança)
        if (!found) {
          const lastTeam = teams[teams.length - 1];
          lastTeam.playerIds.push(p.id);
        }
      }
    };

    // 4. Distribuir por ordem de importância tática para garantir equilíbrio
    distributeGroup(groups.defenders);
    distributeGroup(groups.attackers);
    distributeGroup(groups.midfielders);

    // Atualizar isIncomplete
    teams.forEach(t => {
      t.isIncomplete = t.playerIds.length < 7;
    });

    const newSession: MatchSession = {
      id: "current",
      status: "waiting",
      teams: teams,
      waitingQueue: teams.map(t => t.id),
      activeMatch: null,
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, "sessions", "current"), newSession);
    } catch (e) {
      alert("Erro ao salvar sorteio compartilhado.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePushToArena = async () => {
    if (!session) return;
    setIsSavingArena(true);
    try {
      const updatedSession = {
        ...session,
        status: "active",
        waitingQueue: session.teams.slice(2).map(t => t.id),
        activeMatch: {
          teamAId: session.teams[0]?.id || null,
          teamBId: session.teams[1]?.id || null,
          scoreA: 0,
          scoreB: 0,
          startedAt: Date.now()
        }
      };

      await setDoc(doc(db, "sessions", "current"), updatedSession);
      onPageChange(Page.ArenaPanel);
    } catch (e) {
      alert("Erro ao iniciar Arena.");
    } finally {
      setIsSavingArena(false);
    }
  };

  return (
    <div className="flex flex-col animate-fade-in px-6 relative min-h-screen">
      <header className="py-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => onPageChange(Page.Dashboard)} className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-navy shadow-soft-white active:scale-90 transition-all">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="space-y-1">
            <h2 className="text-3xl font-black text-navy uppercase italic tracking-tighter leading-none">SORTEIO ELITE</h2>
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">EQUILÍBRIO DE TIMES</p>
          </div>
        </div>
        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-soft-white animate-float border border-slate-100 p-2">
          <img src={mainLogoUrl} className="w-10 h-10 object-contain" />
        </div>
      </header>

      <main className="pb-40">
        <AnimatePresence mode="wait">
          {isGenerating ? (
            <motion.div 
              key="generating"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex flex-col items-center justify-center py-20 space-y-8"
            >
              <div className="relative">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="w-32 h-32 rounded-full border-4 border-dashed border-navy/20"
                />
                <motion.img 
                  src={mainLogoUrl} 
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-20 h-20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
                />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-black text-navy italic uppercase tracking-tighter">EMBARALHANDO...</h3>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] mt-2">Equilibrando os esquadrões</p>
              </div>
            </motion.div>
          ) : !session || session.status === 'finished' ? (
            <motion.div 
              key="selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start"
            >
              <div className="lg:col-span-5 space-y-8">
                <div className="bg-white border border-slate-100 rounded-[3rem] p-10 text-navy relative overflow-hidden shadow-elite min-h-[260px] flex flex-col justify-center">
                   <img src={mainLogoUrl} className="absolute -right-10 -bottom-10 w-48 h-48 opacity-[0.08] rotate-12 grayscale animate-float" />
                   <div className="relative z-10">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-3">BALANÇO DE ESQUADRÕES</p>
                    <h3 className="text-4xl font-condensed italic font-black mb-10 tracking-tight">{selectedIds.size} ATLETAS CONFIRMADOS</h3>
                    <button 
                      onClick={handleGenerateNormal}
                      disabled={isGenerating || selectedIds.size < 4}
                      className="w-full h-18 bg-navy text-white rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-elite flex items-center justify-center gap-4 active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined">shuffle</span>
                      GERAR TIMES AGORA
                    </button>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-4 mt-10 lg:mt-0">
                <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-navy italic px-2">QUEM VAI PRA PELADA?</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3">
                  {confirmedPlayers.map((p, i) => (
                    <motion.div 
                      key={p.id} 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => {
                        const next = new Set(selectedIds);
                        if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                        setSelectedIds(next);
                      }}
                      className={`bg-white border p-4 rounded-3xl flex items-center justify-between cursor-pointer transition-all ${selectedIds.has(p.id) ? 'border-navy shadow-soft-white' : 'border-slate-50 opacity-40 scale-[0.98]'}`}
                    >
                      <div className="flex items-center gap-4">
                        <img src={p.photoUrl} className="w-12 h-12 rounded-2xl object-cover" />
                        <div>
                          <p className="text-[14px] font-black text-navy uppercase italic leading-none mb-1">{p.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{p.position}</p>
                        </div>
                      </div>
                      <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${selectedIds.has(p.id) ? 'bg-navy border-navy text-white shadow-elite' : 'border-slate-100'}`}>
                        {selectedIds.has(p.id) && <span className="material-symbols-outlined text-[14px]">check</span>}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start"
            >
              <div className="lg:col-span-8 space-y-8">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-navy italic">CONFORMAÇÃO DOS TIMES</h3>
                  <button onClick={() => confirm("Deseja refazer o sorteio? Isso apagará o sorteio atual para todos.") && deleteDoc(doc(db, "sessions", "current"))} className="text-[10px] font-black text-primary uppercase border-b-2 border-primary/10 pb-1">REFAZER</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6">
                  {session.teams.map((team, idx) => (
                    <motion.div 
                      key={idx} 
                      initial={{ opacity: 0, y: 30, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: idx * 0.2, type: "spring", stiffness: 100 }}
                      className="bg-white rounded-[3rem] border border-slate-100 shadow-soft-white overflow-hidden"
                    >
                      <div className={`px-10 py-6 flex justify-between items-center ${idx % 2 === 0 ? 'bg-navy' : 'bg-primary'} text-white`}>
                        <h4 className="text-xl font-black uppercase italic tracking-tighter leading-none">{team.name}</h4>
                        <span className="text-[10px] font-black opacity-50 uppercase tracking-widest">SORTEADO</span>
                      </div>
                      <div className="p-10 space-y-6">
                        <div className="grid grid-cols-1 gap-5">
                          {team.playerIds.map((pid, i) => {
                            const p = players.find(x => x.id === pid);
                            const isGK = p?.position === 'Goleiro';
                            return (
                              <motion.div 
                                key={pid}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.2 + 0.3 + (i * 0.1) }}
                              >
                                <PlayerRow pid={pid} players={players} isGK={isGK} />
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-4 mt-10 lg:mt-0">
                {session.status === 'waiting' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (session.teams.length * 0.2) + 0.5 }}
                    className="space-y-4 sticky top-10"
                  >
                    <button 
                      onClick={handlePushToArena}
                      disabled={isSavingArena}
                      className="w-full h-22 bg-navy text-white rounded-[2.5rem] font-black uppercase text-[13px] tracking-widest shadow-elite active:scale-95 transition-all flex items-center justify-center gap-4"
                    >
                      {isSavingArena ? <div className="w-7 h-7 border-3 border-white/20 border-t-white rounded-full animate-spin"></div> : (
                        <>
                          <span className="material-symbols-outlined text-2xl">stadium</span>
                          INICIAR ARENA O&A
                        </>
                      )}
                    </button>
                    
                    <button 
                      onClick={() => {
                        let msg = `⚽ *ESQUADRÕES O&A* 🇭🇷\n\n`;
                        session.teams.forEach(t => {
                          const flds = t.playerIds.map(pid => {
                            const p = players.find(x => x.id === pid);
                            return p?.position === 'Goleiro' ? `🧤 ${p.name}` : p?.name;
                          }).filter(Boolean);
                          msg += `*${t.name.toUpperCase()}*\n🏃: ${flds.join(', ')}\n\n`;
                        });
                        msg += `-------------------------------------------\n`;
                        msg += `⚽ *Acesse o App:* https://pelada-app.vercel.app/\n`;
                        msg += `_Gestão Ousadia & Alegria_`;
                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
                      }}
                      className="w-full h-16 bg-success text-white rounded-[1.75rem] font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
                    >
                      <span className="material-symbols-outlined text-lg">share</span>
                      ENVIAR PARA O WHATSAPP
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

const PlayerRow = ({ pid, players, isGK }: any) => {
  const p = players.find((x: Player) => x.id === pid);
  if (!p) return null;

  const getSimplifiedPosition = (pos: string) => {
    if (pos === 'Goleiro') return 'GOLEIRO 🧤';
    if (pos === 'Zagueiro' || pos === 'Lateral') return 'DEFESA 🛡️';
    if (pos === 'Volante' || pos === 'Meia') return 'MEIO 🎯';
    if (pos === 'Atacante') return 'ATAQUE ⚡';
    return pos;
  };

  return (
    <div className="flex items-center gap-5 animate-fade-in">
      <img src={p.photoUrl} className={`w-14 h-14 rounded-2xl object-cover border-2 ${isGK ? 'border-primary shadow-glow-red' : 'border-slate-50'}`} />
      <div>
        <p className="text-[16px] font-black text-navy uppercase italic leading-none mb-1.5">{p.name}</p>
        <span className={`text-[10px] font-black px-3 py-1 rounded-xl uppercase tracking-widest ${isGK ? 'bg-primary text-white' : 'bg-slate-50 text-slate-400'}`}>
          {getSimplifiedPosition(p.position)}
        </span>
      </div>
    </div>
  );
};

export default TeamBalancing;
