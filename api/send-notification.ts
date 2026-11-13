import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireFirebaseAuth, checkRateLimit, getClientIp } from './_auth.mjs';
import { sendDualChannelPush } from './_push.mjs';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    return response.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = await requireFirebaseAuth(request, response);
  if (!user) return;

  const clientIp = getClientIp(request);
  if (!checkRateLimit(`notif_${user.uid}_${clientIp}`, 30, 60000)) {
    return response.status(429).json({
      ok: false,
      error: 'Limite de envio de notificações excedido. Aguarde um minuto.',
    });
  }

  let parsedBody: any = request.body || {};
  if (typeof request.body === 'string') {
    try {
      parsedBody = JSON.parse(request.body);
    } catch {
      parsedBody = {};
    }
  }

  const { title, body } = parsedBody || {};
  if (!title || typeof title !== 'string' || !body || typeof body !== 'string') {
    return response.status(400).json({
      ok: false,
      error: 'Título e mensagem são obrigatórios e devem ser texto.',
    });
  }

  try {
    const result = await sendDualChannelPush(parsedBody);
    return response.status(200).json({
      ...result,
      success: result.ok,
      successCount: result.sentCount + result.fcmSentCount,
      failureCount: result.failedCount + result.fcmFailedCount,
    });
  } catch (error: any) {
    console.error('Error sending notification:', error?.message || error);
    return response.status(500).json({
      ok: false,
      error: 'Falha interna ao processar notificação.',
    });
  }
}
