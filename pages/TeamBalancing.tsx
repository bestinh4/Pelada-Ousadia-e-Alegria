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
  { id: 4, name: 'TIME 5', headerBg: 'bg-emerald-800', badgeBg: 'bg-emerald-100 text-emerald-900', dot: '⭐' },
];

const TeamBalancing: React.FC<TeamBalancingProps> = ({ 
  players = [], 
  user, 
  currentUserRole, 
  onPageChange 
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [session, setSession] = useState<MatchSession | null>(() => {
    try {
      const cached = localStorage.getItem('oa_real_session_cache');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

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

  // Auto-escala por pontualidade (se um time estiver desfalcado e o da fila completar 6 na quadra, entra automaticamente)
  const [autoPromoteOnArrival, setAutoPromoteOnArrival] = useState<boolean>(() => {
    const saved = localStorage.getItem('oa_auto_promote_punctuality');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleAutoPromote = () => {
    const next = !autoPromoteOnArrival;
    setAutoPromoteOnArrival(next);
    localStorage.setItem('oa_auto_promote_punctuality', String(next));
  };

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
        const data = snap.data() as MatchSession;
        setSession(data);
        try {
          localStorage.setItem('oa_real_session_cache', JSON.stringify(data));
        } catch {}
      } else {
        setSession(null);
        localStorage.removeItem('oa_real_session_cache');
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

    const numTeams = 5;
    const teams: Team[] = Array.from({ length: numTeams }, (_, i) => {
      const theme = TEAM_THEMES[i] || { name: `TIME ${i + 1}` };
      return {
        id: `team_${i + 1}_${Date.now()}`,
        name: theme.name,
        playerIds: [],
        hasGoalkeeper: false,
        consecutiveWins: 0,
        totalWins: 0,
        isIncomplete: false
      };
    });

    const reservePlayerIds: string[] = [];

    // 2. Distribuir exatamente até 4 Goleiros (1 para cada equipe até o limite de 4 goleiros da pelada)
    for (let i = 0; i < Math.min(numTeams, 4); i++) {
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

    // 3. Distribuir os Jogadores de Linha igualmente entre as 5 equipes (meta: 6 por time = 30 no total)
    const teamFieldCounts = [0, 0, 0, 0, 0];
    let nextTeamIndex = 0;

    const assignFieldPlayer = (p: Player) => {
      // Encontra a menor contagem para distribuir de forma rigorosamente equilibrada entre os 5 times
      const minCount = Math.min(...teamFieldCounts);
      // Se todos os 5 times já completaram 6 atletas de linha (30 no total), excedente vira reserva
      if (minCount >= 6) {
        reservePlayerIds.push(p.id);
        return;
      }

      const eligible = [0, 1, 2, 3, 4].filter(idx => teamFieldCounts[idx] === minCount);
      let chosenIdx = eligible.find(idx => idx >= nextTeamIndex);
      if (chosenIdx === undefined) chosenIdx = eligible[0];

      teams[chosenIdx].playerIds.push(p.id);
      teamFieldCounts[chosenIdx]++;
      nextTeamIndex = (chosenIdx + 1) % numTeams;
    };

    // Intercalamos zaga, meio e ataque para garantir equilíbrio tático
    while (defenders.length > 0 || midfielders.length > 0 || attackers.length > 0) {
      if (defenders.length > 0) assignFieldPlayer(defenders.pop()!);
      if (midfielders.length > 0) assignFieldPlayer(midfielders.pop()!);
      if (attackers.length > 0) assignFieldPlayer(attackers.pop()!);
    }

    // Atualizar status de cada time (são 5 equipes e 4 goleiros, o 5º time terá goleiro rotativo/emprestado)
    teams.forEach(t => {
      const teamGKs = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position === 'Goleiro');
      const teamField = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position !== 'Goleiro');
      t.hasGoalkeeper = teamGKs.length > 0;
      t.isIncomplete = teamField.length < 6;
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
          "⚽ 5 EQUIPES SORTEADAS!",
          "A Diretoria realizou o sorteio oficial das 5 equipes com 4 goleiros distribuídos! Veja a escalação no App.",
          user?.uid
        );
      } catch {}

      alert("Sorteio oficial realizado com sucesso: 5 equipes e 4 goleiros oficiais!");
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar o sorteio.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper para obter estatísticas de presença física na quadra por equipe
  const getTeamPresence = (team: Team, customPresence?: Record<string, boolean>) => {
    const presenceMap = customPresence || session?.courtPresence || {};
    const lines = team.playerIds.filter(pid => players.find(p => p.id === pid)?.position !== 'Goleiro');
    const gks = team.playerIds.filter(pid => players.find(p => p.id === pid)?.position === 'Goleiro');
    const presentLines = lines.filter(pid => !!presenceMap[pid]).length;
    const presentGKs = gks.filter(pid => !!presenceMap[pid]).length;
    // Time está pronto na quadra se possui 6 atletas de linha presentes (ou todos se tiver menos de 6)
    const isReady = lines.length > 0 && presentLines >= Math.min(lines.length, 6);
    return {
      lines,
      gks,
      presentLines,
      presentGKs,
      isReady,
      presentTotal: presentLines + presentGKs,
      total: team.playerIds.length,
      missingLines: lines.filter(pid => !presenceMap[pid])
    };
  };

  // Alternar presença física na quadra (Check-in) com auto-substituição por pontualidade
  const handleToggleCourtPresence = async (playerId: string) => {
    if (!session) return;
    const currentStatus = !!session.courtPresence?.[playerId];
    const newPresence = {
      ...(session.courtPresence || {}),
      [playerId]: !currentStatus
    };

    try {
      const updates: any = {
        [`courtPresence.${playerId}`]: !currentStatus
      };

      // Se a pelada AINDA NÃO COMEÇOU, a auto-promoção por pontualidade estiver ligada e um atleta estiver CHEGANDO (!currentStatus)
      const isPeladaStarted = session.status === 'active' || !!session.activeMatch?.startedAt;
      if (!isPeladaStarted && autoPromoteOnArrival && !currentStatus) {
        // Encontrar a equipe deste atleta
        const playerTeam = session.teams.find(t => t.playerIds.includes(playerId));
        if (playerTeam) {
          const stats = getTeamPresence(playerTeam, newPresence);

          const curAId = session.activeMatch?.teamAId || session.teams[0]?.id;
          const curBId = session.activeMatch?.teamBId || session.teams[1]?.id;

          // Se o time completou os 6 atletas e NÃO está no confronto inicial (está na fila de espera)
          if (stats.isReady && playerTeam.id !== curAId && playerTeam.id !== curBId) {
            const teamA = session.teams.find(t => t.id === curAId);
            const teamB = session.teams.find(t => t.id === curBId);

            const statsA = teamA ? getTeamPresence(teamA, newPresence) : null;
            const statsB = teamB ? getTeamPresence(teamB, newPresence) : null;

            // Se o Time A estiver incompleto, substitui A. Se o Time B estiver incompleto, substitui B.
            let replaceTeamId: string | null = null;
            if (statsA && !statsA.isReady) {
              replaceTeamId = curAId;
            } else if (statsB && !statsB.isReady) {
              replaceTeamId = curBId;
            }

            if (replaceTeamId) {
              const isReplacingA = replaceTeamId === curAId;
              updates.activeMatch = {
                ...(session.activeMatch || { scoreA: 0, scoreB: 0, startedAt: null }),
                teamAId: isReplacingA ? playerTeam.id : curAId,
                teamBId: !isReplacingA ? playerTeam.id : curBId
              };
              const currentQ = session.waitingQueue || session.teams.slice(2).map(t => t.id);
              const filteredQ = currentQ.filter(id => id !== playerTeam.id);
              updates.waitingQueue = [replaceTeamId, ...filteredQ.filter(id => id !== replaceTeamId)];
              playSound('cheer');
            }
          }
        }
      }

      await updateDoc(doc(db, "sessions", "current"), updates);
    } catch (e) {
      console.error(e);
    }
  };

  // Troca direta / promoção de equipe para o confronto
  const handlePromoteTeamToMatch = async (teamToPromoteId: string, teamToReplaceId: string) => {
    if (!session || !isAdm) return;
    try {
      const curAId = session.activeMatch?.teamAId || session.teams[0]?.id;
      const isReplacingA = curAId === teamToReplaceId;
      const curBId = session.activeMatch?.teamBId || session.teams[1]?.id;

      const newActiveMatch = {
        ...(session.activeMatch || { scoreA: 0, scoreB: 0, startedAt: null }),
        teamAId: isReplacingA ? teamToPromoteId : curAId,
        teamBId: !isReplacingA ? teamToPromoteId : curBId
      };

      const currentQ = session.waitingQueue || session.teams.slice(2).map(t => t.id);
      const filteredQ = currentQ.filter(id => id !== teamToPromoteId);
      const newQueue = [teamToReplaceId, ...filteredQ.filter(id => id !== teamToReplaceId)];

      await updateDoc(doc(db, "sessions", "current"), {
        activeMatch: newActiveMatch,
        waitingQueue: newQueue
      });
      playSound('cheer');
    } catch (e) {
      alert("Erro ao alterar equipes do confronto.");
    }
  };

  // Finalizar partida e avançar fila (Regra Oficial: se empate, saem as duas equipes; exceto se houver apenas 3 equipes, que vai para os pênaltis)
  const handleFinishMatchAndRotate = async (result: 'teamA' | 'teamB' | 'draw') => {
    if (!session || !isAdm) return;
    const curAId = session.activeMatch?.teamAId || session.teams[0]?.id;
    const curBId = session.activeMatch?.teamBId || session.teams[1]?.id;
    const teamA = session.teams.find(t => t.id === curAId);
    const teamB = session.teams.find(t => t.id === curBId);
    const queue = [...(session.waitingQueue || session.teams.slice(2).map(t => t.id))];

    if (!teamA || !teamB) return;

    // CASO 1: EMPATE
    if (result === 'draw') {
      // Exceção: Se houver apenas 3 equipes na pelada, vai para os pênaltis!
      if (session.teams.length === 3) {
        const penaltyWinner = confirm(
          `⚽ DISPUTA DE PÊNALTIS (3 EQUIPES):\n\n` +
          `O jogo terminou empatado. De acordo com o regulamento com 3 equipes, a decisão é nos PÊNALTIS!\n\n` +
          `Clique em [OK] se o "${teamA.name}" venceu nos pênaltis.\n` +
          `Clique em [Cancelar] se o "${teamB.name}" venceu nos pênaltis.`
        );

        const penaltyWinnerId = penaltyWinner ? curAId : curBId;
        const penaltyLoserId = penaltyWinner ? curBId : curAId;

        if (queue.length === 0) return alert("Não há equipes na fila de espera.");
        const nextTeamId = queue.shift()!;
        queue.push(penaltyLoserId);

        const newTeams = session.teams.map(t => {
          if (t.id === penaltyWinnerId) {
            return {
              ...t,
              totalWins: (t.totalWins || 0) + 1,
              consecutiveWins: (t.consecutiveWins || 0) + 1
            };
          }
          if (t.id === penaltyLoserId) {
            return { ...t, consecutiveWins: 0 };
          }
          return t;
        });

        try {
          await updateDoc(doc(db, "sessions", "current"), {
            teams: newTeams,
            activeMatch: {
              teamAId: penaltyWinnerId,
              teamBId: nextTeamId,
              scoreA: 0,
              scoreB: 0,
              startedAt: Date.now()
            },
            waitingQueue: queue
          });
          playSound('cheer');
          alert(`Disputa de pênaltis concluída! ${penaltyWinner ? teamA.name : teamB.name} permanece em campo e ${session.teams.find(t => t.id === nextTeamId)?.name} entra para o próximo jogo.`);
        } catch (e) {
          alert("Erro ao salvar decisão de pênaltis.");
        }
        return;
      }

      // Regra Oficial (4 ou 5 equipes): EM CASO DE EMPATE, AS DUAS EQUIPES SAEM DE CAMPO!
      if (queue.length < 2) {
        alert("Fila de espera insuficiente para substituir ambas as equipes.");
        return;
      }

      // Ambos os times saem de campo e vão para o fim da fila de espera
      queue.push(curAId);
      queue.push(curBId);

      // Os dois próximos times da fila entram em campo
      const nextTeamAId = queue.shift()!;
      const nextTeamBId = queue.shift()!;

      const nextTeamA = session.teams.find(t => t.id === nextTeamAId);
      const nextTeamB = session.teams.find(t => t.id === nextTeamBId);

      // Zera vitórias consecutivas dos dois que saíram
      const newTeams = session.teams.map(t => {
        if (t.id === curAId || t.id === curBId) {
          return { ...t, consecutiveWins: 0 };
        }
        return t;
      });

      try {
        await updateDoc(doc(db, "sessions", "current"), {
          teams: newTeams,
          activeMatch: {
            teamAId: nextTeamAId,
            teamBId: nextTeamBId,
            scoreA: 0,
            scoreB: 0,
            startedAt: Date.now()
          },
          matchCount: (session.matchCount || 1) + 1,
          waitingQueue: queue
        });

        playSound('cheer');
        alert(`Empate registrado! Pelo regulamento, ${teamA.name} e ${teamB.name} saíram de campo e foram para o fim da fila.\n\nPróximo confronto: ${nextTeamA?.name} 🆚 ${nextTeamB?.name}!`);
      } catch (e) {
        alert("Erro ao registrar empate.");
      }
      return;
    }

    // CASO 2: VITÓRIA DE UMA DAS EQUIPES (teamA ou teamB)
    if (queue.length === 0) return alert("Não há equipes na fila de espera.");

    const nextTeamId = queue.shift()!;
    const stayingTeamId = result === 'teamA' ? curAId : curBId;
    const leavingTeamId = result === 'teamA' ? curBId : curAId;

    queue.push(leavingTeamId);

    const newTeams = session.teams.map(t => {
      if (t.id === stayingTeamId) {
        return { 
          ...t, 
          totalWins: (t.totalWins || 0) + 1, 
          consecutiveWins: (t.consecutiveWins || 0) + 1 
        };
      }
      if (t.id === leavingTeamId) {
        return { ...t, consecutiveWins: 0 };
      }
      return t;
    });

    try {
      await updateDoc(doc(db, "sessions", "current"), {
        teams: newTeams,
        activeMatch: {
          teamAId: stayingTeamId,
          teamBId: nextTeamId,
          scoreA: 0,
          scoreB: 0,
          startedAt: Date.now()
        },
        matchCount: (session.matchCount || 1) + 1,
        waitingQueue: queue
      });
      playSound('cheer');
      alert(`Vitória confirmada! ${result === 'teamA' ? teamA.name : teamB.name} continua na quadra e ${session.teams.find(t => t.id === nextTeamId)?.name} entrou como desafiante.`);
    } catch (e) {
      alert("Erro ao avançar partida.");
    }
  };

  // Iniciar oficialmente a pelada (Apito Inicial)
  const handleStartPelada = async () => {
    if (!session || !isAdm) return;
    try {
      await updateDoc(doc(db, "sessions", "current"), {
        status: "active",
        peladaStartedAt: Date.now(),
        "activeMatch.startedAt": Date.now(),
        matchCount: 1
      });
      playSound('cheer');
      alert("⚽ A PELADA COMEÇOU! Apito inicial dado.\n\nA regra de pontualidade foi desativada e a partir de agora o rodízio segue rigorosamente os resultados dos jogos.");
    } catch (e) {
      alert("Erro ao iniciar a pelada.");
    }
  };

  // Voltar para status de pré-pelada (caso iniciado por engano)
  const handleResetPeladaStatus = async () => {
    if (!session || !isAdm) return;
    if (!confirm("Deseja voltar a pelada para o status 'Aguardando Início'? (Isso reabilitará a checagem de pontualidade)")) return;
    try {
      await updateDoc(doc(db, "sessions", "current"), {
        status: "waiting",
        "activeMatch.startedAt": null,
        peladaStartedAt: null
      });
      playSound('cheer');
    } catch (e) {
      alert("Erro ao redefinir status da pelada.");
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
        t.isIncomplete = teamField.length < 6;
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
        t.isIncomplete = teamField.length < 6;
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
        t.isIncomplete = tField.length < 6;
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

    let text = `⚽ *ESCALAÇÃO OFICIAL DAS 5 EQUIPES • O&A* 🇭🇷\n`;
    text += `_Regra Oficial: 5 Equipes • 30 Atletas de Linha (6 por Time) e 4 Goleiros_\n\n`;
    text += `📌 *PARTIDA 1 (Abertura):* ${session.teams[0]?.name || 'Time 1'} 🆚 ${session.teams[1]?.name || 'Time 2'}\n`;
    const waitingTeams = session.teams.slice(2).map(t => t.name).join(', ');
    text += `⏳ *Na Espera:* ${waitingTeams || 'Nenhum'}\n`;
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

      const hasGK = gks.length > 0;
      text += `*${team.name.toUpperCase()}* (${team.playerIds.length} Atletas)\n`;
      text += `🧤 *Goleiro:* ${hasGK ? gks.join(', ') : 'GK Rotativo (revezamento)'}\n`;
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
                  Padrão Oficial: 5 Equipes • 30 Atletas de Linha (6 por equipe) e 4 Goleiros
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
                5 EQUIPES • 30 LINHA • 4 GK
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
                  SORTEANDO AS 5 EQUIPES OFICIAIS...
                </h3>
                <p className="font-body-sm text-body-sm text-outline mt-1 max-w-sm">
                  Distribuindo 30 atletas de linha (6 por equipe) e os 4 goleiros oficiais
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
                      São <strong>5 equipes</strong> formadas por <strong>6 atletas de linha cada (30 no total)</strong> e <strong>4 goleiros oficiais</strong> com rodízio na 5ª equipe.
                    </p>
                  </div>

                  {/* Resumo técnico das posições */}
                  <div className="grid grid-cols-2 gap-2 bg-surface-container-low p-3 rounded-xl border border-surface-container-high/40">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-outline font-medium">Goleiros Oficiais:</span>
                      <span className="font-headline-sm text-sm text-primary-container font-bold">
                        🧤 {confirmedPlayers.filter(p => p.position === 'Goleiro').length}/4 (1 por time)
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-outline font-medium">Atletas de Linha:</span>
                      <span className="font-headline-sm text-sm text-navy-deep font-bold">
                        🏃 {confirmedPlayers.filter(p => p.position !== 'Goleiro').length}/30 (6 por time)
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-primary-fixed/20 border border-primary-container/20 text-[11px] text-primary-container font-medium flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] shrink-0">info</span>
                    <span>Total da convocação titular: <strong>34 atletas</strong> (30 atletas de linha + 4 goleiros).</span>
                  </div>

                  {isAdm ? (
                    <button 
                      onClick={handleGenerateOfficialTeams}
                      disabled={isGenerating || selectedIds.size < 4}
                      className="w-full py-4 px-4 bg-gradient-to-r from-primary-container via-primary-bright to-navy-deep text-on-primary rounded-xl font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-2.5 shadow-md shadow-primary/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[22px]">shuffle</span>
                      <span>SORTEAR AS 5 EQUIPES (30 NA LINHA • 4 GK)</span>
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

              {/* PAINEL DE CONTROLE DO JOGO 1 & FILA DE ESPERA (TEMPO REAL) */}
              {(() => {
                const curAId = session?.activeMatch?.teamAId || session?.teams[0]?.id;
                const curBId = session?.activeMatch?.teamBId || session?.teams[1]?.id;
                const teamA = session?.teams.find(t => t.id === curAId) || session?.teams[0];
                const teamB = session?.teams.find(t => t.id === curBId) || session?.teams[1];

                const statsA = teamA ? getTeamPresence(teamA) : null;
                const statsB = teamB ? getTeamPresence(teamB) : null;

                const isPeladaStarted = session?.status === 'active' || !!session?.activeMatch?.startedAt;

                const currentQ = session?.waitingQueue || session?.teams.slice(2).map(t => t.id) || [];
                const queueTeams = currentQ
                  .map(tId => session?.teams.find(t => t.id === tId))
                  .filter(Boolean) as Team[];
                const finalQueue = queueTeams.length > 0 
                  ? queueTeams 
                  : (session?.teams || []).filter(t => t.id !== curAId && t.id !== curBId);

                // A regra de pontualidade é verificada APENAS ANTES da pelada começar
                const readyQueueTeam = !isPeladaStarted ? finalQueue.find(t => getTeamPresence(t).isReady) : null;
                const incompleteTeam = !isPeladaStarted ? ((statsA && !statsA.isReady) ? teamA : (statsB && !statsB.isReady) ? teamB : null) : null;
                const incompleteStats = incompleteTeam ? getTeamPresence(incompleteTeam) : null;

                return (
                  <div className="flex flex-col gap-3">
                    {/* Alerta de Pontualidade / Troca Inteligente (APENAS ANTES DE COMEÇAR) */}
                    {!isPeladaStarted && readyQueueTeam && incompleteTeam && (
                      <div className="p-3.5 rounded-2xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-950 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse-slow">
                        <div className="flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-amber-700 text-[24px] shrink-0">emergency</span>
                          <div className="text-xs">
                            <strong className="text-amber-900 block text-sm">
                              ⚡ Regra de Pontualidade Acionada (Pré-Pelada)!
                            </strong>
                            <span>
                              O <strong>{readyQueueTeam.name}</strong> já está com <strong>6/6 atletas prontos na quadra</strong>, enquanto o <strong>{incompleteTeam.name}</strong> ainda está com desfalque ({incompleteStats?.presentLines}/6 presentes).
                            </span>
                          </div>
                        </div>

                        {isAdm && (
                          <button
                            onClick={() => handlePromoteTeamToMatch(readyQueueTeam.id, incompleteTeam.id)}
                            className="py-2 px-3.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl font-headline-sm text-xs font-bold shadow-md active:scale-95 transition-all whitespace-nowrap flex items-center justify-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                            <span>Colocar {readyQueueTeam.name} no Jogo 1</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* CARD PRINCIPAL: CONFRONTO JOGO 1 & RODÍZIO */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-navy-deep via-primary-container to-blue-950 text-white shadow-xl flex flex-col gap-4">
                      {/* Header do Painel */}
                      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-white/15">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400">
                            <span className="material-symbols-outlined text-[24px]">sports_score</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              {isPeladaStarted ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-400/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-emerald-400/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                  ROLANDO A BOLA • JOGO #{session?.matchCount || 1}
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-300 font-bold uppercase tracking-widest block">
                                  PRÉ-PELADA • CHECAGEM DE PONTUALIDADE
                                </span>
                              )}
                            </div>
                            <h3 className="font-headline-sm text-base sm:text-lg font-bold leading-tight mt-0.5">
                              {isPeladaStarted 
                                ? `Partida em Andamento: ${teamA?.name || 'Time A'} 🆚 ${teamB?.name || 'Time B'}` 
                                : 'Confronto de Abertura & Rodízio Oficial'}
                            </h3>
                          </div>
                        </div>

                        {/* Botão de Toggle da Auto-Escalação por Pontualidade (SOMENTE ANTES DE COMEÇAR A PELADA) */}
                        {!isPeladaStarted && isAdm && (
                          <button
                            onClick={toggleAutoPromote}
                            className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                              autoPromoteOnArrival 
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40 hover:bg-emerald-500/30' 
                                : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
                            }`}
                            title="Antes de começar a pelada: se um time de abertura estiver incompleto e o da fila atingir 6 na quadra, a substituição é automática!"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {autoPromoteOnArrival ? 'bolt' : 'toggle_off'}
                            </span>
                            <span>Auto-Pontualidade: {autoPromoteOnArrival ? 'LIGADO' : 'MANUAL'}</span>
                          </button>
                        )}

                        {/* Indicador de Pelada Iniciada */}
                        {isPeladaStarted && (
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-400/30 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[15px]">timer</span>
                              <span>Pelada Iniciada</span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* PLACAR E DUELO: TIME A 🆚 TIME B */}
                      <div className="grid grid-cols-1 sm:grid-cols-11 items-center gap-3 bg-white/10 p-4 rounded-xl border border-white/10">
                        {/* Time A */}
                        <div className="sm:col-span-5 flex flex-col gap-1.5 bg-black/20 p-3 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between">
                            <span className="text-xs uppercase font-bold text-amber-300">
                              {isPeladaStarted ? 'EM CAMPO (TIME A)' : 'TIME A (ABERTURA)'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              statsA?.isReady ? 'bg-emerald-400 text-emerald-950 font-bold' : 'bg-amber-400 text-amber-950 font-bold'
                            }`}>
                              {statsA?.isReady ? '🟢 6/6 NA QUADRA' : `⚠️ ${statsA?.presentLines || 0}/6 NA QUADRA`}
                            </span>
                          </div>
                          <h4 className="font-headline-sm text-lg sm:text-xl font-bold truncate">
                            {teamA?.name || 'Time 1'}
                          </h4>
                          <span className="text-[11px] text-white/70">
                            {statsA?.presentTotal || 0} de {statsA?.total || 7} atletas confirmados na quadra
                          </span>
                        </div>

                        {/* VS Central */}
                        <div className="sm:col-span-1 flex flex-col items-center justify-center text-center">
                          <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs text-amber-300 shadow-inner">
                            VS
                          </span>
                        </div>

                        {/* Time B */}
                        <div className="sm:col-span-5 flex flex-col gap-1.5 bg-black/20 p-3 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between">
                            <span className="text-xs uppercase font-bold text-amber-300">
                              {isPeladaStarted ? 'EM CAMPO (TIME B)' : 'TIME B (ABERTURA)'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              statsB?.isReady ? 'bg-emerald-400 text-emerald-950 font-bold' : 'bg-amber-400 text-amber-950 font-bold'
                            }`}>
                              {statsB?.isReady ? '🟢 6/6 NA QUADRA' : `⚠️ ${statsB?.presentLines || 0}/6 NA QUADRA`}
                            </span>
                          </div>
                          <h4 className="font-headline-sm text-lg sm:text-xl font-bold truncate">
                            {teamB?.name || 'Time 2'}
                          </h4>
                          <span className="text-[11px] text-white/70">
                            {statsB?.presentTotal || 0} de {statsB?.total || 7} atletas confirmados na quadra
                          </span>
                        </div>
                      </div>

                      {/* ÁREA DE CONTROLES: ANTES DE INICIAR VS PELADA EM ANDAMENTO */}
                      {!isPeladaStarted ? (
                        /* FASE PRÉ-PELADA: BOTÃO OFICIAL DE INICIAR A PELADA */
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/15 bg-white/5 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 p-4 rounded-b-2xl">
                          <div className="flex items-center gap-2.5">
                            <span className="material-symbols-outlined text-amber-300 text-[24px]">sports</span>
                            <div className="text-xs">
                              <span className="font-bold text-white block text-sm">Aguardando Apito Inicial</span>
                              <span className="text-white/75">
                                Confirme a presença dos atletas na quadra. Quando estiver pronto, dê o apito inicial para começar o rodízio.
                              </span>
                            </div>
                          </div>

                          {isAdm && (
                            <button
                              onClick={handleStartPelada}
                              className="py-3 px-5 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-700 hover:from-emerald-600 hover:to-teal-800 text-white rounded-xl font-headline-sm text-sm font-bold shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 active:scale-95 transition-all animate-bounce-slow"
                            >
                              <span className="material-symbols-outlined text-[20px]">sports_soccer</span>
                              <span>INICIAR PELADA (APITO INICIAL)</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        /* FASE PELADA EM ANDAMENTO: AÇÕES DE RODÍZIO OFICIAL */
                        isAdm && (
                          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-white/10">
                            <div className="flex flex-col">
                              <span className="text-xs text-white/95 font-bold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                Finalizar Confronto & Rodar Fila:
                              </span>
                              <span className="text-[11px] text-white/70">
                                {session.teams.length === 3 
                                  ? '⚖️ Regra 3 Equipes: Em caso de empate, a decisão é nos pênaltis' 
                                  : '⚖️ Regra Oficial: Em caso de empate, ambos saem de campo e entram os 2 da fila'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => handleFinishMatchAndRotate('teamA')}
                                className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold active:scale-95 transition-all shadow-xs"
                                title={`${teamA?.name} venceu (permanece em campo e próximo da fila entra)`}
                              >
                                Vitória {teamA?.name}
                              </button>
                              <button
                                onClick={() => handleFinishMatchAndRotate('draw')}
                                className="py-2 px-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold active:scale-95 transition-all shadow-xs flex items-center gap-1"
                                title={session.teams.length === 3 ? "Empate (Decisão nos pênaltis)" : "Empate (As duas equipes saem de campo e entram duas da fila)"}
                              >
                                <span className="material-symbols-outlined text-[15px]">handshake</span>
                                <span>{session.teams.length === 3 ? 'Empate (Pênaltis)' : 'Empate (Saem os Dois)'}</span>
                              </button>
                              <button
                                onClick={() => handleFinishMatchAndRotate('teamB')}
                                className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold active:scale-95 transition-all shadow-xs"
                                title={`${teamB?.name} venceu (permanece em campo e próximo da fila entra)`}
                              >
                                Vitória {teamB?.name}
                              </button>

                              <button
                                onClick={handleResetPeladaStatus}
                                className="py-1 px-2 text-[10px] text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-all ml-1"
                                title="Voltar a pelada para status de pré-jogo (caso tenha iniciado por engano)"
                              >
                                Voltar Pré-Jogo
                              </button>
                            </div>
                          </div>
                        )
                      )}

                      {/* FILA DE ESPERA ORDENADA DOS PRÓXIMOS TIMES */}
                      <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                        <div className="flex items-center justify-between text-xs text-white/90">
                          <span className="font-bold flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px] text-amber-400">hourglass_top</span>
                            Fila de Espera Oficial (Próximos a Entrar):
                          </span>
                          <span className="text-[11px] opacity-75">
                            Conforme os atletas chegam, o status atualiza em tempo real
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {finalQueue.map((qTeam, qIdx) => {
                            const qStats = getTeamPresence(qTeam);
                            return (
                              <div 
                                key={qTeam.id || qIdx} 
                                className="bg-black/25 p-2.5 rounded-xl border border-white/10 flex flex-col justify-between gap-1.5"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-amber-300 uppercase">
                                    #{qIdx + 1} DA FILA
                                  </span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                    qStats.isReady ? 'bg-emerald-400 text-emerald-950' : 'bg-white/20 text-white'
                                  }`}>
                                    {qStats.isReady ? '6/6 PRONTO' : `${qStats.presentLines}/6 na quadra`}
                                  </span>
                                </div>

                                <span className="font-headline-sm text-sm font-bold truncate">
                                  {qTeam.name}
                                </span>

                                {isAdm && (
                                  <button
                                    onClick={() => handlePromoteTeamToMatch(qTeam.id, statsA?.isReady ? curBId : curAId)}
                                    className="w-full mt-1 py-1 px-2 rounded-lg bg-white/15 hover:bg-white/25 text-[11px] font-bold text-white transition-all flex items-center justify-center gap-1 active:scale-95"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                                    <span>Escalar no Jogo 1</span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* GRID DOS CARDS DE EQUIPES (5 TIMES) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                {session.teams.map((team, idx) => {
                  const theme = TEAM_THEMES[idx] || { name: `TIME ${idx + 1}`, headerBg: 'bg-navy-deep', dot: '⚽' };
                  const gks = team.playerIds.filter(pid => players.find(p => p.id === pid)?.position === 'Goleiro');
                  const lines = team.playerIds.filter(pid => players.find(p => p.id === pid)?.position !== 'Goleiro');
                  const hasGK = gks.length >= 1;
                  const teamPresence = getTeamPresence(team);

                  const curAId = session?.activeMatch?.teamAId || session?.teams[0]?.id;
                  const curBId = session?.activeMatch?.teamBId || session?.teams[1]?.id;
                  const isPlayingMatch = team.id === curAId || team.id === curBId;
                  const queuePos = (session?.waitingQueue || []).indexOf(team.id);

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
                              {lines.length}/6 Linha • {hasGK ? `${gks.length} Goleiro` : 'GK Rotativo'} (Total: {team.playerIds.length})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {isPlayingMatch ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-400 text-emerald-950 shadow-xs">
                              ⚽ JOGO 1
                            </span>
                          ) : queuePos >= 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white">
                              ⏳ #{queuePos + 1} NA FILA
                            </span>
                          ) : null}

                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            teamPresence.isReady ? 'bg-emerald-300 text-emerald-950 font-bold' : 'bg-white/20 text-white'
                          }`}>
                            {teamPresence.isReady ? '🟢 6/6 NA QUADRA' : `Quadra ${teamPresence.presentLines}/6`}
                          </span>

                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            hasGK ? 'bg-white/20 text-white' : 'bg-amber-400 text-amber-950 font-bold'
                          }`}>
                            {hasGK ? '🧤 GK' : '🧤 GK Rotativo'}
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
