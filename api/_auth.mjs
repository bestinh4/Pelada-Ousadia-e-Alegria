import crypto from 'crypto';
import admin from 'firebase-admin';

export const FIREBASE_PROJECT_ID = 'ousadia-5b1d8';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache = null;

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLen), 'base64');
}

async function getGooglePublicCerts() {
  const now = Date.now();
  if (certCache && now < certCache.expiresAt) {
    return certCache.certs;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Falha ao obter certificados públicos do Firebase (${res.status})`);
  }

  const certs = await res.json();
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 3600;

  certCache = {
    certs,
    expiresAt: now + maxAgeSec * 1000,
  };
  return certs;
}

export async function verifyFirebaseJwtWithCerts(token, certsOverride) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token de autenticação ausente.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Formato de token inválido.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new Error('Token JWT malformado.');
  }

  if (header?.alg !== 'RS256' || typeof header?.kid !== 'string' || !header.kid) {
    throw new Error('Algoritmo ou identificador de chave inválido.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload?.aud !== FIREBASE_PROJECT_ID) {
    throw new Error('Audiência do token inválida.');
  }
  if (payload?.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('Emissor do token inválido.');
  }
  if (typeof payload?.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 128) {
    throw new Error('Subject do token inválido.');
  }
  if (typeof payload?.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  if (typeof payload?.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Data de emissão do token inválida.');
  }

  const certs = certsOverride || (await getGooglePublicCerts());
  const pem = certs[header.kid];
  if (!pem) {
    throw new Error('Chave pública correspondente ao token não encontrada.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signatureBuf = base64UrlDecode(signatureB64);
  const isValid = verifier.verify(pem, signatureBuf);
  if (!isValid) {
    throw new Error('Assinatura digital do token inválida.');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  };
}

export async function verifyFirebaseIdToken(token) {
  if (admin.apps.length > 0 && process.env.FIREBASE_SERVICE_ACCOUNT) {
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
    };
  }
  return verifyFirebaseJwtWithCerts(token);
}

export function extractBearerToken(req) {
  const header = req?.headers?.authorization || req?.headers?.Authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function requireFirebaseAuth(req, res) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Autenticação obrigatória para esta operação.' });
    return null;
  }

  try {
    const user = await verifyFirebaseIdToken(token);
    return user;
  } catch {
    res.status(401).json({
      ok: false,
      error: 'Sessão inválida ou expirada. Recarregue o aplicativo e tente novamente.',
    });
    return null;
  }
}

export function getClientIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req?.ip || req?.socket?.remoteAddress || 'unknown';
}

const rateLimitStore = new Map();

export function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  if (rateLimitStore.size > 5000) {
    for (const [k, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) rateLimitStore.delete(k);
    }
  }
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count++;
  return true;
}

export function createReceiptSignature(data) {
  const secret =
    process.env.RECEIPT_HMAC_SECRET ||
    process.env.VAPID_PRIVATE_KEY ||
    process.env.GEMINI_API_KEY ||
    '';
  if (!secret) return undefined;

  const payload = [
    data.uid,
    data.transactionId,
    Number(data.extractedAmount || 0).toFixed(2),
    Number(data.expectedAmount || 0).toFixed(2),
    data.isApproved ? '1' : '0',
  ].join('|');

  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
