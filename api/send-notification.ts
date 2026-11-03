import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, url, targetStatus } = request.body || {};

  if (!title || typeof title !== 'string' || !body || typeof body !== 'string') {
    return response.status(400).json({ error: 'Título e mensagem são obrigatórios e devem ser texto.' });
  }

  const safeTitle = title.slice(0, 150);
  const safeBody = body.slice(0, 300);
  const safeUrl = typeof url === 'string' && (url.startsWith('/') || url.startsWith('https://')) ? url.slice(0, 200) : '/';
  const safeTargetStatus = targetStatus === 'pendente' ? 'pendente' : 'all';

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return response.status(500).json({ error: 'Configuração do servidor de notificações indisponível.' });
  }

  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    const db = admin.firestore();
    const messaging = admin.messaging();

    // Buscar todos os tokens de push dos jogadores (filtrando por status pendente quando solicitado)
    const playersSnap = await db.collection("players").where("pushEnabled", "==", true).get();
    const tokens: string[] = [];
    
    playersSnap.forEach(pDoc => {
      const pData = pDoc.data();
      if (safeTargetStatus === 'pendente') {
        const st = pData.status || 'pendente';
        if (st !== 'pendente') return;
      }
      if (pData.fcmToken && typeof pData.fcmToken === 'string') {
        tokens.push(pData.fcmToken);
      }
    });

    if (tokens.length === 0) {
      return response.status(200).json({ message: 'No tokens found' });
    }

    const message = {
      notification: { title: safeTitle, body: safeBody },
      data: { url: safeUrl },
      tokens: tokens.slice(0, 500), // Proteção contra estouro de limites do FCM
    };

    const result = await messaging.sendEachForMulticast(message);
    
    return response.status(200).json({ 
      success: true, 
      successCount: result.successCount,
      failureCount: result.failureCount 
    });
  } catch (error: any) {
    console.error('Error sending notification:', error?.message || error);
    return response.status(500).json({ error: 'Falha interna ao processar notificação.' });
  }
}
