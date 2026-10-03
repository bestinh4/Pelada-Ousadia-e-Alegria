import { Player } from '../types.ts';

export const MENSALISTA_DUE_DAY = 10;

/**
 * Retorna a chave do mês no formato 'YYYY-MM' (ex: '2026-10')
 */
export function getCurrentMonthKey(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Retorna o nome por extenso do mês (ex: 'Outubro', 'Novembro')
 */
export function getMonthName(d = new Date()): string {
  return d.toLocaleDateString('pt-BR', { month: 'long' });
}

export interface MensalistaPaymentInfo {
  isPaid: boolean;
  paidMonth?: string;
  isCurrentMonthPaid: boolean;
  statusText: string;
  statusBadge: 'pago' | 'no_prazo' | 'atrasado';
  deadlineDateFormatted: string;
  nextDueDateFormatted: string;
  isOverdue: boolean;
  daysRemaining: number;
}

/**
 * Calcula o status detalhado da mensalidade do atleta mensalista
 * Regra: Pagamento válido para o mês corrente; próximo mês tem até o dia 10 para pagar.
 */
export function getMensalistaPaymentInfo(player: Player, now = new Date()): MensalistaPaymentInfo {
  const currentKey = getCurrentMonthKey(now);
  const currentDay = now.getDate();
  const isPaidThisMonth = Boolean(player.monthlyPaid && (player.monthlyPaidMonth === currentKey || !player.monthlyPaidMonth));

  // Próximo vencimento (dia 10 do próximo mês)
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, MENSALISTA_DUE_DAY);
  const nextDueDateFormatted = `10 de ${nextMonthDate.toLocaleDateString('pt-BR', { month: 'long' })}`;

  // Vencimento do mês atual (dia 10 do mês atual)
  const currentMonthDueDate = new Date(now.getFullYear(), now.getMonth(), MENSALISTA_DUE_DAY);
  const deadlineDateFormatted = `10 de ${now.toLocaleDateString('pt-BR', { month: 'long' })}`;

  const isOverdue = !isPaidThisMonth && currentDay > MENSALISTA_DUE_DAY;
  const daysRemaining = Math.max(0, MENSALISTA_DUE_DAY - currentDay);

  if (isPaidThisMonth) {
    return {
      isPaid: true,
      paidMonth: player.monthlyPaidMonth || currentKey,
      isCurrentMonthPaid: true,
      statusText: `Mensalidade de ${getMonthName(now)} Paga • Próximo vencimento: ${nextDueDateFormatted}`,
      statusBadge: 'pago',
      deadlineDateFormatted,
      nextDueDateFormatted,
      isOverdue: false,
      daysRemaining: 0
    };
  }

  if (isOverdue) {
    return {
      isPaid: false,
      paidMonth: undefined,
      isCurrentMonthPaid: false,
      statusText: `Mensalidade em atraso (Venceu em ${deadlineDateFormatted})`,
      statusBadge: 'atrasado',
      deadlineDateFormatted,
      nextDueDateFormatted,
      isOverdue: true,
      daysRemaining: 0
    };
  }

  return {
    isPaid: false,
    paidMonth: undefined,
    isCurrentMonthPaid: false,
    statusText: `Aguardando pagamento até ${deadlineDateFormatted} (${daysRemaining} dia${daysRemaining === 1 ? '' : 's'} restante${daysRemaining === 1 ? '' : 's'})`,
    statusBadge: 'no_prazo',
    deadlineDateFormatted,
    nextDueDateFormatted,
    isOverdue: false,
    daysRemaining
  };
}
