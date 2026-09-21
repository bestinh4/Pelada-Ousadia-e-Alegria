
import { Player, Team } from './types.ts';

export const createTeamsFromConfirmedPlayers = (players: Player[]): Team[] => {
  const gks = players.filter(p => p.position === 'Goleiro');
  const field = players.filter(p => p.position !== 'Goleiro');
  
  const playersPerTeam = 7;
  const numTeams = Math.ceil((field.length + gks.length) / playersPerTeam);
  
  const teams: Team[] = [];
  let fieldIdx = 0;
  let gkIdx = 0;

  for (let i = 0; i < numTeams; i++) {
    const teamPlayers: string[] = [];
    let hasGK = false;

    // 1. Tenta adicionar 1 goleiro
    if (gkIdx < gks.length) {
      teamPlayers.push(gks[gkIdx].id);
      hasGK = true;
      gkIdx++;
    }

    // 2. Preenche com jogadores de linha até completar o time (ou acabarem os jogadores)
    while (teamPlayers.length < playersPerTeam && fieldIdx < field.length) {
      teamPlayers.push(field[fieldIdx].id);
      fieldIdx++;
    }

    teams.push({
      id: `team_${Date.now()}_${i}`,
      name: `Time ${String.fromCharCode(65 + i)}`,
      playerIds: teamPlayers,
      hasGoalkeeper: hasGK,
      consecutiveWins: 0,
      totalWins: 0,
      isIncomplete: teamPlayers.length < playersPerTeam
    });
  }

  return teams;
};
