
import { Player, MatchSession } from '../types.ts';
import { generateFixedTeams } from './teamEngine.ts';

/**
 * Inicializa uma nova sessão de jogo com os jogadores presentes.
 */
export const initNewSession = (presentPlayers: Player[]): MatchSession => {
  const teams = generateFixedTeams(presentPlayers);
  const teamIds = teams.map(t => t.id);
  
  const teamAId = teamIds[0] || null;
  const teamBId = teamIds[1] || null;
  const queue = teamIds.slice(2);

  return {
    id: 'current',
    status: 'active',
    teams,
    queue,
    activeMatch: {
      teamAId,
      teamBId,
      scoreA: 0,
      scoreB: 0,
      startTime: null
    }
  };
};

/**
 * Finaliza a sessão atual.
 */
export const closeSession = (): Partial<MatchSession> => {
  return {
    status: 'inactive',
    activeMatch: {
      teamAId: null,
      teamBId: null,
      scoreA: 0,
      scoreB: 0,
      startTime: null
    },
    queue: [],
    teams: []
  };
};
