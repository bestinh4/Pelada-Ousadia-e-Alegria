// Chave pública VAPID lida exclusivamente da configuração do ambiente (VITE_VAPID_PUBLIC_KEY).
// Sem fallback antigo hardcoded para evitar divergência com o servidor.

const rawViteVapidKey =
  typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY
    ? String((import.meta as any).env.VITE_VAPID_PUBLIC_KEY)
    : '';

export const VAPID_PUBLIC_KEY = rawViteVapidKey.trim().replace(/^["']|["']$/g, '');
export const VAPID_SUBJECT = 'mailto:diiogo49@gmail.com';

export function isValidVapidPublicKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  try {
    const clean = key.trim().replace(/^["']|["']$/g, '');
    const pad = '='.repeat((4 - (clean.length % 4)) % 4);
    const b64 = (clean + pad).replace(/-/g, '+').replace(/_/g, '/');
    const binary =
      typeof atob === 'function'
        ? atob(b64)
        : (globalThis as any).Buffer.from(b64, 'base64').toString('binary');
    return binary.length === 65 && binary.charCodeAt(0) === 0x04;
  } catch {
    return false;
  }
}
