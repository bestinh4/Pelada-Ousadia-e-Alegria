import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  verifyFirebaseJwtWithCerts,
  requireFirebaseAuth,
  checkRateLimit,
  createReceiptSignature,
  FIREBASE_PROJECT_ID,
} from '../api/_auth.mjs';
import webpush from 'web-push';
import {
  sanitizePushPayload,
  isValidPushSubscription,
  sendDualChannelPush,
  getServerVapidPublicKey,
  isWebPushConfigured,
} from '../api/_push.mjs';
import verifyReceiptHandler from '../api/verify-receipt.ts';
import sendNotificationHandler from '../api/send-notification.ts';
import { VAPID_PUBLIC_KEY, isValidVapidPublicKey } from '../constants/vapid.ts';

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createSignedJwt(
  payloadOverrides: Record<string, any>,
  privateKeyPem: string,
  kid = 'test-kid-1'
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const payload = {
    aud: FIREBASE_PROJECT_ID,
    iss: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    sub: 'athlete-uid-123',
    email: 'atleta@teste.com',
    iat: now - 10,
    exp: now + 3600,
    ...payloadOverrides,
  };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${headerB64}.${payloadB64}`);
  signer.end();
  const sig = signer.sign(privateKeyPem);
  return `${headerB64}.${payloadB64}.${b64url(sig)}`;
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

test('Auth: verifies valid RS256 Firebase JWT and rejects tampered/expired tokens', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const certs = { 'test-kid-1': publicKey };

  const validJwt = createSignedJwt({}, privateKey);
  const verified = await verifyFirebaseJwtWithCerts(validJwt, certs);
  assert.equal(verified.uid, 'athlete-uid-123');
  assert.equal(verified.email, 'atleta@teste.com');

  const expiredJwt = createSignedJwt({ exp: Math.floor(Date.now() / 1000) - 60 }, privateKey);
  await assert.rejects(() => verifyFirebaseJwtWithCerts(expiredJwt, certs), /expirada/i);

  const wrongAudJwt = createSignedJwt({ aud: 'other-project' }, privateKey);
  await assert.rejects(() => verifyFirebaseJwtWithCerts(wrongAudJwt, certs), /Audiência/i);

  const tamperedJwt = validJwt.slice(0, -4) + 'AAAA';
  await assert.rejects(() => verifyFirebaseJwtWithCerts(tamperedJwt, certs), /Assinatura/i);
});

test('API Security: /api/send-notification and /api/verify-receipt reject unauthenticated calls with 401', async () => {
  const res1 = createMockRes();
  const authResult = await requireFirebaseAuth({ headers: {} }, res1);
  assert.equal(authResult, null);
  assert.equal(res1.statusCode, 401);

  const res2 = createMockRes();
  await sendNotificationHandler({ method: 'POST', headers: {}, body: { title: 'Hi', body: 'Test' } } as any, res2);
  assert.equal(res2.statusCode, 401);

  const res3 = createMockRes();
  await verifyReceiptHandler({ method: 'POST', headers: {}, body: {} }, res3);
  assert.equal(res3.statusCode, 401);
});

test('Rate Limit: blocks excess calls and isolates per key', () => {
  const keyA = `test_rate_${Date.now()}_A`;
  const keyB = `test_rate_${Date.now()}_B`;
  assert.equal(checkRateLimit(keyA, 2, 10000), true);
  assert.equal(checkRateLimit(keyA, 2, 10000), true);
  assert.equal(checkRateLimit(keyA, 2, 10000), false);
  assert.equal(checkRateLimit(keyB, 2, 10000), true);
});

test('Push Validation & Sanitization: rejects unsafe URLs, HTTP endpoints, and oversized fields', async () => {
  const sanitized = sanitizePushPayload({
    title: 'A'.repeat(300),
    body: 'B'.repeat(500),
    url: 'javascript:alert(1)',
    soundPattern: 'malicious',
    delayMs: 999999,
  });

  assert.equal(sanitized.safeTitle.length, 150);
  assert.equal(sanitized.safeBody.length, 300);
  assert.equal(sanitized.safeUrl, '/');
  assert.equal(sanitized.safeSound, 'single');
  assert.equal(sanitized.safeDelayMs, 8000);

  assert.equal(
    isValidPushSubscription({
      endpoint: 'http://insecure.example.com/push',
      keys: { p256dh: 'abc', auth: 'def' },
    }),
    false
  );
  assert.equal(
    isValidPushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
      keys: { p256dh: 'abc', auth: 'def' },
    }),
    true
  );

  const result = await sendDualChannelPush({
    title: 'Teste',
    body: 'Corpo',
    subscriptions: [],
    tokens: [],
  });
  assert.equal(result.sentCount, 0);
});

test('VAPID Public Key & Secret Hygiene: no old fallback key, valid 65-byte EC point check, and dynamic env rotation', () => {
  const oldHardcodedPublicKey = 'BIXN8KDG-7IS82_ykSdcgndt1wyVaWnz0Y5TLBAPWSJRhbPXV5sHpN2TxxhwA3ZwdOUbVPjhYxFmenwVciZN2xE';
  const constantsSource = fs.readFileSync(path.join(process.cwd(), 'constants', 'vapid.ts'), 'utf8');
  const swSource = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
  const pushSource = fs.readFileSync(path.join(process.cwd(), 'api', '_push.mjs'), 'utf8');
  const serverSource = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

  assert.equal(constantsSource.includes(oldHardcodedPublicKey), false);
  assert.equal(swSource.includes(oldHardcodedPublicKey), false);
  assert.equal(pushSource.includes(oldHardcodedPublicKey), false);
  assert.equal(serverSource.includes('nwQxXctm5wIIykYEsCXfKGbCWh8zjsvF38cJGkUiAps'), false);

  assert.equal(isValidVapidPublicKey('invalid-key'), false);

  const prevPriv = process.env.VAPID_PRIVATE_KEY;
  const prevPub = process.env.VAPID_PUBLIC_KEY;
  try {
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    assert.equal(isWebPushConfigured(), false);
    assert.equal(getServerVapidPublicKey(), '');

    const generated = webpush.generateVAPIDKeys();
    assert.equal(isValidVapidPublicKey(generated.publicKey), true);

    process.env.VAPID_PUBLIC_KEY = generated.publicKey;
    process.env.VAPID_PRIVATE_KEY = generated.privateKey;
    assert.equal(getServerVapidPublicKey(), generated.publicKey);
    assert.equal(isWebPushConfigured(), true);
  } finally {
    if (prevPriv === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = prevPriv;
    if (prevPub === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = prevPub;
  }

  assert.equal(typeof VAPID_PUBLIC_KEY, 'string');
});

test('Receipt HMAC Signature: deterministic when secret is present', () => {
  const prevSecret = process.env.RECEIPT_HMAC_SECRET;
  process.env.RECEIPT_HMAC_SECRET = 'unit-test-hmac-secret';
  const sig1 = createReceiptSignature({
    transactionId: 'E1234567890',
    extractedAmount: 40,
    expectedAmount: 40,
    isApproved: true,
    uid: 'uid-1',
  });
  const sig2 = createReceiptSignature({
    transactionId: 'E1234567890',
    extractedAmount: 40,
    expectedAmount: 40,
    isApproved: true,
    uid: 'uid-1',
  });
  assert.ok(sig1 && sig1.length === 64);
  assert.equal(sig1, sig2);
  if (prevSecret === undefined) {
    delete process.env.RECEIPT_HMAC_SECRET;
  } else {
    process.env.RECEIPT_HMAC_SECRET = prevSecret;
  }
});

test('Firestore Rules Audit: enforces RBAC on matches, players, expenses, notifications, and lateRemovals', () => {
  const rules = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
  assert.equal(/match\s+\/matches\/\{matchId\}[\s\S]*allow\s+update:\s+if\s+isAuthenticated\(\)/.test(rules), false);
  assert.match(rules, /match\s+\/matches\/\{matchId\}[\s\S]*allow\s+create,\s*update,\s*delete:\s+if\s+isAdmin\(\)/);
  assert.match(rules, /hasAny\(\['role',\s*'playerType'\]\)/);
  assert.match(rules, /hasAny\(\['goals',\s*'assists',\s*'concededGoals'/);
  assert.match(rules, /match\s+\/expenses\/\{expenseId\}[\s\S]*allow\s+read,\s*write:\s+if\s+isAdmin\(\)/);
  assert.match(rules, /match\s+\/lateRemovals\/\{removalId\}[\s\S]*request\.resource\.data\.playerId\s*==\s*request\.auth\.uid/);
  assert.match(rules, /allow\s+read,\s*write:\s+if\s+false;/);
});

test('Service Worker, 410/404 vs 401/403 Separation & Pelada Business Rules Regression Check', () => {
  const sw = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
  assert.equal(sw.includes('importScripts('), false);
  assert.equal(sw.includes('?v=21'), false);
  assert.match(sw, /ICON_VERSION\s*=\s*'v20'/);
  assert.match(sw, /SET_VAPID_PUBLIC_KEY/);
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /addEventListener\('pushsubscriptionchange'/);
  assert.match(sw, /addEventListener\('periodicsync'/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(sw, /oa-shared-receipt-cache/);

  const pushSrc = fs.readFileSync(path.join(process.cwd(), 'api', '_push.mjs'), 'utf8');
  assert.match(pushSrc, /statusCode === 410 \|\| statusCode === 404/);
  assert.match(pushSrc, /statusCode === 401 \|\| statusCode === 403/);
  assert.match(pushSrc, /vapidErrorCount\+\+/);

  const playerList = fs.readFileSync(path.join(process.cwd(), 'pages', 'PlayerList.tsx'), 'utf8');
  assert.match(playerList, /gkSlots\s*=\s*4/);
  assert.match(playerList, /fieldSlots\s*=\s*match\?\.fieldSlots[\s\S]*:\s*30/);
  assert.match(playerList, /Granja Cantinho do Céu/);
});
