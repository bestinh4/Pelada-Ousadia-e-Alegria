
import { Player, Team } from '../types.ts';

/**
 * Gera os times fixos para a sessão da noite.
 * Regra: Máximo de times completos (7 jogadores: 6 linha + 1 GK).
 * Não improvisa goleiros.
 */
export const generateFixedTeams = (confirmedPlayers: Player[]): Team[] => {
  const gks = confirmedPlayers.filter(p => p.position === 'Goleiro');
  const field = confirmedPlayers.filter(p => p.position !== 'Goleiro');
  
  const playersPerTeam = 7;
  const totalPlayers = confirmedPlayers.length;
  const numTeams = Math.ceil(totalPlayers / playersPerTeam);

  const teams: Team[] = [];
  let fieldIdx = 0;
  let gkIdx = 0;

  for (let i = 0; i < numTeams; i++) {
    const teamPlayerIds: string[] = [];
    let hasGK = false;

    // 1. Tenta colocar um goleiro (sempre o primeiro slot se disponível)
    if (gkIdx < gks.length) {
      teamPlayerIds.push(gks[gkIdx].id);
      hasGK = true;
      gkIdx++;
    }

    // 2. Preenche o restante com jogadores de linha até 7 ou acabar os jogadores
    while (teamPlayerIds.length < playersPerTeam && fieldIdx < field.length) {
      teamPlayerIds.push(field[fieldIdx].id);
      fieldIdx++;
    }

    // 3. Se ainda houver espaço e acabaram os de linha, mas sobraram goleiros,
    // goleiros extras entram na linha (opcional, mas aqui seguimos a regra de não improvisar)
    // Mas se o sistema for rígido e sobrar jogadores, eles formam o time incompleto.

    teams.push({
      id: `team-${i + 1}`,
      name: `Time ${String.fromCharCode(65 + i)}`, // Time A, B, C...
      playerIds: teamPlayerIds,
      hasGK: hasGK,
      isComplete: teamPlayerIds.length === playersPerTeam,
      consecutiveWins: 0,
      totalWins: 0
    });
  }

  return teams;
};
