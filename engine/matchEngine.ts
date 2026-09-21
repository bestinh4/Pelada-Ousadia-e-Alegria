
import { MatchSession } from '../types.ts';

/**
 * Processa o resultado de uma partida e retorna o novo estado da sessão.
 * Regra: O vencedor permanece como Time A. O perdedor vai para o fim da fila.
 */
export const processMatchResult = (
  session: MatchSession,
  winnerId: string | null,
  loserId: string | null
): Partial<MatchSession> => {
  const newQueue = [...session.queue];

  // O perdedor vai para o final da fila de times
  if (loserId) {
    newQueue.push(loserId);
  }

  // O próximo da fila entra como desafiante (Time B)
  const nextChallengerId = newQueue.shift() || null;

  // Atualiza estatísticas dos times na sessão
  const updatedTeams = session.teams.map(t => {
    if (t.id === winnerId) {
      return { 
        ...t, 
        totalWins: t.totalWins + 1, 
        consecutiveWins: t.consecutiveWins + 1 
      };
    }
    if (t.id === loserId) {
      return { ...t, consecutiveWins: 0 };
    }
    return t;
  });

  return {
    teams: updatedTeams,
    queue: newQueue,
    activeMatch: {
      teamAId: winnerId,
      teamBId: nextChallengerId,
      scoreA: 0,
      scoreB: 0,
      startTime: null
    }
  };
};

/**
 * Valida se uma partida atingiu o limite de gols (2).
 */
export const checkMatchEndCondition = (scoreA: number, scoreB: number): boolean => {
  return scoreA >= 2 || scoreB >= 2;
};
