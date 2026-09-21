import express from "express";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Inicializar Firebase Admin
  // Tenta usar as credenciais do ambiente ou inicializa com o projeto padrão
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: "ousadia-5b1d8"
      });
    } else {
      console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT não encontrada. Notificações em background podem não funcionar.");
      admin.initializeApp({
        projectId: "ousadia-5b1d8"
      });
    }
  } catch (err) {
    console.error("❌ Erro ao inicializar Firebase Admin:", err);
  }

  const db = admin.firestore();
  const messaging = admin.messaging();

  // Listener para novas notificações no Firestore
  // Quando um novo documento é adicionado à coleção 'notifications', enviamos via FCM
  db.collection("notifications").orderBy("createdAt", "desc").limit(1).onSnapshot(async (snapshot) => {
    if (snapshot.empty) return;
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    
    // Evita enviar notificações antigas (mais de 1 minuto)
    const createdAt = new Date(data.createdAt).getTime();
    if (Date.now() - createdAt > 60000) return;

    console.log("🔔 Nova notificação detectada no Firestore:", data.title);

    // Buscar todos os tokens de push dos jogadores
    const playersSnap = await db.collection("players").where("pushEnabled", "==", true).get();
    const tokens: string[] = [];
    
    playersSnap.forEach(pDoc => {
      const pData = pDoc.data();
      if (pData.fcmToken) {
        tokens.push(pData.fcmToken);
      }
    });

    if (tokens.length > 0) {
      console.log(`🚀 Enviando push para ${tokens.length} dispositivos...`);
      const message = {
        notification: {
          title: data.title,
          body: data.body,
        },
        data: {
          url: "/",
        },
        tokens: tokens,
      };

      try {
        const response = await messaging.sendEachForMulticast(message);
        console.log(`✅ ${response.successCount} notificações enviadas com sucesso.`);
        
        // Limpar tokens inválidos
        if (response.failureCount > 0) {
          const failedTokens: string[] = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              failedTokens.push(tokens[idx]);
            }
          });
          console.log(`🗑️ Removendo ${failedTokens.length} tokens inválidos.`);
          // Aqui poderíamos remover os tokens do Firestore
        }
      } catch (error) {
        console.error("❌ Erro ao enviar via FCM:", error);
      }
    }
  });

  app.use(express.json());

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware para desenvolvimento
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor Full-Stack rodando em http://localhost:${PORT}`);
  });
}

startServer();
