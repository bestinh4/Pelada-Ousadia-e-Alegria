// Chaves públicas e privadas VAPID para Web Push padrão W3C
// Permite entrega de notificações push em segundo plano (background) com o aplicativo completamente fechado.

export const VAPID_PUBLIC_KEY = "BIXN8KDG-7IS82_ykSdcgndt1wyVaWnz0Y5TLBAPWSJRhbPXV5sHpN2TxxhwA3ZwdOUbVPjhYxFmenwVciZN2xE";
export const VAPID_PRIVATE_KEY = (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.VAPID_PRIVATE_KEY) || "nwQxXctm5wIIykYEsCXfKGbCWh8zjsvF38cJGkUiAps";
export const VAPID_SUBJECT = "mailto:diiogo49@gmail.com";
