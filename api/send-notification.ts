import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, url } = request.body;

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return response.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT not configured' });
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

    // Buscar todos os tokens de push dos jogadores
    const playersSnap = await db.collection("players").where("pushEnabled", "==", true).get();
    const tokens: string[] = [];
    
    playersSnap.forEach(pDoc => {
      const pData = pDoc.data();
      if (pData.fcmToken) {
        tokens.push(pData.fcmToken);
      }
    });

    if (tokens.length === 0) {
      return response.status(200).json({ message: 'No tokens found' });
    }

    const message = {
      notification: { title, body },
      data: { url: url || "/" },
      tokens: tokens,
    };

    const result = await messaging.sendEachForMulticast(message);
    
    return response.status(200).json({ 
      success: true, 
      successCount: result.successCount,
      failureCount: result.failureCount 
    });
  } catch (error: any) {
    console.error('Error sending notification:', error);
    return response.status(500).json({ error: error.message });
  }
}
