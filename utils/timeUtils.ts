
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

