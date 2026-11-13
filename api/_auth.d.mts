export const FIREBASE_PROJECT_ID: string;

export interface AuthenticatedFirebaseUser {
  uid: string;
  email?: string;
  name?: string;
}

export interface AuthRequestLike {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
}

export interface AuthResponseLike {
  status(code: number): {
    json(body: unknown): unknown;
  };
}

export interface ReceiptSignatureInput {
  uid: string;
  transactionId: string;
  extractedAmount: number;
  expectedAmount: number;
  isApproved: boolean;
}

export function verifyFirebaseJwtWithCerts(
  token: string,
  certsOverride?: Record<string, string>
): Promise<AuthenticatedFirebaseUser>;

export function verifyFirebaseIdToken(token: string): Promise<AuthenticatedFirebaseUser>;

export function extractBearerToken(req: AuthRequestLike): string | null;

export function requireFirebaseAuth(
  req: AuthRequestLike,
  res: AuthResponseLike
): Promise<AuthenticatedFirebaseUser | null>;

export function getClientIp(req: AuthRequestLike): string;

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean;

export function createReceiptSignature(data: ReceiptSignatureInput): string | undefined;
