import express from "express";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import webpush from "web-push";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp as initClientApp, getApps as getClientApps } from "firebase/app";
import { getFirestore as getClientFirestore, doc, getDoc } from "firebase/firestore";
import { analyzeReceiptWithGemini } from "./api/verify-receipt.ts";
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "./constants/vapid.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Segredo do Servidor: A chave privada VAPID NUNCA é enviada ao cliente ou bundle web
const SERVER_VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "nwQxXctm5wIIykYEsCXfKGbCWh8zjsvF38cJGkUiAps";

const clientFirebaseConfig = {
  apiKey: "AIzaSyBa8kF4pSrx_-GuHVT_hGMgh_UmRc0NBx0",
  authDomain: "ousadia-5b1d8.firebaseapp.com",
  projectId: "ousadia-5b1d8",
  storageBucket: "ousadia-5b1d8.firebasestorage.app",
  messagingSenderId: "812821310641",
  appId: "1:812821310641:web:d5256ab8fea0ad1323c690"
};

const clientApp = getClientApps().length === 0 ? initClientApp(clientFirebaseConfig, "server-client") : getClientApps()[0];
const clientDb = getClientFirestore(clientApp);

// Configuração do Web Push padrão W3C para notificações com app fechado
try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, SERVER_VAPID_PRIVATE_KEY);
  console.log("✅ WebPush VAPID inicializado com sucesso para entrega em background.");
} catch (vErr) {
  console.warn("⚠️ Aviso ao configurar VAPID:", vErr);
}

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
      console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT não encontrada. WebPush VAPID ativo para segundo plano.");
      admin.initializeApp({
        projectId: "ousadia-5b1d8"
      });
    }
  } catch (err) {
    console.error("❌ Erro ao inicializar Firebase Admin:", err);
  }

  // Cabeçalhos HTTP de Segurança (OWASP Best Practices)
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  app.use(express.json({ limit: "15mb" }));

  // Rate Limiting em memória para proteção contra abuso e DoS
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  const checkRateLimit = (ip: string, maxRequests: number, windowMs: number): boolean => {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= maxRequests) {
      return false;
    }
    entry.count++;
    return true;
  };

  // Limpeza periódica do mapa de rate limit
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetAt) rateLimitMap.delete(key);
    }
  }, 60000);

  // API Health Check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Imagem do Time da Semana para WhatsApp Link Preview & Redes Sociais
  app.get("/api/cover-team/image", async (req, res) => {
    try {
      const snap = await getDoc(doc(clientDb, "settings", "coverTeam"));
      if (snap.exists()) {
        const data = snap.data();
        const photoUrl = data?.photoUrl;
        if (photoUrl && typeof photoUrl === "string") {
          if (photoUrl.startsWith("data:image/")) {
            const parts = photoUrl.split(",");
            const mimeMatch = parts[0].match(/:(.*?);/);
            const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
            const buffer = Buffer.from(parts[1], "base64");
            res.set("Content-Type", mimeType);
            res.set("Cache-Control", "public, max-age=60");
            return res.send(buffer);
          } else if (photoUrl.startsWith("http")) {
            return res.redirect(photoUrl);
          }
        }
      }
      return res.sendFile(path.join(__dirname, "public", "images", "ousadia_alegria_crest.png"));
    } catch (e) {
      return res.sendFile(path.join(__dirname, "public", "images", "ousadia_alegria_crest.png"));
    }
  });

  // Disparo de Notificações Web Push com Validação e Proteção contra Spam
  app.post("/api/send-notification", async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkRateLimit(`notif_${clientIp}`, 20, 60000)) {
      return res.status(429).json({ ok: false, error: "Limite de envio de notificações excedido. Tente novamente mais tarde." });
    }

    try {
      const { title, body, url, soundPattern, subscriptions } = req.body || {};
      
      const safeTitle = typeof title === "string" ? title.slice(0, 150) : "Ousadia & Alegria";
      const safeBody = typeof body === "string" ? body.slice(0, 300) : "Atualizações na pelada!";
      const safeUrl = typeof url === "string" && (url.startsWith("/") || url.startsWith("https://")) ? url.slice(0, 200) : "/";
      const safeSound = soundPattern === "double" || soundPattern === "triple" || soundPattern === "start" ? soundPattern : "single";

      const payload = JSON.stringify({
        title: safeTitle,
        body: safeBody,
        url: safeUrl,
        soundPattern: safeSound,
        tag: "oa-notif-" + Date.now()
      });

      let sentCount = 0;
      let failedCount = 0;

      if (Array.isArray(subscriptions) && subscriptions.length > 0) {
        // Limita tamanho do lote para proteção contra sobrecarga
        const cappedSubs = subscriptions.slice(0, 200);
        console.log(`📡 Transmitindo Web Push para ${cappedSubs.length} dispositivo(s) em background...`);
        
        const promises = cappedSubs.map(async (sub) => {
          if (!sub || typeof sub !== "object" || !sub.endpoint || typeof sub.endpoint !== "string") return;
          try {
            await webpush.sendNotification(sub, payload, {
              TTL: 60 * 60 * 24, // 24 horas de retenção na fila do sistema operacional
              urgency: 'high'
            });
            sentCount++;
          } catch (pushErr: any) {
            failedCount++;
            if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
              console.log(`ℹ️ Inscrição expirada no aparelho (${pushErr.statusCode}).`);
            }
          }
        });

        await Promise.allSettled(promises);
        console.log(`✅ Web Push finalizado: ${sentCount} entregues com sucesso, ${failedCount} falhas/expiradas.`);
      }

      return res.status(200).json({
        ok: true,
        sentCount,
        failedCount,
        title: safeTitle
      });
    } catch (err: any) {
      console.error("❌ Erro no endpoint /api/send-notification:", err);
      return res.status(500).json({ ok: false, error: "Erro interno no processamento da notificação" });
    }
  });

  // Validação Segura de Comprovante Pix via Gemini Vision (Server-Side)
  app.post("/api/verify-receipt", async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkRateLimit(`receipt_${clientIp}`, 15, 60000)) {
      return res.status(429).json({ error: "Limite de tentativas excedido. Aguarde um minuto." });
    }

    const { base64Data, mimeType, expectedAmount, receiverName, pixKey, playerName } = req.body || {};
    const expectedVal = Math.max(0, Math.min(10000, Number(expectedAmount) || 40));

    try {
      if (!base64Data || typeof base64Data !== "string") {
        return res.status(400).json({ error: "Arquivo de comprovante inválido ou não enviado." });
      }

      if (base64Data.length > 20 * 1024 * 1024) {
        return res.status(413).json({ error: "Arquivo excede o limite máximo permitido de 20MB." });
      }

      const safeMime = typeof mimeType === "string" && (mimeType.startsWith("image/") || mimeType === "application/pdf")
        ? mimeType
        : "image/jpeg";

      const result = await analyzeReceiptWithGemini({
        base64Data,
        mimeType: safeMime,
        expectedAmount: expectedVal,
        receiverName: typeof receiverName === "string" ? receiverName.slice(0, 100) : undefined,
        pixKey: typeof pixKey === "string" ? pixKey.slice(0, 100) : undefined,
        playerName: typeof playerName === "string" ? playerName.slice(0, 100) : undefined,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      console.error("❌ Erro ao validar comprovante Pix com IA:", error);
      // NUNCA aprovar automaticamente em caso de falha de IA!
      const todayStr = new Date().toLocaleDateString('pt-BR');
      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      return res.status(200).json({
        isValidReceipt: false,
        isApproved: false,
        isScheduled: false,
        requiresManualReview: true,
        extractedAmount: 0,
        payerName: typeof playerName === "string" ? playerName.slice(0, 100) : "Atleta",
        receiverName: typeof receiverName === "string" ? receiverName.slice(0, 100) : "Ousadia & Alegria",
        bankName: "Comprovante Anexado",
        transactionId: "TX_" + Date.now().toString(36).toUpperCase(),
        receiptDate: todayStr,
        receiptTime: timeStr,
        summary: `Comprovante salvo para conferência manual da Diretoria`,
        rejectionReason: "Análise automática inconclusiva. O comprovante foi salvo para validação manual da Diretoria."
      });
    }
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
