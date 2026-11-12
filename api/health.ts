import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServerVapidPublicKey, isWebPushConfigured } from './_push.mjs';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    status: 'ok',
    webPushConfigured: isWebPushConfigured(),
    fcmAdminConfigured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
    vapidPublicKey: getServerVapidPublicKey(),
  });
}
