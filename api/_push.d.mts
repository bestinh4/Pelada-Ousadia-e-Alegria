export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  expirationTime?: number | null;
  keys: PushSubscriptionKeys;
}

export interface DualChannelPushInput {
  title?: string;
  body?: string;
  url?: string;
  soundPattern?: 'single' | 'double' | 'triple' | 'start' | string;
  targetStatus?: 'all' | 'pendente' | string;
  tag?: string;
  suppressWhenOpen?: boolean;
  delayMs?: number;
  subscriptions?: PushSubscriptionInput[];
  tokens?: string[];
}

export interface SanitizedPushPayload {
  safeTitle: string;
  safeBody: string;
  safeUrl: string;
  safeSound: 'single' | 'double' | 'triple' | 'start';
  safeTargetStatus: 'all' | 'pendente';
  safeTag: string;
  suppressWhenOpen: boolean;
  safeDelayMs: number;
}

export interface DualChannelPushResult {
  ok: boolean;
  sentCount: number;
  failedCount: number;
  fcmSentCount: number;
  fcmFailedCount: number;
  expiredEndpoints: string[];
  vapidErrorCount: number;
  lastPushStatusCode?: number;
  title: string;
  warning?: string;
}

export function getServerVapidPublicKey(): string;

export function isWebPushConfigured(): boolean;

export function sanitizePushPayload(input: DualChannelPushInput): SanitizedPushPayload;

export function isValidPushSubscription(sub: unknown): sub is PushSubscriptionInput;

export function sendDualChannelPush(input: DualChannelPushInput): Promise<DualChannelPushResult>;
