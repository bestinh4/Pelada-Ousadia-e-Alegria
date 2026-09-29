import { PixConfig } from '../types.ts';

export const DEFAULT_PIX_CONFIG: PixConfig = {
  pixKey: 'diiogo49@gmail.com',
  pixKeyType: 'email',
  receiverName: 'OUSADIA E ALEGRIA',
  receiverCity: 'BRASIL',
  bankLabel: 'Pix Oficial da Pelada'
};

function sanitizePixText(input: string, maxLen: number): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, maxLen);
}

function formatEmvField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function computeCRC16(payload: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function normalizePixKey(rawKey: string, keyType: PixConfig['pixKeyType']): string {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) return DEFAULT_PIX_CONFIG.pixKey;

  if (keyType === 'cpf' || keyType === 'cnpj') {
    return trimmed.replace(/\D/g, '');
  }

  if (keyType === 'phone') {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) {
      return `+${digits}`;
    }
    return `+55${digits}`;
  }

  if (keyType === 'email') {
    return trimmed.toLowerCase();
  }

  return trimmed;
}

/**
 * Gera o código "Pix Copia e Cola" oficial (Padrão EMV® QRCPS-MPM do Banco Central)
 */
export function generatePixPayload(params: {
  pixKey: string;
  pixKeyType?: PixConfig['pixKeyType'];
  receiverName: string;
  receiverCity: string;
  amount: number;
  txid?: string;
  description?: string;
}): string {
  const cleanKey = normalizePixKey(params.pixKey, params.pixKeyType || 'email');
  const cleanName = sanitizePixText(params.receiverName || 'OUSADIA E ALEGRIA', 25) || 'OUSADIA E ALEGRIA';
  const cleanCity = sanitizePixText(params.receiverCity || 'BRASIL', 15) || 'BRASIL';
  const cleanTxid = (params.txid || 'PELADAOA')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 25) || '***';

  const gui = formatEmvField('00', 'br.gov.bcb.pix');
  const keyField = formatEmvField('01', cleanKey);
  const descText = params.description ? sanitizePixText(params.description, 25) : '';
  const descField = descText ? formatEmvField('02', descText) : '';
  const merchantAccountInfo = formatEmvField('26', `${gui}${keyField}${descField}`);

  const merchantCategoryCode = formatEmvField('52', '0000');
  const transactionCurrency = formatEmvField('53', '986');
  const amountStr = params.amount > 0 ? params.amount.toFixed(2) : '';
  const transactionAmount = amountStr ? formatEmvField('54', amountStr) : '';
  const countryCode = formatEmvField('58', 'BR');
  const merchantName = formatEmvField('59', cleanName);
  const merchantCity = formatEmvField('60', cleanCity);
  const additionalDataField = formatEmvField('62', formatEmvField('05', cleanTxid));

  const payloadWithoutCrc =
    formatEmvField('00', '01') +
    merchantAccountInfo +
    merchantCategoryCode +
    transactionCurrency +
    transactionAmount +
    countryCode +
    merchantName +
    merchantCity +
    additionalDataField +
    '6304';

  const crc = computeCRC16(payloadWithoutCrc);
  return `${payloadWithoutCrc}${crc}`;
}
