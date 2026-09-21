
import { MatchSession, Team } from './types.ts';

export const registerGoal = (session: MatchSession, side: 'A' | 'B'): MatchSession => {
  if (!session.activeMatch) return session;
  
  return {
    ...session,
    activeMatch: {
      ...session.activeMatch,
      scoreA: side === 'A' ? session.activeMatch.scoreA + 1 : session.activeMatch.scoreA,
      scoreB: side === 'B' ? session.activeMatch.scoreB + 1 : session.activeMatch.scoreB,
    }
  };
};

export const finishMatch = (
  session: MatchSession, 
  winnerTeamId: string, 
  loserTeamId: string | null
): MatchSession => {
  const newQueue = [...session.waitingQueue];
  
  // Perdedor vai para o final da fila
  if (loserTeamId) {
    newQueue.push(loserTeamId);
  }

  // Atualiza estatísticas dos times na sessão
  const updatedTeams = session.teams.map(t => {
    if (t.id === winnerTeamId) {
      return { 
        ...t, 
        totalWins: t.totalWins + 1, 
        consecutiveWins: t.consecutiveWins + 1 
      };
    }
    if (t.id === loserTeamId) {
      return { ...t, consecutiveWins: 0 };
    }
    return t;
  });

  // Próximo desafiante
  const nextChallengerId = newQueue.shift() || null;

  return {
    ...session,
    teams: updatedTeams,
    waitingQueue: newQueue,
    activeMatch: {
      teamAId: winnerTeamId, // Vencedor fica
      teamBId: nextChallengerId, // Novo desafiante
      scoreA: 0,
      scoreB: 0,
      startedAt: Date.now()
    }
  };
};
