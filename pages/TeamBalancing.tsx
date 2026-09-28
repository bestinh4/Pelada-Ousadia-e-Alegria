import React, { useState, useEffect } from 'react';
import { Player, Page } from '../types.ts';
import { MatchSession, Team } from '../domain/types.ts';
import { db, doc, setDoc, onSnapshot, deleteDoc, updateDoc, collection, addDoc } from '../services/firebase.ts';
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
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.teams)) {
        parsed.teams = parsed.teams.map((t: any, idx: number) => ({
          ...t,
          id: t?.id || `team_${idx + 1}`,
          name: t?.name || `TIME ${idx + 1}`,
          playerIds: Array.isArray(t?.playerIds) ? t.playerIds : []
        }));
        return parsed as MatchSession;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Modais administrativos
  const [isRemanageModalOpen, setIsRemanageModalOpen] = useState(false);
  const [isAddPlayerModalOpen, setIsAddPlayerModalOpen] = useState(false);
  const [targetTeamForAdd, setTargetTeamForAdd] = useState<string | null>(null);

  // Estados para Encerramento Oficial da Pelada (Apuração de Participação, Faltas e Multas)
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, boolean>>({});
  const [finedMap, setFinedMap] = useState<Record<string, boolean>>({});
  const [fineAmountValue, setFineAmountValue] = useState<number>(20);
  const [isFinishingPelada, setIsFinishingPelada] = useState(false);
  const [showParticipantsInSummary, setShowParticipantsInSummary] = useState(false);

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

  // Hierarquia oficial das posições para ordenação tática dentro de cada equipe:
  // 0: Goleiro | 10-19: Defensores (Zagueiro, Lateral) | 20-29: Meio-Campistas (Volante, Meia, Meia-atacante) | 30-39: Atacantes
  const getPositionPriority = (position?: string): number => {
    const pos = (position || '').trim().toLowerCase();
    if (pos === 'goleiro') return 0;
    // 1. Defensores
    if (pos === 'zagueiro' || pos === 'defensor' || pos === 'fixo') return 10;
    if (pos === 'lateral') return 12;
    // 2. Meio-Campistas
    if (pos === 'volante') return 20;
    if (pos === 'meia' || pos === 'meio-campo' || pos === 'meio campista') return 22;
    if (pos === 'meia-atacante' || pos === 'ala') return 24;
    // 3. Atacantes
    if (pos === 'ponta') return 30;
    if (pos === 'atacante' || pos === 'centroavante' || pos === 'pivô') return 32;
    return 40;
  };

  const getPositionSector = (position?: string): 'goleiro' | 'defesa' | 'meio' | 'ataque' => {
    const prio = getPositionPriority(position);
    if (prio === 0) return 'goleiro';
    if (prio < 20) return 'defesa';
    if (prio < 30) return 'meio';
    return 'ataque';
  };

  const getSectorBadgeStyle = (position?: string) => {
    const sector = getPositionSector(position);
    if (sector === 'goleiro') {
      return { icon: '🧤', badgeClass: 'bg-primary-fixed text-primary-container', sectorTitle: '🧤 GOLEIRO' };
    }
    if (sector === 'defesa') {
      return { icon: '🛡️', badgeClass: 'bg-blue-100 text-blue-900', sectorTitle: '🛡️ DEFENSORES' };
    }
    if (sector === 'meio') {
      return { icon: '🎯', badgeClass: 'bg-amber-100 text-amber-900', sectorTitle: '🎯 MEIO-CAMPISTAS' };
    }
    return { icon: '⚽', badgeClass: 'bg-emerald-100 text-emerald-900', sectorTitle: '⚽ ATACANTES' };
  };

  const sortTeamPlayerIds = (ids: string[]): string[] => {
    return [...ids].sort((idA, idB) => {
      const pA = players.find(p => p.id === idA);
      const pB = players.find(p => p.id === idB);
      const prioA = getPositionPriority(pA?.position);
      const prioB = getPositionPriority(pB?.position);
      if (prioA !== prioB) return prioA - prioB;
      return (pA?.name || '').localeCompare(pB?.name || '');
    });
  };

  const confirmedPlayers = players
    .filter(p => p.status === 'presente')
    .sort((a, b) => {
      const timeA = a.confirmedAt ? new Date(a.confirmedAt).getTime() : 0;
      const timeB = b.confirmedAt ? new Date(b.confirmedAt).getTime() : 0;
      return timeA - timeB;
    });

  // Listener em tempo real da sessão de times e do valor oficial da multa definido pela Diretoria
  useEffect(() => {
    const unsubFinance = onSnapshot(doc(db, "settings", "finance"), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data() as any;
        if (d?.multa !== undefined && Number(d.multa) >= 0) {
          setFineAmountValue(Number(d.multa));
        }
      }
    });

    const unsub = onSnapshot(doc(db, "sessions", "current"), (snap) => {
      if (snap.exists()) {
        const raw = snap.data() as any;
        if (raw && Array.isArray(raw.teams)) {
          const data: MatchSession = {
            ...raw,
            teams: raw.teams.map((t: any, idx: number) => ({
              ...t,
              id: t?.id || `team_${idx + 1}`,
              name: t?.name || `TIME ${idx + 1}`,
              playerIds: Array.isArray(t?.playerIds) ? t.playerIds : []
            }))
          };
          setSession(data);
          try {
            localStorage.setItem('oa_real_session_cache', JSON.stringify(data));
          } catch {}
        } else {
          setSession(null);
          localStorage.removeItem('oa_real_session_cache');
        }
      } else {
        setSession(null);
        localStorage.removeItem('oa_real_session_cache');
      }
    });
    return () => {
      unsubFinance();
      unsub();
    };
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

    // 1. Separar goleiros e jogadores de linha por setor tático
    const gks = selectedPlayers.filter(p => getPositionSector(p.position) === 'goleiro').sort(() => Math.random() - 0.5);
    const defenders = selectedPlayers.filter(p => getPositionSector(p.position) === 'defesa').sort(() => Math.random() - 0.5);
    const midfielders = selectedPlayers.filter(p => getPositionSector(p.position) === 'meio').sort(() => Math.random() - 0.5);
    const attackers = selectedPlayers.filter(p => getPositionSector(p.position) === 'ataque').sort(() => Math.random() - 0.5);

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

    // 2. Distribuir exatamente até 4 Goleiros na sequência (Time 1 -> Time 2 -> Time 3 -> Time 4)
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

    // 3. Definir a meta sequencial de cada time:
    // Completa 100% o Time 1 (6 atletas), depois o Time 2 (6 atletas), depois o Time 3, etc.
    // Assim, se houver menos de 30 atletas de linha, apenas o último time com jogadores fica incompleto.
    const totalFieldAvailable = defenders.length + midfielders.length + attackers.length;
    const targetFieldSizes = Array.from({ length: numTeams }, (_, i) =>
      Math.max(0, Math.min(6, totalFieldAvailable - i * 6))
    );

    const teamFieldCounts = [0, 0, 0, 0, 0];
    let nextTeamIndex = 0;

    const assignFieldPlayer = (p: Player) => {
      // Filtra apenas as equipes que ainda não atingiram sua meta sequencial (6 nos primeiros times, restante no último)
      const eligibleTeams = [0, 1, 2, 3, 4].filter(idx => teamFieldCounts[idx] < targetFieldSizes[idx]);

      if (eligibleTeams.length === 0) {
        // Excedente acima dos 30 titulares de linha vai para a lista de reservas/suplentes
        reservePlayerIds.push(p.id);
        return;
      }

      // Entre os times elegíveis que precisam de atletas, mantém o equilíbrio tático das posições (Defesa/Meio/Ataque)
      const minCount = Math.min(...eligibleTeams.map(idx => teamFieldCounts[idx]));
      const bestCandidates = eligibleTeams.filter(idx => teamFieldCounts[idx] === minCount);
      let chosenIdx = bestCandidates.find(idx => idx >= nextTeamIndex);
      if (chosenIdx === undefined) chosenIdx = bestCandidates[0];

      teams[chosenIdx].playerIds.push(p.id);
      teamFieldCounts[chosenIdx]++;
      nextTeamIndex = (chosenIdx + 1) % numTeams;
    };

    // Distribuir defensores, meio-campistas e atacantes respeitando o preenchimento completo dos primeiros times
    while (defenders.length > 0 || midfielders.length > 0 || attackers.length > 0) {
      if (defenders.length > 0) assignFieldPlayer(defenders.pop()!);
      if (midfielders.length > 0) assignFieldPlayer(midfielders.pop()!);
      if (attackers.length > 0) assignFieldPlayer(attackers.pop()!);
    }

    // Ordenar os atletas de cada time na sequência tática oficial: Goleiro -> Defensores -> Meio-Campistas -> Atacantes
    teams.forEach(t => {
      t.playerIds = sortTeamPlayerIds(t.playerIds);
      const teamGKs = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position === 'Goleiro');
      const teamField = t.playerIds.filter(pid => players.find(p => p.id === pid)?.position !== 'Goleiro');
      t.hasGoalkeeper = teamGKs.length > 0;
      t.isIncomplete = teamField.length < 6;
    });

    const sortedReserves = sortTeamPlayerIds(reservePlayerIds);

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
      reserves: sortedReserves
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
      await updateDoc(doc(db, "players", playerId), {
        courtCheckIn: !currentStatus
      }).catch(() => {});
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

  // Obter lista consolidada de todos os atletas que colocaram o nome na lista ou foram escalados
  const getConvokedAthletesList = (): { player: Player; teamName: string }[] => {
    const seen = new Set<string>();
    const result: { player: Player; teamName: string }[] = [];

    if (session?.teams) {
      session.teams.forEach(team => {
        const sortedIds = sortTeamPlayerIds(team.playerIds);
        sortedIds.forEach(pid => {
          const p = players.find(x => x.id === pid);
          if (p && !seen.has(p.id)) {
            seen.add(p.id);
            result.push({ player: p, teamName: team.name });
          }
        });
      });
    }

    if (session?.reserves) {
      session.reserves.forEach(pid => {
        const p = players.find(x => x.id === pid);
        if (p && !seen.has(p.id)) {
          seen.add(p.id);
          result.push({ player: p, teamName: 'Suplente / Reserva' });
        }
      });
    }

    confirmedPlayers.forEach(p => {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        result.push({ player: p, teamName: 'Confirmado na Lista' });
      }
    });

    return result;
  };

  // Encerrar a Pelada AUTOMATICAMENTE com base no Check-in feito em campo (courtPresence)
  const handleAutoFinishPeladaFromCheckIn = async () => {
    if (!session || !isAdm || isFinishingPelada) return;

    const convoked = getConvokedAthletesList();
    const presence = session.courtPresence || {};

    const participatedIds: string[] = [];
    const noShowIds: string[] = [];
    const noShowNames: string[] = [];

    convoked.forEach(({ player }) => {
      // Conferência 100% automática pelo check-in feito em campo (Na Quadra)
      if (presence[player.id]) {
        participatedIds.push(player.id);
      } else {
        noShowIds.push(player.id);
        noShowNames.push(player.name);
      }
    });

    const confirmMsg =
      `🏁 ENCERRAR PELADA (CONFERÊNCIA AUTOMÁTICA PELO CHECK-IN EM CAMPO)\n\n` +
      `✅ Participaram (Com Check-in em Campo): ${participatedIds.length} atleta(s)\n` +
      `❌ Não Compareceram (Sem Check-in em Campo): ${noShowIds.length} atleta(s)\n` +
      (noShowNames.length > 0
        ? `\n🚨 Faltosos que serão multados (R$ ${fineAmountValue},00) e entrarão na suplência:\n• ${noShowNames.join('\n• ')}\n`
        : `\n👏 Todos os convocados fizeram check-in em campo (0 faltas)!\n`) +
      `\nConfirma o encerramento oficial da pelada?`;

    if (!confirm(confirmMsg)) return;

    setIsFinishingPelada(true);
    try {
      const finedIds = [...noShowIds];
      const exemptNoShowIds: string[] = [];
      const isFirstFinish = session.status !== 'finished';
      const nowIso = new Date().toISOString();
      const matchDateStr = nowIso.split('T')[0];

      // 1. Atualizar automaticamente os atletas que PARTICIPARAM (fizeram check-in em campo)
      const partPromises = participatedIds.map(async (pid) => {
        const p = players.find(x => x.id === pid);
        if (!p) return;
        const playerTeam = session.teams.find(t => t.playerIds.includes(pid));
        const teamWins = playerTeam?.totalWins || 0;

        const updates: Record<string, any> = {
          courtCheckIn: true,
          hasNoShowFine: false,
          suplenteNextMatch: false,
          lastParticipatedAt: nowIso
        };

        if (isFirstFinish) {
          updates.totalGames = (p.totalGames || 0) + 1;
          updates.totalWins = (p.totalWins || 0) + teamWins;
        }

        await updateDoc(doc(db, "players", pid), updates).catch(() => {});
      });

      // 2. Atualizar automaticamente os atletas que NÃO FIZERAM CHECK-IN EM CAMPO (Faltosos -> Multa + Suplente)
      const noShowPromises = noShowIds.map(async (pid) => {
        const p = players.find(x => x.id === pid);
        if (!p) return;

        const updates: Record<string, any> = {
          courtCheckIn: false,
          suplenteNextMatch: true,
          hasNoShowFine: true,
          hasLateRemovalFine: true,
          fineAmount: fineAmountValue,
          fineReason: 'Colocou o nome na lista e não fez check-in em campo (Falta / W.O.)'
        };

        await updateDoc(doc(db, "players", pid), updates).catch(() => {});

        if (isFirstFinish) {
          await addDoc(collection(db, "lateRemovals"), {
            playerId: pid,
            playerName: p.name || "Atleta",
            timestamp: nowIso,
            matchId: "session_current",
            matchLocation: "Granja Cantinho do Céu",
            matchDate: matchDateStr,
            status: 'pendente',
            fineAmount: fineAmountValue,
            reason: 'Colocou o nome na lista e não fez check-in em campo (Falta / W.O.)'
          }).catch(() => {});
        }
      });

      await Promise.all([...partPromises, ...noShowPromises]);

      // 3. Gravar o encerramento oficial da sessão sincronizado com o check-in de campo
      const syncedPresence: Record<string, boolean> = {};
      convoked.forEach(({ player }) => {
        syncedPresence[player.id] = !!presence[player.id];
      });

      await updateDoc(doc(db, "sessions", "current"), {
        status: "finished",
        finishedAt: Date.now(),
        "activeMatch.startedAt": null,
        courtPresence: syncedPresence,
        summary: {
          participatedIds,
          noShowIds,
          finedIds,
          exemptNoShowIds,
          fineAmount: fineAmountValue,
          totalMatches: session.matchCount || 1,
          finishedAt: nowIso
        }
      });

      playSound('cheer');

      try {
        await broadcastNotification(
          "🏁 PELADA ENCERRADA!",
          `Apuração automática pelo check-in em campo: ${participatedIds.length} participaram e ${finedIds.length} falta(s) com multa.`,
          user?.uid
        );
      } catch {}
    } catch (e) {
      console.error(e);
      alert("Erro ao encerrar a pelada.");
    } finally {
      setIsFinishingPelada(false);
    }
  };

  // Abrir o Modal Oficial de Revisão/Ajuste (Sempre sincronizado automaticamente com o Check-in de Campo)
  const handleOpenFinishModal = () => {
    if (!session || !isAdm) return;
    const convoked = getConvokedAthletesList();
    const initialAtt: Record<string, boolean> = {};
    const initialFined: Record<string, boolean> = {};

    if (session.summary && session.status === 'finished') {
      const partSet = new Set(session.summary.participatedIds || []);
      const exemptSet = new Set(session.summary.exemptNoShowIds || []);
      convoked.forEach(({ player }) => {
        initialAtt[player.id] = partSet.has(player.id);
        initialFined[player.id] = !exemptSet.has(player.id);
      });
      if (session.summary.fineAmount) {
        setFineAmountValue(session.summary.fineAmount);
      }
    } else {
      const presence = session.courtPresence || {};
      convoked.forEach(({ player }) => {
        // Estritamente automático com o check-in feito em campo (Na Quadra)
        initialAtt[player.id] = !!presence[player.id];
        initialFined[player.id] = true;
      });
    }

    setAttendanceMap(initialAtt);
    setFinedMap(initialFined);
    setIsFinishModalOpen(true);
  };

  // Confirmar o Encerramento Oficial da Pelada e gravar quem participou, quem faltou e quem será multado
  const handleConfirmFinishPelada = async () => {
    if (!session || !isAdm) return;
    setIsFinishingPelada(true);

    try {
      const convoked = getConvokedAthletesList();
      const participatedIds: string[] = [];
      const noShowIds: string[] = [];
      const finedIds: string[] = [];
      const exemptNoShowIds: string[] = [];

      convoked.forEach(({ player }) => {
        if (attendanceMap[player.id]) {
          participatedIds.push(player.id);
        } else {
          noShowIds.push(player.id);
          if (finedMap[player.id] !== false) {
            finedIds.push(player.id);
          } else {
            exemptNoShowIds.push(player.id);
          }
        }
      });

      const isFirstFinish = session.status !== 'finished';
      const nowIso = new Date().toISOString();
      const matchDateStr = nowIso.split('T')[0];

      // 1. Atualizar os atletas que PARTICIPARAM (Compareceram na quadra)
      const partPromises = participatedIds.map(async (pid) => {
        const p = players.find(x => x.id === pid);
        if (!p) return;
        const playerTeam = session.teams.find(t => t.playerIds.includes(pid));
        const teamWins = playerTeam?.totalWins || 0;

        const updates: Record<string, any> = {
          courtCheckIn: true,
          hasNoShowFine: false,
          suplenteNextMatch: false,
          lastParticipatedAt: nowIso
        };

        if (isFirstFinish) {
          updates.totalGames = (p.totalGames || 0) + 1;
          updates.totalWins = (p.totalWins || 0) + teamWins;
        }

        await updateDoc(doc(db, "players", pid), updates).catch(() => {});
      });

      // 2. Atualizar os atletas que COLOCARAM O NOME E NÃO COMPARECERAM (Faltosos: Multados vs Isentos)
      const noShowPromises = noShowIds.map(async (pid) => {
        const p = players.find(x => x.id === pid);
        if (!p) return;
        const willBeFined = finedIds.includes(pid);

        const updates: Record<string, any> = {
          courtCheckIn: false,
          suplenteNextMatch: willBeFined,
          hasNoShowFine: willBeFined,
          hasLateRemovalFine: willBeFined ? true : !!p.hasLateRemovalFine,
          fineAmount: willBeFined ? fineAmountValue : 0,
          fineReason: willBeFined ? 'Colocou o nome na lista e não compareceu à pelada (Falta / W.O.)' : null
        };

        await updateDoc(doc(db, "players", pid), updates).catch(() => {});

        if (willBeFined && isFirstFinish) {
          await addDoc(collection(db, "lateRemovals"), {
            playerId: pid,
            playerName: p.name || "Atleta",
            timestamp: nowIso,
            matchId: "session_current",
            matchLocation: "Granja Cantinho do Céu",
            matchDate: matchDateStr,
            status: 'pendente',
            fineAmount: fineAmountValue,
            reason: 'Colocou o nome na lista e não compareceu à pelada (Falta / W.O.)'
          }).catch(() => {});
        }
      });

      await Promise.all([...partPromises, ...noShowPromises]);

      // 3. Salvar resumo oficial do encerramento na sessão atual
      await updateDoc(doc(db, "sessions", "current"), {
        status: "finished",
        finishedAt: Date.now(),
        "activeMatch.startedAt": null,
        courtPresence: attendanceMap,
        summary: {
          participatedIds,
          noShowIds,
          finedIds,
          exemptNoShowIds,
          fineAmount: fineAmountValue,
          totalMatches: session.matchCount || 1,
          finishedAt: nowIso
        }
      });

      playSound('cheer');
      setIsFinishModalOpen(false);

      try {
        await broadcastNotification(
          "🏁 PELADA ENCERRADA!",
          `Pelada finalizada! ${participatedIds.length} atletas participaram e ${finedIds.length} falta(s) com multa registrada(s).`,
          user?.uid
        );
      } catch {}

      alert(
        `🏁 PELADA ENCERRADA COM SUCESSO!\n\n` +
        `✅ Participaram: ${participatedIds.length} atleta(s)\n` +
        `❌ Não compareceram: ${noShowIds.length} atleta(s)\n` +
        `🚨 Multados + Suplência na próxima: ${finedIds.length} atleta(s)\n` +
        (exemptNoShowIds.length > 0 ? `⚖️ Isentos de multa: ${exemptNoShowIds.length} atleta(s)` : '')
      );
    } catch (e) {
      console.error(e);
      alert("Erro ao encerrar a pelada.");
    } finally {
      setIsFinishingPelada(false);
    }
  };

  // Alternar rapidamente entre Multado e Isento diretamente no Relatório de Pelada Encerrada
  const handleTogglePostSummaryFine = async (playerId: string) => {
    if (!session?.summary || !isAdm) return;
    const currentFined = session.summary.finedIds || session.summary.noShowIds || [];
    const isCurrentlyFined = currentFined.includes(playerId);
    const fineVal = session.summary.fineAmount || 20;

    const newFinedIds = isCurrentlyFined
      ? currentFined.filter(id => id !== playerId)
      : [...currentFined, playerId];

    const newExemptIds = (session.summary.noShowIds || []).filter(id => !newFinedIds.includes(id));

    try {
      await updateDoc(doc(db, "players", playerId), {
        hasNoShowFine: !isCurrentlyFined,
        hasLateRemovalFine: !isCurrentlyFined,
        suplenteNextMatch: !isCurrentlyFined,
        fineAmount: !isCurrentlyFined ? fineVal : 0,
        fineReason: !isCurrentlyFined ? 'Colocou o nome na lista e não compareceu à pelada (Falta / W.O.)' : null
      });

      await updateDoc(doc(db, "sessions", "current"), {
        "summary.finedIds": newFinedIds,
        "summary.exemptNoShowIds": newExemptIds
      });
    } catch (e) {
      alert("Erro ao atualizar status da multa do atleta.");
    }
  };

  // Reabrir pelada caso tenha sido encerrada por engano
  const handleReopenPelada = async () => {
    if (!session || !isAdm) return;
    if (!confirm("Deseja reabrir a pelada e voltar para o status 'Em Andamento'?")) return;
    try {
      await updateDoc(doc(db, "sessions", "current"), {
        status: "active",
        "activeMatch.startedAt": Date.now()
      });
      playSound('cheer');
    } catch (e) {
      alert("Erro ao reabrir a pelada.");
    }
  };

  // Compartilhar Relatório Oficial de Encerramento (Participantes, Faltosos e Multados) no WhatsApp
  const handleShareFinishSummaryToWhatsApp = () => {
    if (!session?.summary) return;
    const { participatedIds = [], noShowIds = [], finedIds = [], exemptNoShowIds = [], fineAmount = 20, totalMatches = 1 } = session.summary;

    const participatedNames = participatedIds
      .map(id => players.find(p => p.id === id)?.name)
      .filter(Boolean);

    const finedNames = finedIds
      .map(id => players.find(p => p.id === id)?.name)
      .filter(Boolean);

    const exemptNames = exemptNoShowIds
      .map(id => players.find(p => p.id === id)?.name)
      .filter(Boolean);

    let text = `🏁 *RELATÓRIO OFICIAL DE ENCERRAMENTO • O&A* 🇭🇷\n`;
    text += `📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n`;
    text += `⚽ Partidas Disputadas: *${totalMatches} jogo(s)*\n\n`;

    text += `✅ *PARTICIPARAM DA PELADA (${participatedNames.length}):*\n`;
    if (participatedNames.length > 0) {
      participatedNames.forEach((name, idx) => {
        text += `${String(idx + 1).padStart(2, '0')}. ${name}\n`;
      });
    } else {
      text += `_Nenhum registrado_\n`;
    }

    text += `\n❌ *COLOCARAM O NOME E NÃO COMPARECERAM (${noShowIds.length}):*\n`;
    if (finedNames.length > 0) {
      text += `🚨 *Multados (R$ ${fineAmount},00 + Suplência na próxima):*\n`;
      finedNames.forEach((name, idx) => {
        text += `• ${name} (Multa R$ ${fineAmount},00 + Suplente)\n`;
      });
    }
    if (exemptNames.length > 0) {
      text += `⚖️ *Falta Justificada (Isentos de Multa):*\n`;
      exemptNames.forEach((name) => {
        text += `• ${name} (Isento)\n`;
      });
    }
    if (noShowIds.length === 0) {
      text += `👏 *100% de presença! Nenhum confirmado faltou!*\n`;
    }

    text += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_Diretoria Ousadia & Alegria_`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
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

      // Recalcular flags e ordenar por posição
      updatedTeams.forEach(t => {
        t.playerIds = sortTeamPlayerIds(t.playerIds);
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
          return { ...t, playerIds: sortTeamPlayerIds(t.playerIds.filter(id => id !== playerId)) };
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
        reserves: sortTeamPlayerIds(Array.from(new Set(updatedReserves)))
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
          return { ...t, playerIds: sortTeamPlayerIds([...t.playerIds, playerId]) };
        }
        return t;
      });

      const updatedReserves = (session.reserves || []).filter(id => id !== playerId);

      updatedTeams.forEach(t => {
        t.playerIds = sortTeamPlayerIds(t.playerIds);
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
        t.playerIds = sortTeamPlayerIds(t.playerIds);
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
      const sortedIds = sortTeamPlayerIds(team.playerIds);
      const teamPlayers = sortedIds.map(pid => players.find(p => p.id === pid)).filter(Boolean) as Player[];

      const gks = teamPlayers.filter(p => getPositionSector(p.position) === 'goleiro').map(p => p.name);
      const defs = teamPlayers.filter(p => getPositionSector(p.position) === 'defesa').map(p => `${p.name} (${p.position})`);
      const mids = teamPlayers.filter(p => getPositionSector(p.position) === 'meio').map(p => `${p.name} (${p.position})`);
      const atks = teamPlayers.filter(p => getPositionSector(p.position) === 'ataque').map(p => `${p.name} (${p.position})`);

      const hasGK = gks.length > 0;
      text += `*${team.name.toUpperCase()}* (${team.playerIds.length} Atletas)\n`;
      text += `🧤 *Goleiro:* ${hasGK ? gks.join(', ') : 'GK Rotativo (revezamento)'}\n`;
      if (defs.length > 0) text += `🛡️ *Defensores:* ${defs.join(', ')}\n`;
      if (mids.length > 0) text += `🎯 *Meio-Campistas:* ${mids.join(', ')}\n`;
      if (atks.length > 0) text += `⚽ *Atacantes:* ${atks.join(', ')}\n`;
      text += `\n`;
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
    <div className="flex flex-col w-full max-w-5xl mx-auto pb-6 gap-4 animate-fade-in">
      <main className="w-full">
        <AnimatePresence mode="wait">
          {/* ANIMAÇÃO DE EMBARALHAMENTO */}
          {isGenerating ? (
            <motion.div 
              key="generating"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center justify-center py-16 space-y-5 bg-surface-container-lowest rounded-2xl border border-surface-container-high/40 shadow-sm"
            >
              <div className="relative">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="w-24 h-24 rounded-full border-4 border-dashed border-primary-container/30"
                />
                <motion.img 
                  src={MAIN_LOGO_URL} 
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-14 h-14 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
                  alt="O&A"
                />
              </div>
              <div className="text-center px-4">
                <h3 className="font-headline-sm text-base text-navy-deep font-bold">
                  SORTEANDO EQUIPES...
                </h3>
                <p className="font-body-sm text-xs text-outline mt-1">
                  Preenchendo os times em sequência e organizando por setor tático
                </p>
              </div>
            </motion.div>
          ) : !session || session.teams.length === 0 ? (
            /* TELA DE CONFIGURAÇÃO E EXECUÇÃO DO SORTEIO */
            <motion.div 
              key="selection"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start"
            >
              {/* Coluna Esquerda: Ações de Sorteio */}
              <div className="lg:col-span-5 flex flex-col gap-3 lg:sticky lg:top-20">
                <div className="bg-surface-container-lowest border border-surface-container-high/40 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col gap-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-label-caps text-[11px] text-on-surface-variant tracking-wider uppercase">
                        SORTEIO OFICIAL
                      </span>
                      <h2 className="font-headline-lg-mobile text-xl text-navy-deep font-bold leading-tight mt-0.5">
                        {selectedIds.size} Selecionados
                      </h2>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-primary-container/10 text-primary-container flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[22px]">shuffle</span>
                    </div>
                  </div>

                  {/* Contadores Limpos */}
                  <div className="grid grid-cols-2 gap-2 bg-surface-container-low p-3 rounded-xl border border-surface-container-high/40">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-outline font-medium">Goleiros</span>
                      <span className="font-headline-sm text-sm text-primary-container font-bold tabular-nums">
                        🧤 {confirmedPlayers.filter(p => p.position === 'Goleiro').length}/4
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-outline font-medium">Atletas de Linha</span>
                      <span className="font-headline-sm text-sm text-navy-deep font-bold tabular-nums">
                        🏃 {confirmedPlayers.filter(p => p.position !== 'Goleiro').length}/30
                      </span>
                    </div>
                  </div>

                  <p className="font-body-sm text-xs text-outline leading-relaxed">
                    Os times são preenchidos em sequência (6 atletas de linha por equipe, completando o Time 1 antes dos demais).
                  </p>

                  {isAdm ? (
                    <button 
                      onClick={handleGenerateOfficialTeams}
                      disabled={isGenerating || selectedIds.size < 4}
                      className="w-full min-h-[48px] py-3.5 px-4 bg-gradient-to-r from-primary-container via-primary-bright to-navy-deep text-on-primary rounded-xl font-headline-sm text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[20px]">shuffle</span>
                      <span>SORTEAR EQUIPES AGORA</span>
                    </button>
                  ) : (
                    <div className="p-3 bg-surface-container-low rounded-xl text-center text-xs text-outline font-body-sm border border-surface-container-high/40">
                      🔒 Aguardando a Diretoria realizar o sorteio das equipes.
                    </div>
                  )}
                </div>
              </div>

              {/* Coluna Direita: Seleção de Atletas para o Sorteio */}
              <div className="lg:col-span-7 flex flex-col gap-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="font-label-caps text-xs text-navy-deep font-bold tracking-wider uppercase">
                    Confirmados na Lista ({confirmedPlayers.length})
                  </span>
                  {isAdm && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setSelectedIds(new Set(confirmedPlayers.map(p => p.id)))}
                        className="font-label-md text-xs text-primary-container font-semibold hover:underline"
                      >
                        Marcar Todos
                      </button>
                      <span className="text-outline text-xs">·</span>
                      <button 
                        onClick={() => setSelectedIds(new Set())}
                        className="font-label-md text-xs text-outline font-semibold hover:underline"
                      >
                        Limpar
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          isAdm ? 'cursor-pointer' : ''
                        } ${
                          isSelected 
                            ? 'bg-surface-container-lowest border-primary-container/40 shadow-xs' 
                            : 'bg-surface-container-low/40 border-transparent opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img 
                            src={p.photoUrl} 
                            className="w-9 h-9 rounded-full object-cover shrink-0 border border-surface-container-high" 
                            referrerPolicy="no-referrer" 
                            alt="" 
                          />
                          <div className="min-w-0">
                            <p className="font-headline-sm text-xs sm:text-sm text-navy-deep font-bold truncate">
                              {p.name}
                            </p>
                            <span className={`text-[11px] font-semibold ${
                              isGK ? 'text-primary-container' : 'text-outline'
                            }`}>
                              {p.position}
                            </span>
                          </div>
                        </div>

                        {isAdm && (
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected 
                              ? 'bg-primary-container border-primary-container text-on-primary' 
                              : 'border-outline text-transparent'
                          }`}>
                            <span className="material-symbols-outlined text-[14px]">check</span>
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
              className="flex flex-col gap-4"
            >
              {/* BARRA DE AÇÕES RÁPIDAS (SEM BOTÕES REPETIDOS) */}
              <div className="flex items-center justify-between gap-2 flex-wrap bg-surface-container-lowest p-2.5 sm:p-3 rounded-2xl border border-surface-container-high/40 shadow-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <button 
                    onClick={handleShareToWhatsApp}
                    className="min-h-[40px] py-2 px-3.5 bg-tertiary text-on-tertiary rounded-xl font-headline-sm text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
                    title="Compartilhar escalação no grupo da pelada"
                  >
                    <span className="material-symbols-outlined text-[18px]">share</span>
                    <span>{copiedFeedback ? 'COPIADO!' : 'ZAP DAS EQUIPES'}</span>
                  </button>

                  {isAdm && (
                    <button
                      onClick={() => setIsRemanageModalOpen(true)}
                      className="min-h-[40px] py-2 px-3 bg-surface-container hover:bg-surface-container-high text-navy-deep rounded-xl font-headline-sm text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                      title="Trocar ou transferir atletas entre equipes"
                    >
                      <span className="material-symbols-outlined text-[18px]">sync_alt</span>
                      <span>Remanejar</span>
                    </button>
                  )}
                </div>

                {isAdm && (
                  <button 
                    onClick={handleResetDraw}
                    className="min-h-[40px] py-2 px-3 text-error hover:bg-error/10 rounded-xl font-label-md text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                    title="Apagar escalação e fazer novo sorteio"
                  >
                    <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                    <span>Novo Sorteio</span>
                  </button>
                )}
              </div>

              {/* PAINEL DE CONTROLE DO JOGO, RODÍZIO & ENCERRAMENTO OFICIAL DA PELADA */}
              {(() => {
                const curAId = session?.activeMatch?.teamAId || session?.teams[0]?.id;
                const curBId = session?.activeMatch?.teamBId || session?.teams[1]?.id;
                const teamA = session?.teams.find(t => t.id === curAId) || session?.teams[0];
                const teamB = session?.teams.find(t => t.id === curBId) || session?.teams[1];

                const statsA = teamA ? getTeamPresence(teamA) : null;
                const statsB = teamB ? getTeamPresence(teamB) : null;

                const isPeladaFinished = session?.status === 'finished';
                const isPeladaStarted = !isPeladaFinished && (session?.status === 'active' || !!session?.activeMatch?.startedAt);

                const currentQ = session?.waitingQueue || session?.teams.slice(2).map(t => t.id) || [];
                const queueTeams = currentQ
                  .map(tId => session?.teams.find(t => t.id === tId))
                  .filter(Boolean) as Team[];
                const finalQueue = queueTeams.length > 0 
                  ? queueTeams 
                  : (session?.teams || []).filter(t => t.id !== curAId && t.id !== curBId);

                const readyQueueTeam = (!isPeladaStarted && !isPeladaFinished) ? finalQueue.find(t => getTeamPresence(t).isReady) : null;
                const incompleteTeam = (!isPeladaStarted && !isPeladaFinished) ? ((statsA && !statsA.isReady) ? teamA : (statsB && !statsB.isReady) ? teamB : null) : null;
                const incompleteStats = incompleteTeam ? getTeamPresence(incompleteTeam) : null;

                if (isPeladaFinished && session?.summary) {
                  const {
                    participatedIds = [],
                    noShowIds = [],
                    finedIds = [],
                    fineAmount = fineAmountValue || 20,
                    totalMatches = 1,
                    finishedAt
                  } = session.summary;

                  if (!isAdm) {
                    return (
                      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-navy-deep to-slate-950 text-white shadow-lg border border-white/15 flex items-center justify-between flex-wrap gap-3 animate-fade-in">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
                            <span className="material-symbols-outlined text-[24px]">sports_score</span>
                          </div>
                          <div>
                            <span className="text-[10px] bg-emerald-400 text-emerald-950 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                              PELADA ENCERRADA
                            </span>
                            <h3 className="font-headline-sm text-sm sm:text-base font-bold mt-1">
                              Confrontos finalizados • {totalMatches} partida(s) disputada(s)
                            </h3>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const noShowPlayers = noShowIds
                    .map(id => players.find(p => p.id === id))
                    .filter(Boolean) as Player[];

                  const participatedPlayers = participatedIds
                    .map(id => players.find(p => p.id === id))
                    .filter(Boolean) as Player[];

                  return (
                    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-navy-deep to-slate-950 text-white shadow-xl border border-white/15 flex flex-col gap-4 animate-fade-in">
                      {/* Header do Relatório de Encerramento */}
                      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-white/15">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
                            <span className="material-symbols-outlined text-[24px]">sports_score</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] bg-emerald-400 text-emerald-950 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                                PELADA ENCERRADA
                              </span>
                              {finishedAt && (
                                <span className="text-[11px] text-white/70">
                                  {new Date(finishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {totalMatches} jogo(s)
                                </span>
                              )}
                            </div>
                            <h3 className="font-headline-sm text-sm sm:text-base font-bold leading-tight mt-1 truncate">
                              Relatório Oficial de Presença e Multas
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={handleShareFinishSummaryToWhatsApp}
                            className="min-h-[38px] py-2 px-3 bg-emerald-500 hover:bg-emerald-600 text-emerald-950 rounded-xl font-headline-sm text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                          >
                            <span className="material-symbols-outlined text-[16px]">share</span>
                            <span>ZAP DO RELATÓRIO</span>
                          </button>

                          {isAdm && (
                            <button
                              onClick={handleOpenFinishModal}
                              className="min-h-[38px] py-2 px-3 bg-white/15 hover:bg-white/25 text-white rounded-xl font-headline-sm text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit_note</span>
                              <span>Ajuste Manual</span>
                            </button>
                          )}

                          {isAdm && (
                            <button
                              onClick={handleReopenPelada}
                              className="min-h-[38px] py-2 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/30 rounded-xl font-headline-sm text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
                            >
                              <span className="material-symbols-outlined text-[16px]">replay</span>
                              <span>Reabrir</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 3 CARDS DE RESUMO */}
                      <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-xl p-2.5 sm:p-3.5 text-center sm:text-left">
                          <span className="text-[10px] sm:text-[11px] font-bold uppercase text-emerald-300 block">
                            Participaram
                          </span>
                          <span className="font-scoreboard-num text-2xl sm:text-3xl text-white leading-none mt-1 block tabular-nums">
                            {participatedIds.length}
                          </span>
                        </div>

                        <div className="bg-amber-500/15 border border-amber-400/30 rounded-xl p-2.5 sm:p-3.5 text-center sm:text-left">
                          <span className="text-[10px] sm:text-[11px] font-bold uppercase text-amber-300 block">
                            Faltaram
                          </span>
                          <span className="font-scoreboard-num text-2xl sm:text-3xl text-white leading-none mt-1 block tabular-nums">
                            {noShowIds.length}
                          </span>
                        </div>

                        <div className="bg-red-500/20 border border-red-400/40 rounded-xl p-2.5 sm:p-3.5 text-center sm:text-left">
                          <span className="text-[10px] sm:text-[11px] font-bold uppercase text-red-300 block">
                            Multados
                          </span>
                          <span className="font-scoreboard-num text-2xl sm:text-3xl text-white leading-none mt-1 block tabular-nums">
                            {finedIds.length}
                          </span>
                        </div>
                      </div>

                      {/* LISTA DE QUEM NÃO COMPARECEU */}
                      <div className="bg-black/30 rounded-xl p-3 border border-white/10 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <h4 className="font-headline-sm text-xs sm:text-sm font-bold text-amber-300">
                            Não Compareceram ({noShowPlayers.length})
                          </h4>
                          <span className="text-[11px] text-white/70">
                            Multa R$ {fineAmount},00 + Suplência
                          </span>
                        </div>

                        {noShowPlayers.length === 0 ? (
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-200 text-xs font-semibold flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px]">verified</span>
                            <span>Todos os atletas convocados fizeram check-in na quadra (0 faltas).</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {noShowPlayers.map(p => {
                              const isFined = finedIds.includes(p.id);
                              const teamOfPlayer = session.teams.find(t => t.playerIds.includes(p.id))?.name || 'Lista';
                              return (
                                <div
                                  key={p.id}
                                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                                    isFined
                                      ? 'bg-red-950/50 border-red-400/40'
                                      : 'bg-white/5 border-white/15'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <img
                                      src={p.photoUrl}
                                      alt={p.name}
                                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/20"
                                      referrerPolicy="no-referrer"
                                    />
                                    <div className="min-w-0">
                                      <p className="font-headline-sm text-xs font-bold text-white truncate">
                                        {p.name}
                                      </p>
                                      <span className="text-[10px] text-white/70 block truncate">
                                        {p.position} · {teamOfPlayer} · {isFined ? `Multado R$ ${fineAmount}` : 'Isento'}
                                      </span>
                                    </div>
                                  </div>

                                  {isAdm && (
                                    <button
                                      onClick={() => handleTogglePostSummaryFine(p.id)}
                                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase shrink-0 transition-all active:scale-95 ${
                                        isFined
                                          ? 'bg-white/15 hover:bg-white/25 text-white'
                                          : 'bg-red-600 hover:bg-red-700 text-white'
                                      }`}
                                    >
                                      {isFined ? 'Isentar' : 'Multar'}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* LISTA DE QUEM PARTICIPOU (EXPANSÍVEL) */}
                      <div className="bg-white/5 rounded-xl p-2.5 border border-white/10 flex flex-col gap-2">
                        <button
                          onClick={() => setShowParticipantsInSummary(!showParticipantsInSummary)}
                          className="w-full flex items-center justify-between text-left text-xs font-bold text-emerald-300 hover:text-emerald-200"
                        >
                          <span>Ver {participatedPlayers.length} Atletas Participantes</span>
                          <span className="material-symbols-outlined text-[18px]">
                            {showParticipantsInSummary ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>

                        {showParticipantsInSummary && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 pt-2 border-t border-white/10">
                            {participatedPlayers.map(p => (
                              <div key={p.id} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-black/25 border border-emerald-400/20">
                                <img
                                  src={p.photoUrl}
                                  alt={p.name}
                                  className="w-5 h-5 rounded-full object-cover shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                                <span className="text-[11px] font-semibold text-white truncate">{p.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                const convokedAll = getConvokedAthletesList();
                const checkedInCount = convokedAll.filter(({ player }) => !!session?.courtPresence?.[player.id]).length;
                const missingCheckInCount = convokedAll.length - checkedInCount;

                return (
                  <div className="flex flex-col gap-3">
                    {/* Alerta de Pontualidade / Troca Inteligente (APENAS ANTES DE COMEÇAR) */}
                    {!isPeladaStarted && readyQueueTeam && incompleteTeam && (
                      <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-950 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="material-symbols-outlined text-amber-700 text-[20px] shrink-0">bolt</span>
                          <span>
                            <strong>{readyQueueTeam.name}</strong> completo na quadra (6/6), enquanto <strong>{incompleteTeam.name}</strong> tem {incompleteStats?.presentLines}/6.
                          </span>
                        </div>

                        {isAdm && (
                          <button
                            onClick={() => handlePromoteTeamToMatch(readyQueueTeam.id, incompleteTeam.id)}
                            className="py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-headline-sm text-xs font-bold active:scale-95 transition-all whitespace-nowrap shrink-0"
                          >
                            Colocar {readyQueueTeam.name} no Jogo 1
                          </button>
                        )}
                      </div>
                    )}

                    {/* CARD PRINCIPAL: CONFRONTO & CONTROLE ÚNICO DA PELADA */}
                    <div className="p-3.5 sm:p-5 rounded-2xl bg-gradient-to-br from-navy-deep via-primary-container to-blue-950 text-white shadow-lg flex flex-col gap-3.5">
                      {/* Header Limpo */}
                      <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-white/15">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0">
                            <span className="material-symbols-outlined text-[20px]">sports_score</span>
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block">
                              {isPeladaStarted ? `EM CAMPO • JOGO #${session?.matchCount || 1}` : 'PRÉ-JOGO • CHECAGEM DE QUADRA'}
                            </span>
                            <h3 className="font-headline-sm text-sm sm:text-base font-bold leading-tight truncate">
                              {teamA?.name || 'Time A'} vs {teamB?.name || 'Time B'}
                            </h3>
                          </div>
                        </div>

                        {!isPeladaStarted && isAdm && (
                          <button
                            onClick={toggleAutoPromote}
                            className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all border ${
                              autoPromoteOnArrival 
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' 
                                : 'bg-white/10 text-white/80 border-white/20'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              {autoPromoteOnArrival ? 'bolt' : 'toggle_off'}
                            </span>
                            <span>Auto-Pontualidade: {autoPromoteOnArrival ? 'ON' : 'OFF'}</span>
                          </button>
                        )}

                        {isPeladaStarted && isAdm && (
                          <button
                            onClick={handleResetPeladaStatus}
                            className="py-1 px-2.5 text-[11px] text-white/75 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                          >
                            Voltar Pré-Jogo
                          </button>
                        )}
                      </div>

                      {/* DUELO EM CAMPO: TIME A VS TIME B */}
                      <div className="grid grid-cols-2 sm:grid-cols-11 items-center gap-2 sm:gap-3">
                        <div className="sm:col-span-5 flex flex-col gap-1 bg-black/25 p-3 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] uppercase font-bold text-amber-300 truncate">
                              {teamA?.name || 'Time 1'}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 tabular-nums ${
                              statsA?.isReady ? 'bg-emerald-400 text-emerald-950' : 'bg-amber-400 text-amber-950'
                            }`}>
                              {statsA?.presentLines || 0}/6
                            </span>
                          </div>
                          <span className="text-[11px] text-white/75 truncate">
                            {statsA?.presentTotal || 0} na quadra
                          </span>
                        </div>

                        <div className="hidden sm:flex sm:col-span-1 items-center justify-center">
                          <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center font-bold text-[11px] text-amber-300">
                            VS
                          </span>
                        </div>

                        <div className="sm:col-span-5 flex flex-col gap-1 bg-black/25 p-3 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] uppercase font-bold text-amber-300 truncate">
                              {teamB?.name || 'Time 2'}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 tabular-nums ${
                              statsB?.isReady ? 'bg-emerald-400 text-emerald-950' : 'bg-amber-400 text-amber-950'
                            }`}>
                              {statsB?.presentLines || 0}/6
                            </span>
                          </div>
                          <span className="text-[11px] text-white/75 truncate">
                            {statsB?.presentTotal || 0} na quadra
                          </span>
                        </div>
                      </div>

                      {/* FILA COMPACTA EM LINHA (SEM REPETIR CARDS GRANDES) */}
                      {finalQueue.length > 0 && (
                        <div className="flex items-center justify-between gap-2 flex-wrap bg-black/20 px-3 py-2 rounded-xl border border-white/10 text-xs">
                          <span className="text-white/80 font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[15px] text-amber-400">hourglass_top</span>
                            <span>Próximos da Fila:</span>
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {finalQueue.map((qTeam, qIdx) => {
                              const qStats = getTeamPresence(qTeam);
                              return (
                                <span
                                  key={qTeam.id || qIdx}
                                  onClick={() => {
                                    if (isAdm && !isPeladaStarted) {
                                      handlePromoteTeamToMatch(qTeam.id, statsA?.isReady ? curBId : curAId);
                                    }
                                  }}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 ${
                                    isAdm && !isPeladaStarted ? 'cursor-pointer hover:bg-white/25' : ''
                                  } ${
                                    qStats.isReady ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30' : 'bg-white/10 text-white/90'
                                  }`}
                                  title={isAdm && !isPeladaStarted ? "Toque para escalar no Jogo 1" : undefined}
                                >
                                  <span>{qIdx + 1}º {qTeam.name}</span>
                                  <span className="opacity-75 text-[10px]">({qStats.presentLines}/6)</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* RODÍZIO DE VENCEDOR (QUANDO PELADA EM ANDAMENTO) */}
                      {isPeladaStarted && isAdm && (
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <button
                            onClick={() => handleFinishMatchAndRotate('teamA')}
                            className="min-h-[40px] py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold active:scale-95 transition-all truncate"
                          >
                            Vitória {teamA?.name}
                          </button>
                          <button
                            onClick={() => handleFinishMatchAndRotate('draw')}
                            className="min-h-[40px] py-2 px-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold active:scale-95 transition-all truncate"
                          >
                            {session.teams.length === 3 ? 'Empate (Pênaltis)' : 'Empate (Saem 2)'}
                          </button>
                          <button
                            onClick={() => handleFinishMatchAndRotate('teamB')}
                            className="min-h-[40px] py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold active:scale-95 transition-all truncate"
                          >
                            Vitória {teamB?.name}
                          </button>
                        </div>
                      )}

                      {/* BARRA ÚNICA DE INÍCIO / ENCERRAMENTO AUTOMÁTICO PELO CHECK-IN */}
                      {isAdm && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-white/15">
                          <div className="text-xs text-white/85">
                            <span className="font-bold text-white block">
                              Check-in em Campo: {checkedInCount} presentes · {missingCheckInCount} sem check-in
                            </span>
                            <span className="text-[11px] text-white/70">
                              Ao encerrar, quem fez check-in consta como participante e quem faltou recebe multa.
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {!isPeladaStarted && (
                              <button
                                onClick={handleStartPelada}
                                className="flex-1 sm:flex-initial min-h-[44px] py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-emerald-950 rounded-xl font-headline-sm text-xs font-bold shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                              >
                                <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                                <span>INICIAR PELADA</span>
                              </button>
                            )}

                            <button
                              onClick={handleAutoFinishPeladaFromCheckIn}
                              disabled={isFinishingPelada}
                              className="flex-1 sm:flex-initial min-h-[44px] py-2.5 px-4 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white rounded-xl font-headline-sm text-xs font-bold shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-[18px]">flag</span>
                              <span>{isFinishingPelada ? 'ENCERRANDO...' : 'ENCERRAR PELADA'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* GRID DOS CARDS DE EQUIPES (5 TIMES) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
                      className="bg-surface-container-lowest rounded-2xl border border-surface-container-high/40 shadow-xs overflow-hidden flex flex-col"
                    >
                      {/* Header Limpo do Time */}
                      <div className={`px-3.5 py-2.5 flex justify-between items-center gap-2 ${theme.headerBg} text-white`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm shrink-0">{theme.dot}</span>
                          <div className="min-w-0">
                            <h4 className="font-headline-sm text-sm font-bold leading-tight text-white truncate">
                              {team.name}
                            </h4>
                            <span className="text-[11px] opacity-85 font-medium block truncate">
                              {lines.length}/6 Linha · {hasGK ? '1 Goleiro' : 'GK Rotativo'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isPlayingMatch ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-400 text-emerald-950">
                              Em Campo
                            </span>
                          ) : queuePos >= 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-white/20 text-white">
                              #{queuePos + 1} Fila
                            </span>
                          ) : null}

                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                            teamPresence.isReady ? 'bg-emerald-300 text-emerald-950' : 'bg-white/20 text-white'
                          }`}>
                            Quadra {teamPresence.presentLines}/6
                          </span>
                        </div>
                      </div>

                      {/* Lista de Atletas Ordenada por Setor Tático */}
                      <div className="p-3 flex flex-col gap-1.5 flex-1">
                        {team.playerIds.length === 0 ? (
                          <div className="p-4 text-center text-outline text-xs font-body-sm">
                            Nenhum atleta escalado.
                          </div>
                        ) : (
                          (() => {
                            const sortedIds = sortTeamPlayerIds(team.playerIds);
                            let lastSector: string | null = null;

                            return sortedIds.map((pid) => {
                              const p = players.find(x => x.id === pid);
                              const isCheckedIn = !!session.courtPresence?.[pid];
                              const sector = getPositionSector(p?.position);
                              const styleInfo = getSectorBadgeStyle(p?.position);
                              const showSectorHeader = sector !== lastSector;
                              lastSector = sector;

                              return (
                                <React.Fragment key={pid}>
                                  {showSectorHeader && (
                                    <div className="flex items-center gap-1.5 pt-1.5 pb-0.5 px-1">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-navy-deep/75">
                                        {styleInfo.sectorTitle}
                                      </span>
                                      <div className="flex-1 h-px bg-surface-container-high/60"></div>
                                    </div>
                                  )}

                                  <div 
                                    className={`flex items-center justify-between gap-2 p-2 rounded-xl border transition-all ${
                                      isCheckedIn 
                                        ? 'bg-emerald-50/50 border-emerald-500/30' 
                                        : 'bg-surface-container-low/50 border-surface-container-high/30'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <img 
                                        src={p?.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p?.name || 'A')}&background=003a75&color=fff`} 
                                        className="w-8 h-8 rounded-full object-cover shrink-0 border border-surface-container-high" 
                                        referrerPolicy="no-referrer" 
                                        alt=""
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="font-headline-sm text-xs sm:text-sm text-navy-deep font-bold truncate">
                                          {p?.name || 'Atleta'}
                                        </p>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-[10px] font-semibold text-outline">
                                            {p?.position || 'Linha'}
                                          </span>
                                          {isAdm && session.status === 'finished' && session.summary && (
                                            session.summary.participatedIds?.includes(pid) ? (
                                              <span className="text-[10px] font-bold text-emerald-700">
                                                · Participou
                                              </span>
                                            ) : session.summary.finedIds?.includes(pid) ? (
                                              <span className="text-[10px] font-bold text-red-700">
                                                · Multado
                                              </span>
                                            ) : session.summary.noShowIds?.includes(pid) ? (
                                              <span className="text-[10px] font-bold text-amber-700">
                                                · Isento
                                              </span>
                                            ) : null
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        onClick={() => handleToggleCourtPresence(pid)}
                                        className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-all ${
                                          isCheckedIn 
                                            ? 'bg-emerald-600 text-white shadow-xs' 
                                            : 'bg-surface-container text-outline hover:text-navy-deep'
                                        }`}
                                        title="Confirmar presença física em campo"
                                      >
                                        <span className="material-symbols-outlined text-[13px]">
                                          {isCheckedIn ? 'check_circle' : 'location_on'}
                                        </span>
                                        <span>{isCheckedIn ? 'Na Quadra' : 'Check-in'}</span>
                                      </button>

                                      {isAdm && (
                                        <button
                                          onClick={() => handleRemovePlayerFromTeam(pid, team.id)}
                                          className="w-7 h-7 rounded-lg text-outline hover:text-error hover:bg-error/10 flex items-center justify-center transition-all"
                                          title="Remover deste time"
                                        >
                                          <span className="material-symbols-outlined text-[15px]">close</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </React.Fragment>
                              );
                            });
                          })()
                        )}

                        {isAdm && (
                          <button
                            onClick={() => {
                              setTargetTeamForAdd(team.id);
                              setIsAddPlayerModalOpen(true);
                            }}
                            className="mt-1 py-2 px-3 rounded-xl border border-dashed border-primary-container/40 text-primary-container hover:bg-primary-container/5 font-label-md text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                          >
                            <span className="material-symbols-outlined text-[16px]">person_add</span>
                            <span>Adicionar Atleta</span>
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
                    {reserveAthletes.map(res => {
                      const isResCheckedIn = !!session.courtPresence?.[res.id];
                      return (
                        <div key={res.id} className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          isResCheckedIn
                            ? 'bg-emerald-50/50 border-emerald-500/30'
                            : 'bg-surface-container-low border-surface-container-high/40'
                        }`}>
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

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleToggleCourtPresence(res.id)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-0.5 active:scale-95 transition-all ${
                                isResCheckedIn 
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                  : 'bg-surface-container text-outline hover:text-navy-deep'
                              }`}
                              title="Clique para alternar presença física na quadra"
                            >
                              <span className="material-symbols-outlined text-[13px]">
                                {isResCheckedIn ? 'check_circle' : 'location_on'}
                              </span>
                              <span>{isResCheckedIn ? 'Na Quadra' : 'Chegou?'}</span>
                            </button>

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
                        </div>
                      );
                    })}
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
                      {sortTeamPlayerIds(t.playerIds).map(pid => {
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
                    {sortTeamPlayerIds(
                      session.teams.find(t => t.id === targetTeamId)?.playerIds || []
                    ).map(pid => {
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

      {/* MODAL 3: ENCERRAMENTO OFICIAL DA PELADA • CONFERÊNCIA DE QUEM PARTICIPOU, QUEM FALTOU E QUEM SERÁ MULTADO */}
      {isFinishModalOpen && session && (
        <div className="fixed inset-0 z-[130] bg-navy-deep/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface-container-lowest max-w-2xl w-full rounded-2xl p-4 sm:p-6 border border-surface-container-high/60 shadow-2xl flex flex-col gap-4 animate-pop-in max-h-[92vh] overflow-hidden">
            {/* Header do Modal */}
            <div className="flex items-center justify-between border-b border-surface-container-high/50 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-red-600/15 text-red-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[24px]">flag</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-base sm:text-lg text-navy-deep font-bold leading-tight">
                    Encerrar Pelada • Apuração de Faltas e Multas
                  </h3>
                  <p className="font-body-sm text-xs text-outline">
                    Confirme quem participou na quadra, quem colocou o nome e não compareceu, e quem será multado
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFinishModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {(() => {
              const convokedList = getConvokedAthletesList();
              const presentCount = convokedList.filter(({ player }) => !!attendanceMap[player.id]).length;
              const absentList = convokedList.filter(({ player }) => !attendanceMap[player.id]);
              const absentCount = absentList.length;
              const finedCount = absentList.filter(({ player }) => finedMap[player.id] !== false).length;

              return (
                <>
                  {/* Resumo Ao Vivo da Conferência */}
                  <div className="grid grid-cols-3 gap-2 shrink-0">
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                      <span className="font-scoreboard-num text-2xl text-emerald-700 leading-none block">
                        {presentCount}
                      </span>
                      <span className="text-[10px] font-bold uppercase text-emerald-900">
                        ✅ Participaram
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
                      <span className="font-scoreboard-num text-2xl text-amber-700 leading-none block">
                        {absentCount}
                      </span>
                      <span className="text-[10px] font-bold uppercase text-amber-900">
                        ❌ Não Compareceram
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-center">
                      <span className="font-scoreboard-num text-2xl text-red-700 leading-none block">
                        {finedCount}
                      </span>
                      <span className="text-[10px] font-bold uppercase text-red-900">
                        🚨 Serão Multados
                      </span>
                    </div>
                  </div>

                  {/* Configuração do Valor da Multa + Atalhos Rápidos */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-surface-container-low p-3 rounded-xl border border-surface-container-high/50 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-red-600 text-[20px]">payments</span>
                      <label className="text-xs font-bold text-navy-deep">
                        Valor da Multa por Falta (R$):
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={fineAmountValue}
                        onChange={(e) => setFineAmountValue(Math.max(0, Number(e.target.value) || 0))}
                        className="w-20 px-2.5 py-1 rounded-lg bg-white border border-surface-container-high font-headline-sm text-sm font-bold text-red-700 text-center outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          const next: Record<string, boolean> = {};
                          convokedList.forEach(({ player }) => {
                            next[player.id] = true;
                          });
                          setAttendanceMap(next);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[11px] font-bold transition-all"
                      >
                        Marcar Todos Presentes
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next: Record<string, boolean> = {};
                          const presence = session.courtPresence || {};
                          convokedList.forEach(({ player }) => {
                            next[player.id] = !!presence[player.id];
                          });
                          setAttendanceMap(next);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-navy-deep text-[11px] font-bold transition-all"
                        title="Usar exatamente quem marcou 'Na Quadra' durante a pelada"
                      >
                        Usar Check-in da Quadra
                      </button>
                    </div>
                  </div>

                  {/* Lista Rolável de Atletas para Conferência de Presença e Multa */}
                  <div className="flex flex-col gap-2 overflow-y-auto pr-1 flex-1 min-h-[220px]">
                    {convokedList.map(({ player, teamName }) => {
                      const attended = !!attendanceMap[player.id];
                      const willFine = finedMap[player.id] !== false;

                      return (
                        <div
                          key={player.id}
                          className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all ${
                            attended
                              ? 'bg-emerald-50/50 border-emerald-500/30'
                              : willFine
                                ? 'bg-red-50/80 border-red-400/50 shadow-xs'
                                : 'bg-amber-50/70 border-amber-400/50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={player.photoUrl}
                              alt={player.name}
                              className="w-9 h-9 rounded-full object-cover shrink-0 border border-surface-container-high"
                              referrerPolicy="no-referrer"
                            />
                            <div className="min-w-0">
                              <p className="font-headline-sm text-xs sm:text-sm text-navy-deep font-bold truncate">
                                {player.name}
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-bold text-outline uppercase">
                                  {player.position} • {teamName}
                                </span>
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-surface-container text-navy-deep">
                                  {player.playerType === 'mensalista' ? 'Mensalista' : 'Avulso'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Botões de Decisão: Participou vs Faltou (e se Faltou: Multar vs Isentar) */}
                          <div className="flex items-center gap-1.5 justify-end shrink-0 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setAttendanceMap(prev => ({
                                  ...prev,
                                  [player.id]: !attended
                                }));
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all active:scale-95 ${
                                attended
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-red-600 text-white shadow-xs'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                {attended ? 'check_circle' : 'cancel'}
                              </span>
                              <span>{attended ? 'Participou' : 'Não Compareceu'}</span>
                            </button>

                            {!attended && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFinedMap(prev => ({
                                    ...prev,
                                    [player.id]: !willFine
                                  }));
                                }}
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 border transition-all active:scale-95 ${
                                  willFine
                                    ? 'bg-red-100 text-red-900 border-red-300 hover:bg-red-200'
                                    : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                }`}
                                title="Definir se este atleta faltoso receberá multa + suplência ou se foi falta justificada (isento)"
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  {willFine ? 'gavel' : 'verified_user'}
                                </span>
                                <span>{willFine ? `Multar (R$ ${fineAmountValue})` : 'Isento de Multa'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Rodapé de Confirmação */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-surface-container-high/50 shrink-0 flex-wrap">
                    <span className="text-[11px] text-outline">
                      Atletas multados ficam automaticamente como <strong>Suplentes</strong> na próxima pelada.
                    </span>

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => setIsFinishModalOpen(false)}
                        className="px-4 py-2.5 rounded-xl bg-surface-container text-navy-deep font-label-md text-xs font-bold"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmFinishPelada}
                        disabled={isFinishingPelada}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-800 text-white font-headline-sm text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-lg shadow-red-900/25 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]">flag</span>
                        <span>{isFinishingPelada ? 'Encerrando...' : 'Confirmar Encerramento da Pelada'}</span>
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamBalancing;
