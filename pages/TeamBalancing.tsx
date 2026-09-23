import React, { useState, useEffect } from 'react';
import { Player, Page } from '../types.ts';
import { MatchSession, Team } from '../domain/types.ts';
import { db, doc, setDoc, onSnapshot, deleteDoc, updateDoc } from '../services/firebase.ts';
import { motion, AnimatePresence } from 'motion/react';
import { MASTER_ADMIN_EMAIL, MAIN_LOGO_URL } from '../constants.tsx';
import { broadcastNotification } from '../services/notificationService.ts';
import { playSound } from '../utils/sound.ts';

interface TeamBalancingProps {
  players: Player[];
  user?: any;
  currentUserRole?: 'admin' | 'player';
  onPageChange: (page: Page) => void;
}

const TEAM_THEMES = [
  { id: 0, name: 'TIME 1', headerBg: 'bg-blue-700', badgeBg: 'bg-blue-100 text-blue-800', dot: '🔵' },
  { id: 1, name: 'TIME 2', headerBg: 'bg-red-700', badgeBg: 'bg-red-100 text-red-800', dot: '🔴' },
  { id: 2, name: 'TIME 3', headerBg: 'bg-slate-800', badgeBg: 'bg-slate-100 text-slate-800', dot: '⚽' },
  { id: 3, name: 'TIME 4', headerBg: 'bg-navy-deep', badgeBg: 'bg-blue-100 text-navy-deep', dot: '⚽' },
];

const TeamBalancing: React.FC<TeamBalancingProps> = ({ 
  players = [], 
  user, 
  currentUserRole, 
  onPageChange 
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [session, setSession] = useState<MatchSession | null>(null);

  // Modais administrativos
  const [isRemanageModalOpen, setIsRemanageModalOpen] = useState(false);
  const [isAddPlayerModalOpen, setIsAddPlayerModalOpen] = useState(false);
  const [targetTeamForAdd, setTargetTeamForAdd] = useState<string | null>(null);

  // Estados de troca / remanejamento
  const [selectedPlayerToMove, setSelectedPlayerToMove] = useState<{ teamId: string; playerId: string } | null>(null);
  const [targetTeamId, setTargetTeamId] = useState<string>('');
  const [swapWithPlayerId, setSwapWithPlayerId] = useState<string>('');
  const [isMovingAthlete, setIsMovingAthlete] = useState(false);
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  const isMaster = user?.email === MASTER_ADMIN_EMAIL;
  const isAdm = currentUserRole === 'admin' || isMaster;

  const confirmedPlayers = players
    .filter(p => p.status === 'presente')
    .sort((a, b) => {
      const timeA = a.confirmedAt ? new Date(a.confirmedAt).getTime() : 0;
      const timeB = b.confirmedAt ? new Date(b.confirmedAt).getTime() : 0;
      return timeA - timeB;
    });

  // Listener em tempo real da sessão de times
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

  // Inicializar atletas confirmados na seleção
  useEffect(() => {
    if (confirmedPlayers.length > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set(confirmedPlayers.map(p => p.id)));
    }
  }, [players]);

  // Executar o sorteio oficial das equipes (6 jogadores de linha + 1 goleiro por time)
  const handleGenerateOfficialTeams = async () => {
    if (!isAdm) return;
    const selectedPlayers = players.filter(p => selectedIds.has(p.id));
    if (selectedPlayers.length < 4) {
      return alert("Selecione pelo menos 4 atletas para realizar o sorteio.");
    }

    setIsGenerating(true);
    playSound('cheer');

    // Animação visual de sorteio
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 1. Separar goleiros e jogadores de linha
    const gks = selectedPlayers.filter(p => p.position === 'Goleiro').sort(() => Math.random() - 0.5);
    const defenders = selectedPlayers.filter(p => p.position === 'Zagueiro' || p.position === 'Lateral').sort(() => Math.random() - 0.5);
    const midfielders = selectedPlayers.filter(p => p.position === 'Volante' || p.position === 'Meia' || p.position === 'Meia-atacante').sort(() => Math.random() - 0.5);
    const attackers = selectedPlayers.filter(p => p.position === 'Atacante').sort(() => Math.random() - 0.5);

    const numTeams = 4;
    const teams: Team[] = Array.from({ length: numTeams }, (_, i) => {
      const theme = TEAM_THEMES[i] || { name: `TIME ${i + 1}`, defaultColor: '' };
      return {
        id: `team_${i + 1}_${Date.now()}`,
        name: `${theme.name} (${theme.defaultColor})`,
        playerIds: [],
        hasGoalkeeper: false,
        consecutiveWins: 0,
        totalWins: 0,
        isIncomplete: false
      };
    });

    const reservePlayerIds: string[] = [];

    // 2. Distribuir exatamente 1 Goleiro para cada time (meta: 4 times = 4 goleiros)
    for (let i = 0; i < numTeams; i++) {
      if (gks.length > 0) {
        const gk = gks.pop()!;
        teams[i].playerIds.push(gk.id);
        teams[i].hasGoalkeeper = true;
      }
    }
    // Goleiros excedentes (se houver mais de 4) vão para os reservas/suplentes
    while (gks.length > 0) {
      reservePlayerIds.push(gks.pop()!.id);
    }

    // 3. Distribuir exatamente 6 Jogadores de Linha para cada time (meta: 4 times x 6 = 24 de linha)
    const teamFieldCounts = [0, 0, 0, 0];
    let nextTeamIndex = 0;

    const assignFieldPlayer = (p: Player) => {
      // Verifica se todas as equipes já têm 6 jogadores de linha
      const openTeamIndices = [0, 1, 2, 3].filter(idx => teamFieldCounts[idx] < 6);
      if (openTeamIndices.length === 0) {
        // Todas as 4 equipes já estão completas com 6 de linha (total 24 de linha)
        reservePlayerIds.push(p.id);
        return;
      }

      // Distribui de forma equilibrada/circular
      let attempts = 0;
      while (attempts < numTeams) {
        const targetIdx = (nextTeamIndex + attempts) % numTeams;
        if (teamFieldCounts[targetIdx] < 6) {
          teams[targetIdx].playerIds.push(p.id);
          teamFieldCounts[targetIdx]++;
          nextTeamIndex = (targetIdx + 1) % numTeams;
          return;
        }
        attempts++;
      }

      // Caso não caiba
      reservePlayerIds.push(p.id);
    };

    // Intercalamos zaga, meio e ataque para garantir equilíbrio tático
    while (defenders.length > 0 || midfielders.length > 0 || attackers.length > 0) {
      if (defenders.length > 0) assignFieldPlayer(defenders.pop()!);
      if (midfielders.length > 0) assignFieldPlayer(midfielders.pop()!);
      if (attackers.length > 0) assignFieldPlayer(attackers.pop()!);
    }

    // Atualizar status de cada time
    teams.forEach(t => {
      const teamGKs = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position === 'Goleiro');
      const teamField = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position !== 'Goleiro');
      t.hasGoalkeeper = teamGKs.length > 0;
      t.isIncomplete = teamField.length < 6 || teamGKs.length < 1;
    });

    const newSession: MatchSession = {
      id: "current",
      status: "waiting",
      teams: teams,
      waitingQueue: teams.slice(2).map(t => t.id),
      activeMatch: {
        teamAId: teams[0]?.id || null,
        teamBId: teams[1]?.id || null,
        scoreA: 0,
        scoreB: 0,
        startedAt: null
      },
      createdAt: Date.now(),
      drawDate: new Date().toISOString(),
      courtPresence: {},
      reserves: reservePlayerIds
    };

    try {
      await setDoc(doc(db, "sessions", "current"), newSession);
      playSound('cheer');

      // Notificar todos os participantes
      try {
        await broadcastNotification(
          "⚽ EQUIPES SORTEADAS!",
          "A Diretoria realizou o sorteio oficial das equipes (1 Goleiro + 6 de Linha em cada time)! Veja a escalação no App.",
          user?.uid
        );
      } catch {}

      alert("Sorteio oficial realizado com sucesso: 1 Goleiro e 6 de Linha por time!");
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar o sorteio.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Alternar presença física na quadra (Check-in)
  const handleToggleCourtPresence = async (playerId: string) => {
    if (!session) return;
    const currentStatus = !!session.courtPresence?.[playerId];
    try {
      await updateDoc(doc(db, "sessions", "current"), {
        [`courtPresence.${playerId}`]: !currentStatus
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Mover atleta diretamente para outro time
  const handleQuickMovePlayerToTeam = async (playerId: string, currentTeamId: string, destTeamId: string) => {
    if (!session || !isAdm || currentTeamId === destTeamId) return;

    const movingPlayer = players.find(p => p.id === playerId);
    const destTeam = session.teams.find(t => t.id === destTeamId);

    if (destTeam && movingPlayer) {
      const isGK = movingPlayer.position === 'Goleiro';
      const destGKs = destTeam.playerIds.filter(id => players.find(p => p.id === id)?.position === 'Goleiro');
      const destLines = destTeam.playerIds.filter(id => players.find(p => p.id === id)?.position !== 'Goleiro');

      if (isGK && destGKs.length >= 1) {
        if (!confirm(`O ${destTeam.name} já possui 1 goleiro (${destGKs.length}/1). Deseja transferir mesmo assim?`)) {
          return;
        }
      } else if (!isGK && destLines.length >= 6) {
        if (!confirm(`O ${destTeam.name} já possui 6 jogadores de linha (${destLines.length}/6). Deseja transferir mesmo assim?`)) {
          return;
        }
      }
    }

    try {
      const updatedTeams = session.teams.map(t => {
        if (t.id === currentTeamId) {
          return { ...t, playerIds: t.playerIds.filter(id => id !== playerId) };
        }
        if (t.id === destTeamId) {
          return { ...t, playerIds: [...t.playerIds, playerId] };
        }
        return t;
      });

      // Recalcular flags
      updatedTeams.forEach(t => {
        const teamGKs = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position === 'Goleiro');
        const teamField = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position !== 'Goleiro');
        t.hasGoalkeeper = teamGKs.length > 0;
        t.isIncomplete = teamField.length < 6 || teamGKs.length < 1;
      });

      await updateDoc(doc(db, "sessions", "current"), { teams: updatedTeams });
    } catch (e) {
      alert("Erro ao mover atleta de time.");
    }
  };

  // Remover atleta de um time (desfalque / transferir para suplentes)
  const handleRemovePlayerFromTeam = async (playerId: string, teamId: string) => {
    if (!session || !isAdm) return;
    const pName = players.find(p => p.id === playerId)?.name || 'o atleta';
    if (!confirm(`Deseja retirar ${pName} deste time? (Ele ficará como atleta disponível/reserva)`)) return;

    try {
      const updatedTeams = session.teams.map(t => {
        if (t.id === teamId) {
          return { ...t, playerIds: t.playerIds.filter(id => id !== playerId) };
        }
        return t;
      });

      const updatedReserves = session.reserves ? [...session.reserves, playerId] : [playerId];

      updatedTeams.forEach(t => {
        const teamGKs = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position === 'Goleiro');
        const teamField = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position !== 'Goleiro');
        t.hasGoalkeeper = teamGKs.length > 0;
        t.isIncomplete = teamField.length < 6 || teamGKs.length < 1;
      });

      await updateDoc(doc(db, "sessions", "current"), { 
        teams: updatedTeams,
        reserves: Array.from(new Set(updatedReserves))
      });
    } catch (e) {
      alert("Erro ao remover atleta.");
    }
  };

  // Adicionar atleta avulso ou reserva diretamente a um time
  const handleAddPlayerToTeam = async (playerId: string) => {
    if (!session || !isAdm || !targetTeamForAdd) return;

    const movingPlayer = players.find(p => p.id === playerId);
    const targetTeam = session.teams.find(t => t.id === targetTeamForAdd);

    if (targetTeam && movingPlayer) {
      const isGK = movingPlayer.position === 'Goleiro';
      const teamGKs = targetTeam.playerIds.filter(id => players.find(p => p.id === id)?.position === 'Goleiro');
      const teamLines = targetTeam.playerIds.filter(id => players.find(p => p.id === id)?.position !== 'Goleiro');

      if (isGK && teamGKs.length >= 1) {
        if (!confirm(`O ${targetTeam.name} já tem 1 goleiro. Deseja adicionar mesmo assim?`)) return;
      } else if (!isGK && teamLines.length >= 6) {
        if (!confirm(`O ${targetTeam.name} já atingiu a cota oficial de 6 jogadores de linha (${teamLines.length}/6). Deseja adicionar mais um?`)) return;
      }
    }

    try {
      const updatedTeams = session.teams.map(t => {
        if (t.id === targetTeamForAdd) {
          if (t.playerIds.includes(playerId)) return t;
          return { ...t, playerIds: [...t.playerIds, playerId] };
        }
        return t;
      });

      const updatedReserves = (session.reserves || []).filter(id => id !== playerId);

      updatedTeams.forEach(t => {
        const tGKs = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position === 'Goleiro');
        const tField = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position !== 'Goleiro');
        t.hasGoalkeeper = tGKs.length > 0;
        t.isIncomplete = tField.length < 6 || tGKs.length < 1;
      });

      await updateDoc(doc(db, "sessions", "current"), { 
        teams: updatedTeams,
        reserves: updatedReserves
      });
      setIsAddPlayerModalOpen(false);
      setTargetTeamForAdd(null);
    } catch (e) {
      alert("Erro ao adicionar atleta ao time.");
    }
  };

  // Executar troca mútua de atletas ou remanejamento por modal
  const handleExecuteRemanage = async () => {
    if (!session || !selectedPlayerToMove || !targetTeamId) return;
    setIsMovingAthlete(true);

    try {
      let updatedTeams = [...session.teams];

      if (swapWithPlayerId) {
        // Troca mútua 1x1
        updatedTeams = updatedTeams.map(t => {
          if (t.id === selectedPlayerToMove.teamId) {
            return {
              ...t,
              playerIds: t.playerIds.map(id => id === selectedPlayerToMove.playerId ? swapWithPlayerId : id)
            };
          }
          if (t.id === targetTeamId) {
            return {
              ...t,
              playerIds: t.playerIds.map(id => id === swapWithPlayerId ? selectedPlayerToMove.playerId : id)
            };
          }
          return t;
        });
      } else {
        // Transferência direta
        updatedTeams = updatedTeams.map(t => {
          if (t.id === selectedPlayerToMove.teamId) {
            return {
              ...t,
              playerIds: t.playerIds.filter(id => id !== selectedPlayerToMove.playerId)
            };
          }
          if (t.id === targetTeamId) {
            return {
              ...t,
              playerIds: [...t.playerIds, selectedPlayerToMove.playerId]
            };
          }
          return t;
        });
      }

      updatedTeams.forEach(t => {
        const teamGKs = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position === 'Goleiro');
        const teamField = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position !== 'Goleiro');
        t.hasGoalkeeper = teamGKs.length > 0;
        t.isIncomplete = teamField.length < 6 || teamGKs.length < 1;
      });

      await updateDoc(doc(db, "sessions", "current"), { teams: updatedTeams });

      setIsRemanageModalOpen(false);
      setSelectedPlayerToMove(null);
      setTargetTeamId('');
      setSwapWithPlayerId('');
      alert("Atletas remanejados com sucesso!");
    } catch (e) {
      alert("Erro ao remanejar atletas.");
    } finally {
      setIsMovingAthlete(false);
    }
  };

  // Resetar e refazer sorteio
  const handleResetDraw = async () => {
    if (!isAdm) return;
    if (!confirm("⚠️ ATENÇÃO: Deseja apagar a escalação atual e refazer o sorteio das equipes para todos os atletas?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "sessions", "current"));
      setSelectedIds(new Set(confirmedPlayers.map(p => p.id)));
      alert("Escalação resetada. Você já pode sortear novamente!");
    } catch (e) {
      alert("Erro ao resetar o sorteio.");
    }
  };

  // Compartilhar escalação no WhatsApp
  const handleShareToWhatsApp = () => {
    if (!session || session.teams.length === 0) return;

    let text = `⚽ *ESCALAÇÃO OFICIAL DAS EQUIPES • O&A* 🇭🇷\n`;
    text += `_Regra Oficial: 1 Goleiro + 6 Jogadores de Linha por Time_\n\n`;
    text += `📌 *PARTIDA 1 (Abertura):* ${session.teams[0]?.name || 'Time 1'} 🆚 ${session.teams[1]?.name || 'Time 2'}\n`;
    text += `⏳ *Na Espera:* ${session.teams[2]?.name || 'Time 3'} e ${session.teams[3]?.name || 'Time 4'}\n`;
    text += `⚠️ *Regra de Pontualidade:* Caso um time da partida 1 esteja desfalcado na quadra, o próximo assume imediatamente!\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;

    session.teams.forEach((team) => {
      const gks = team.playerIds
        .map(pid => players.find(p => p.id === pid))
        .filter(p => p?.position === 'Goleiro')
        .map(p => p?.name);
      
      const lines = team.playerIds
        .map(pid => players.find(p => p.id === pid))
        .filter(p => p && p.position !== 'Goleiro')
        .map(p => p?.name);

      text += `*${team.name.toUpperCase()}* (${team.playerIds.length}/7 Atletas)\n`;
      text += `🧤 *Goleiro (1):* ${gks.length > 0 ? gks.join(', ') : 'A definir'}\n`;
      text += `🏃 *Linha (${lines.length}/6):* ${lines.length > 0 ? lines.join(', ') : 'A definir'}\n\n`;
    });

    if (session.reserves && session.reserves.length > 0) {
      const reserveNames = session.reserves
        .map(pid => players.find(p => p.id === pid))
        .filter(Boolean)
        .map(p => `${p?.name} (${p?.position === 'Goleiro' ? 'GK' : p?.position})`);
      
      if (reserveNames.length > 0) {
        text += `━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `⏳ *SUPLENTES / RESERVAS (${reserveNames.length}):*\n`;
        text += `${reserveNames.join(', ')}\n\n`;
      }
    }

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📱 Acompanhe as equipes no App Oficial:\n`;
    text += `https://pelada-app.vercel.app/\n\n`;
    text += `_Diretoria Ousadia & Alegria_`;

    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 3000);

    const zapUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(zapUrl, '_blank');
  };

  // Lista de atletas que NÃO estão em nenhum time sorteado ainda
  const allAssignedPlayerIds = new Set(session?.teams.flatMap(t => t.playerIds) || []);
  const availablePlayersToAdd = players.filter(p => !allAssignedPlayerIds.has(p.id));
  const reserveAthletes = (session?.reserves || [])
    .map(id => players.find(p => p.id === id))
    .filter(Boolean) as Player[];

  return (
    <div className="flex flex-col w-full max-w-5xl mx-auto px-margin pb-space-xl gap-space-md animate-fade-in">
      {/* BANNER PRINCIPAL */}
      <div className="relative w-full rounded-2xl bg-surface-container-lowest p-space-md shadow-[0_12px_36px_rgba(0,58,117,0.06)] overflow-hidden border border-surface-container-high/40 transition-all">
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-primary-container/10 blur-2xl pointer-events-none animate-pulse-slow"></div>
        <div className="absolute -left-12 -bottom-12 w-36 h-36 rounded-full bg-secondary/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col gap-space-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary-container/10 text-primary-container flex items-center justify-center shrink-0 border border-primary-container/20">
                <span className="material-symbols-outlined text-[24px]">groups</span>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-container animate-ping shrink-0"></span>
                  <span className="font-headline-sm text-headline-sm text-navy-deep font-bold truncate">
                    {session && session.teams.length > 0 ? 'Equipes Sorteadas • O&A' : 'Sorteio das Equipes'}
                  </span>
                </div>
                <span className="font-body-sm text-body-sm text-outline truncate">
                  Padrão Oficial: 1 Goleiro e 6 Jogadores de Linha em cada time (7 por equipe)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isAdm && (
                <span className="bg-primary-fixed text-primary-container font-label-md text-[11px] px-2.5 py-1 rounded-full uppercase tracking-wider font-bold">
                  DIRETORIA
                </span>
              )}
              <span className="bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
                4 TIMES • 28 ATLETAS
              </span>
            </div>
          </div>
        </div>
      </div>

      <main className="w-full">
        <AnimatePresence mode="wait">
          {/* ANIMAÇÃO DE EMBARALHAMENTO */}
          {isGenerating ? (
            <motion.div 
              key="generating"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex flex-col items-center justify-center py-20 space-y-6 bg-surface-container-lowest rounded-2xl border border-surface-container-high/40 shadow-sm"
            >
              <div className="relative">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="w-28 h-28 rounded-full border-4 border-dashed border-primary-container/30"
                />
                <motion.img 
                  src={MAIN_LOGO_URL} 
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-16 h-16 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
                  alt="O&A"
                />
              </div>
              <div className="text-center px-4">
                <h3 className="font-headline-sm text-headline-sm text-navy-deep font-bold">
                  SORTEANDO OS 4 ESQUADRÕES...
                </h3>
                <p className="font-body-sm text-body-sm text-outline mt-1 max-w-sm">
                  Distribuindo exatamente 1 goleiro e 6 jogadores de linha em cada equipe
                </p>
              </div>
            </motion.div>
          ) : !session || session.teams.length === 0 ? (
            /* TELA DE CONFIGURAÇÃO E EXECUÇÃO DO SORTEIO */
            <motion.div 
              key="selection"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start"
            >
              {/* Coluna Esquerda: Ações de Sorteio */}
              <div className="lg:col-span-5 flex flex-col gap-space-sm">
                <div className="bg-surface-container-lowest border border-surface-container-high/40 rounded-2xl p-space-md shadow-sm relative overflow-hidden flex flex-col gap-4">
                  <div>
                    <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider">
                      REQUISITOS OFICIAIS DO SORTEIO
                    </span>
                    <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-navy-deep leading-none font-bold mt-1">
                      {selectedIds.size} ATLETAS PRONTOS
                    </h3>
                    <p className="font-body-sm text-body-sm text-outline mt-2 leading-relaxed">
                      Cada equipe é formada estritamente por <strong>1 goleiro</strong> e <strong>6 jogadores de linha</strong> (total 7 atletas por time).
                    </p>
                  </div>

                  {/* Resumo técnico das posições */}
                  <div className="grid grid-cols-2 gap-2 bg-surface-container-low p-3 rounded-xl border border-surface-container-high/40">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-outline font-medium">Goleiros Titulares:</span>
                      <span className="font-headline-sm text-sm text-primary-container font-bold">
                        🧤 {confirmedPlayers.filter(p => p.position === 'Goleiro').length}/4 (1 por time)
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-outline font-medium">Jogadores de Linha:</span>
                      <span className="font-headline-sm text-sm text-navy-deep font-bold">
                        🏃 {confirmedPlayers.filter(p => p.position !== 'Goleiro').length}/24 (6 por time)
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-primary-fixed/20 border border-primary-container/20 text-[11px] text-primary-container font-medium flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] shrink-0">info</span>
                    <span>Total da convocação titular: <strong>28 atletas</strong> (4 goleiros + 24 de linha).</span>
                  </div>

                  {isAdm ? (
                    <button 
                      onClick={handleGenerateOfficialTeams}
                      disabled={isGenerating || selectedIds.size < 4}
                      className="w-full py-4 px-4 bg-gradient-to-r from-primary-container via-primary-bright to-navy-deep text-on-primary rounded-xl font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-2.5 shadow-md shadow-primary/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[22px]">shuffle</span>
                      <span>SORTEAR OS 4 TIMES (1 GK + 6 LINHA)</span>
                    </button>
                  ) : (
                    <div className="p-3.5 bg-surface-container-low rounded-xl text-center text-xs text-outline font-body-sm border border-surface-container-high/40">
                      🔒 O sorteio oficial é realizado pela Diretoria. Assim que efetuado, as equipes aparecerão nesta tela automaticamente!
                    </div>
                  )}
                </div>
              </div>

              {/* Coluna Direita: Seleção de Atletas para o Sorteio */}
              <div className="lg:col-span-7 flex flex-col gap-space-sm">
                <div className="flex items-center justify-between px-1">
                  <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider">
                    ATLETAS CONFIRMADOS NA LISTA ({confirmedPlayers.length})
                  </span>
                  {isAdm && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSelectedIds(new Set(confirmedPlayers.map(p => p.id)))}
                        className="font-label-md text-xs text-primary-container font-semibold hover:underline"
                      >
                        Marcar Todos
                      </button>
                      <span className="text-outline text-xs">•</span>
                      <button 
                        onClick={() => setSelectedIds(new Set())}
                        className="font-label-md text-xs text-outline font-semibold hover:underline"
                      >
                        Desmarcar
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {confirmedPlayers.map((p) => {
                    const isGK = p.position === 'Goleiro';
                    const isSelected = selectedIds.has(p.id);

                    return (
                      <div 
                        key={p.id} 
                        onClick={() => {
                          if (!isAdm) return;
                          const next = new Set(selectedIds);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          setSelectedIds(next);
                        }}
                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                          isAdm ? 'cursor-pointer' : ''
                        } ${
                          isSelected 
                            ? 'bg-surface-container-lowest border-primary-container/40 shadow-xs' 
                            : 'bg-surface-container-low/40 border-transparent opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img 
                            src={p.photoUrl} 
                            className="w-10 h-10 rounded-full object-cover shrink-0 border border-surface-container-high" 
                            referrerPolicy="no-referrer" 
                            alt="" 
                          />
                          <div className="min-w-0">
                            <p className="font-headline-sm text-headline-sm text-navy-deep font-bold truncate">
                              {p.name}
                            </p>
                            <span className={`text-[11px] font-bold uppercase tracking-wider ${
                              isGK ? 'text-primary-container' : 'text-outline'
                            }`}>
                              {isGK ? '🧤 Goleiro' : p.position}
                            </span>
                          </div>
                        </div>

                        {isAdm && (
                          <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected 
                              ? 'bg-primary-container border-primary-container text-on-primary' 
                              : 'border-outline text-transparent'
                          }`}>
                            <span className="material-symbols-outlined text-[16px]">check</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : (
            /* VISUALIZAÇÃO COMPLETA DAS EQUIPES SORTEADAS */
            <motion.div 
              key="teams-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col gap-space-md"
            >
              {/* BARRA DE AÇÕES DO TOPO */}
              <div className="flex items-center justify-between gap-2 flex-wrap bg-surface-container-lowest p-3 rounded-2xl border border-surface-container-high/40 shadow-xs">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleShareToWhatsApp}
                    className="py-2.5 px-3.5 bg-tertiary text-on-tertiary rounded-xl font-headline-sm text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    title="Compartilhar escalação no grupo da pelada"
                  >
                    <span className="material-symbols-outlined text-[18px]">share</span>
                    <span>{copiedFeedback ? 'ABRINDO WHATSAPP...' : 'ZAP DAS EQUIPES'}</span>
                  </button>

                  {isAdm && (
                    <button
                      onClick={() => setIsRemanageModalOpen(true)}
                      className="py-2.5 px-3.5 bg-surface-container hover:bg-surface-container-high text-navy-deep rounded-xl font-headline-sm text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                      title="Trocar atletas de time"
                    >
                      <span className="material-symbols-outlined text-[18px]">sync_alt</span>
                      <span>Remanejar Atletas</span>
                    </button>
                  )}
                </div>

                {isAdm && (
                  <button 
                    onClick={handleResetDraw}
                    className="py-2 px-3 text-error hover:bg-error/10 rounded-xl font-label-md text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                    title="Apagar escalação e fazer novo sorteio"
                  >
                    <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                    <span>Refazer Sorteio</span>
                  </button>
                )}
              </div>

              {/* TABELA DE JOGOS & REGRAS OFICIAIS */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-navy-deep via-primary-container to-blue-900 text-white shadow-md flex flex-col gap-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-400 text-[22px]">sports_score</span>
                    <span className="font-headline-sm text-sm font-bold uppercase tracking-wider">
                      Ordem dos Jogos • Convocação Oficial (1 GK + 6 Linha)
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white font-label-md text-xs font-bold">
                    4 Equipes Escaladas
                  </span>
                </div>

                {/* Destaque do Jogo 1 */}
                <div className="p-3 bg-white/10 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2 font-bold">
                    <span className="text-amber-300">JOGO 1:</span>
                    <span>{session.teams[0]?.name || 'Time 1'} 🆚 {session.teams[1]?.name || 'Time 2'}</span>
                  </div>
                  <div className="text-white/80 font-medium">
                    Na espera: {session.teams[2]?.name || 'Time 3'} e {session.teams[3]?.name || 'Time 4'}
                  </div>
                </div>

                <p className="text-xs text-white/90 leading-relaxed">
                  ⚖️ <strong>Regra Oficial:</strong> Se o Time 1 ou Time 2 estiver com desfalque na quadra no momento do apito inicial, cederá a vez ao <strong>Time 3</strong> para manter a pontualidade da pelada.
                </p>
              </div>

              {/* GRID DOS 4 CARDS DE EQUIPES (6 DE LINHA + 1 GOLEIRO) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                {session.teams.map((team, idx) => {
                  const theme = TEAM_THEMES[idx] || { name: `TIME ${idx + 1}`, headerBg: 'bg-navy-deep', dot: '⚽' };
                  const gks = team.playerIds.filter(pid => players.find(p => p.id === pid)?.position === 'Goleiro');
                  const lines = team.playerIds.filter(pid => players.find(p => p.id === pid)?.position !== 'Goleiro');
                  const hasGK = gks.length === 1;
                  const isComplete = gks.length === 1 && lines.length === 6;

                  return (
                    <div 
                      key={team.id || idx}
                      className="bg-surface-container-lowest rounded-2xl border border-surface-container-high/40 shadow-sm overflow-hidden flex flex-col"
                    >
                      {/* Header do Time com Cor Oficial */}
                      <div className={`px-4 py-3 flex justify-between items-center ${theme.headerBg} text-white`}>
                        <div className="flex items-center gap-2">
                          <span className="text-base">{theme.dot}</span>
                          <div>
                            <h4 className="font-headline-sm text-headline-sm font-bold leading-none text-white">
                              {team.name}
                            </h4>
                            <span className="text-[11px] opacity-90 font-medium">
                              {lines.length}/6 Linha • {gks.length}/1 Goleiro (Total: {team.playerIds.length}/7)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            hasGK ? 'bg-white/20 text-white' : 'bg-amber-400 text-amber-950'
                          }`}>
                            {hasGK ? '🧤 GK 1/1' : '⚠️ Falta GK'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            lines.length === 6 ? 'bg-emerald-400 text-emerald-950' : 'bg-white/20 text-white'
                          }`}>
                            Linha {lines.length}/6
                          </span>
                        </div>
                      </div>

                      {/* Lista de Atletas do Time */}
                      <div className="p-3 flex flex-col gap-2 flex-1">
                        {team.playerIds.length === 0 ? (
                          <div className="p-4 text-center text-outline text-xs font-body-sm">
                            Nenhum atleta neste time ainda.
                          </div>
                        ) : (
                          team.playerIds.map((pid) => {
                            const p = players.find(x => x.id === pid);
                            const isGK = p?.position === 'Goleiro';
                            const isCheckedIn = !!session.courtPresence?.[pid];

                            return (
                              <div 
                                key={pid}
                                className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                                  isCheckedIn 
                                    ? 'bg-emerald-50/50 border-emerald-500/30' 
                                    : 'bg-surface-container-low/50 border-surface-container-high/30'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <img 
                                    src={p?.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p?.name || 'A')}&background=003a75&color=fff`} 
                                    className="w-9 h-9 rounded-full object-cover shrink-0 border border-surface-container-high" 
                                    referrerPolicy="no-referrer" 
                                    alt=""
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="font-headline-sm text-headline-sm text-navy-deep font-bold truncate">
                                      {p?.name || 'Atleta'}
                                    </p>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full uppercase tracking-wider ${
                                        isGK ? 'bg-primary-fixed text-primary-container' : 'bg-surface-container text-outline'
                                      }`}>
                                        {isGK ? '🧤 Goleiro' : p?.position || 'Linha'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Check-in de quadra */}
                                  <button
                                    onClick={() => handleToggleCourtPresence(pid)}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-0.5 active:scale-95 transition-all ${
                                      isCheckedIn 
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                        : 'bg-surface-container text-outline hover:text-navy-deep'
                                    }`}
                                    title="Clique para alternar presença física na quadra"
                                  >
                                    <span className="material-symbols-outlined text-[13px]">
                                      {isCheckedIn ? 'check_circle' : 'location_on'}
                                    </span>
                                    <span>{isCheckedIn ? 'Na Quadra' : 'Chegou?'}</span>
                                  </button>

                                  {/* Ações do Administrador */}
                                  {isAdm && (
                                    <>
                                      {/* Mover rápido para outro time */}
                                      <select
                                        value=""
                                        onChange={(e) => {
                                          if (e.target.value) {
                                            handleQuickMovePlayerToTeam(pid, team.id, e.target.value);
                                          }
                                        }}
                                        className="h-7 px-1.5 bg-surface-container hover:bg-surface-container-high rounded-lg text-[10px] font-bold text-navy-deep outline-none border border-surface-container-high/50 cursor-pointer"
                                        title="Mover para outro time"
                                      >
                                        <option value="" disabled>Mover...</option>
                                        {session.teams.map((otherTeam) => {
                                          if (otherTeam.id === team.id) return null;
                                          return (
                                            <option key={otherTeam.id} value={otherTeam.id}>
                                              → {otherTeam.name}
                                            </option>
                                          );
                                        })}
                                      </select>

                                      {/* Remover do Time */}
                                      <button
                                        onClick={() => handleRemovePlayerFromTeam(pid, team.id)}
                                        className="w-7 h-7 rounded-lg text-outline hover:text-error hover:bg-error/10 flex items-center justify-center transition-all"
                                        title="Remover deste time"
                                      >
                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}

                        {/* Botão para o Admin adicionar atleta a este time */}
                        {isAdm && (
                          <button
                            onClick={() => {
                              setTargetTeamForAdd(team.id);
                              setIsAddPlayerModalOpen(true);
                            }}
                            className="mt-1 py-2 px-3 rounded-xl border border-dashed border-primary-container/40 text-primary-container hover:bg-primary-container/5 font-label-md text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                          >
                            <span className="material-symbols-outlined text-[16px]">person_add</span>
                            <span>Adicionar Atleta ao {team.name}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ATLETAS SUPLENTES / RESERVAS DA PELADA (SE HOUVER) */}
              {reserveAthletes.length > 0 && (
                <div className="bg-surface-container-lowest rounded-2xl border border-surface-container-high/40 shadow-xs p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-600 text-[22px]">hourglass_empty</span>
                      <h4 className="font-headline-sm text-sm text-navy-deep font-bold">
                        Suplentes / Reservas da Pelada ({reserveAthletes.length})
                      </h4>
                    </div>
                    <span className="text-[11px] text-outline font-medium">
                      Atletas excedentes prontos para assumir desfalques
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {reserveAthletes.map(res => (
                      <div key={res.id} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high/40">
                        <div className="flex items-center gap-2 min-w-0">
                          <img 
                            src={res.photoUrl} 
                            className="w-8 h-8 rounded-full object-cover shrink-0" 
                            referrerPolicy="no-referrer" 
                            alt="" 
                          />
                          <div className="min-w-0">
                            <p className="font-headline-sm text-xs text-navy-deep font-bold truncate">{res.name}</p>
                            <span className="text-[10px] text-outline uppercase font-semibold">{res.position}</span>
                          </div>
                        </div>

                        {isAdm && (
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                setTargetTeamForAdd(e.target.value);
                                handleAddPlayerToTeam(res.id);
                              }
                            }}
                            className="h-7 px-1.5 bg-primary-container text-on-primary rounded-lg text-[10px] font-bold outline-none cursor-pointer"
                          >
                            <option value="" disabled>Colocar em...</option>
                            {session.teams.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* MODAL 1: REMANEJAR / TROCAR ATLETAS ENTRE TIMES (ADMIN) */}
      {isRemanageModalOpen && session && (
        <div className="fixed inset-0 z-[120] bg-navy-deep/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-lg w-full rounded-2xl p-5 border border-surface-container-high/60 shadow-2xl flex flex-col gap-4 animate-pop-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-surface-container-high/40 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[24px]">sync_alt</span>
                <h3 className="font-headline-sm text-headline-sm text-navy-deep font-bold">
                  Remanejar Atletas Entre Times
                </h3>
              </div>
              <button 
                onClick={() => {
                  setIsRemanageModalOpen(false);
                  setSelectedPlayerToMove(null);
                  setTargetTeamId('');
                  setSwapWithPlayerId('');
                }}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="font-body-sm text-xs text-outline">
              Transfira um jogador de um time para outro ou faça a troca direta entre dois atletas de equipes diferentes.
            </p>

            <div className="flex flex-col gap-3">
              {/* Passo 1: Escolher o Atleta de Origem */}
              <div>
                <label className="font-label-md text-xs text-outline block mb-1 font-bold">
                  1. Selecione o Atleta que vai mudar de time:
                </label>
                <select 
                  value={selectedPlayerToMove ? `${selectedPlayerToMove.teamId}:::${selectedPlayerToMove.playerId}` : ''}
                  onChange={(e) => {
                    if (!e.target.value) {
                      setSelectedPlayerToMove(null);
                      return;
                    }
                    const [tId, pId] = e.target.value.split(':::');
                    setSelectedPlayerToMove({ teamId: tId, playerId: pId });
                    setSwapWithPlayerId('');
                  }}
                  className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high font-body-md text-navy-deep font-semibold outline-none"
                >
                  <option value="">Selecione um atleta...</option>
                  {session.teams.map((t) => (
                    <optgroup key={t.id} label={t.name}>
                      {t.playerIds.map(pid => {
                        const p = players.find(x => x.id === pid);
                        return (
                          <option key={pid} value={`${t.id}:::${pid}`}>
                            {p?.name} ({p?.position}) - {t.name}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Passo 2: Escolher o Time de Destino */}
              {selectedPlayerToMove && (
                <div>
                  <label className="font-label-md text-xs text-outline block mb-1 font-bold">
                    2. Selecione o Time de Destino:
                  </label>
                  <select 
                    value={targetTeamId}
                    onChange={(e) => {
                      setTargetTeamId(e.target.value);
                      setSwapWithPlayerId('');
                    }}
                    className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high font-body-md text-navy-deep font-semibold outline-none"
                  >
                    <option value="">Selecione o time de destino...</option>
                    {session.teams
                      .filter(t => t.id !== selectedPlayerToMove.teamId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.playerIds.length} atletas)
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Passo 3 (Opcional): Trocar com um atleta específico do time de destino */}
              {selectedPlayerToMove && targetTeamId && (
                <div>
                  <label className="font-label-md text-xs text-outline block mb-1 font-bold">
                    3. Deseja trocar diretamente com algum atleta? (Opcional)
                  </label>
                  <select 
                    value={swapWithPlayerId}
                    onChange={(e) => setSwapWithPlayerId(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high font-body-md text-navy-deep font-semibold outline-none"
                  >
                    <option value="">Nenhum (Apenas transferir atleta)</option>
                    {session.teams
                      .find(t => t.id === targetTeamId)
                      ?.playerIds.map(pid => {
                        const p = players.find(x => x.id === pid);
                        return (
                          <option key={pid} value={pid}>
                            Trocar por: {p?.name} ({p?.position})
                          </option>
                        );
                      })}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-surface-container-high/40">
              <button 
                onClick={() => setIsRemanageModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-surface-container text-on-surface font-label-md"
              >
                Cancelar
              </button>
              <button 
                onClick={handleExecuteRemanage}
                disabled={!selectedPlayerToMove || !targetTeamId || isMovingAthlete}
                className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-headline-sm flex items-center gap-1 shadow-md active:scale-95 disabled:opacity-50"
              >
                {isMovingAthlete ? 'Remanejando...' : 'Confirmar Remanejamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADICIONAR ATLETA AO TIME (ADMIN) */}
      {isAddPlayerModalOpen && targetTeamForAdd && (
        <div className="fixed inset-0 z-[120] bg-navy-deep/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-md w-full rounded-2xl p-5 border border-surface-container-high/60 shadow-2xl flex flex-col gap-4 animate-pop-in max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-surface-container-high/40 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[24px]">person_add</span>
                <h3 className="font-headline-sm text-headline-sm text-navy-deep font-bold">
                  Adicionar Atleta ao {session?.teams.find(t => t.id === targetTeamForAdd)?.name}
                </h3>
              </div>
              <button 
                onClick={() => {
                  setIsAddPlayerModalOpen(false);
                  setTargetTeamForAdd(null);
                }}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="font-body-sm text-xs text-outline">
              Selecione um dos atletas abaixo para incluí-lo nesta equipe:
            </p>

            <div className="flex flex-col gap-2 overflow-y-auto max-h-72 pr-1">
              {availablePlayersToAdd.length === 0 ? (
                <div className="p-4 text-center text-xs text-outline font-body-sm">
                  Todos os atletas cadastrados já estão escalados em algum time.
                </div>
              ) : (
                availablePlayersToAdd.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => handleAddPlayerToTeam(p.id)}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-surface-container-high/40 cursor-pointer active:scale-98 transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <img 
                        src={p.photoUrl} 
                        className="w-8 h-8 rounded-full object-cover" 
                        referrerPolicy="no-referrer" 
                        alt="" 
                      />
                      <div>
                        <p className="font-headline-sm text-xs text-navy-deep font-bold">{p.name}</p>
                        <span className="text-[10px] text-outline uppercase font-semibold">{p.position}</span>
                      </div>
                    </div>

                    <button className="px-2.5 py-1 bg-primary-container text-on-primary rounded-lg text-xs font-bold">
                      Adicionar
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-surface-container-high/40">
              <button 
                onClick={() => {
                  setIsAddPlayerModalOpen(false);
                  setTargetTeamForAdd(null);
                }}
                className="px-4 py-2 rounded-xl bg-surface-container text-on-surface font-label-md"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamBalancing;
