
export interface LateRemovalCheck {
  isLate: boolean;
  deadlineDate: Date;
  formattedDeadline: string;
}

/**
 * Regra Oficial de Cancelamento:
 * Todo atleta tem até as 18:00 do dia anterior à pelada para retirar o nome da lista.
 * Após esse horário, a desistência gera aplicação de multa automática no valor da taxa avulsa.
 */
export const checkLateRemovalDeadline = (match?: { date?: string; time?: string } | null): LateRemovalCheck => {
  const now = new Date();

  if (match?.date) {
    const parts = match.date.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);

      // Data da pelada
      const matchDay = new Date(year, month, day);
      // Dia anterior
      const previousDay = new Date(matchDay);
      previousDay.setDate(previousDay.getDate() - 1);
      previousDay.setHours(18, 0, 0, 0); // Exatamente às 18:00

      const formattedDeadline = previousDay.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long'
      }) + ' às 18:00';

      return {
        isLate: now.getTime() > previousDay.getTime(),
        deadlineDate: previousDay,
        formattedDeadline
      };
    }
  }

  // Fallback se não houver data explícita (padrão de pelada no fim de semana)
  const day = now.getDay();
  const hour = now.getHours();
  const isLate = (day === 6 && hour >= 18) || day === 0;

  return {
    isLate,
    deadlineDate: now,
    formattedDeadline: 'às 18:00 do dia anterior à pelada'
  };
};

export const isLateRemovalTime = (match?: { date?: string; time?: string } | null): boolean => {
  return checkLateRemovalDeadline(match).isLate;
};

export interface MatchEveInfo {
  isEve: boolean;
  isMatchDay: boolean;
  eveDateKey: string;
  formattedMatchDate: string;
  matchTime: string;
}

/**
 * Verifica se hoje é a véspera da pelada para disparo automático de lembretes push
 * aos atletas que ainda estão com status 'pendente'.
 */
export const checkMatchEveInfo = (match?: { date?: string; time?: string } | null): MatchEveInfo => {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const matchTime = match?.time || '07:30';

  if (match?.date) {
    const parts = match.date.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);

      const matchDay = new Date(year, month, day, 12, 0, 0);
      const eveDay = new Date(matchDay);
      eveDay.setDate(eveDay.getDate() - 1);

      const eveKey = `${eveDay.getFullYear()}-${String(eveDay.getMonth() + 1).padStart(2, '0')}-${String(eveDay.getDate()).padStart(2, '0')}`;
      const matchKey = `${matchDay.getFullYear()}-${String(matchDay.getMonth() + 1).padStart(2, '0')}-${String(matchDay.getDate()).padStart(2, '0')}`;

      const formattedMatchDate = matchDay.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long'
      });

      return {
        isEve: todayKey === eveKey,
        isMatchDay: todayKey === matchKey,
        eveDateKey: eveKey,
        formattedMatchDate,
        matchTime
      };
    }
  }

  // Fallback padrão: Pelada no Domingo -> Véspera no Sábado (day === 6)
  const dayOfWeek = now.getDay();
  return {
    isEve: dayOfWeek === 6,
    isMatchDay: dayOfWeek === 0,
    eveDateKey: todayKey,
    formattedMatchDate: 'neste fim de semana',
    matchTime
  };
};


