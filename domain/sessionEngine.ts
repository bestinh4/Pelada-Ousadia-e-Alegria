
import { Player, MatchSession } from './types.ts';
import { createTeamsFromConfirmedPlayers } from './teamEngine.ts';

export const initializeSession = (confirmedPlayers: Player[]): MatchSession => {
  const teams = createTeamsFromConfirmedPlayers(confirmedPlayers);
  
  const teamAId = teams[0]?.id || null;
  const teamBId = teams[1]?.id || null;
  const queue = teams.slice(2).map(t => t.id);

  return {
    id: "current",
    status: "active",
    teams: teams,
    waitingQueue: queue,
    activeMatch: {
      teamAId,
      teamBId,
      scoreA: 0,
      scoreB: 0,
      startedAt: Date.now()
    },
    createdAt: Date.now()
  };
};
