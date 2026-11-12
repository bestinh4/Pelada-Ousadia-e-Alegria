import express from "express";
import admin from "firebase-admin";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp as initClientApp, getApps as getClientApps } from "firebase/app";
import { getFirestore as getClientFirestore, doc, getDoc } from "firebase/firestore";
import { analyzeReceiptWithGemini } from "./api/verify-receipt.ts";
import { requireFirebaseAuth, checkRateLimit, getClientIp, createReceiptSignature } from "./api/_auth.mjs";
import { sendDualChannelPush } from "./api/_push.mjs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

if (!process.env.VAPID_PRIVATE_KEY) {
  console.warn("⚠️ VAPID_PRIVATE_KEY não configurada nas variáveis de ambiente. Configure no .env ou na Vercel para habilitar envio Web Push em background.");
} else {
  console.log("✅ WebPush VAPID pronto para entrega em background.");
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: "ousadia-5b1d8"
        });
      }
    } else {
      console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT não encontrada. Autenticação de API via certificados públicos Firebase ativa.");
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

  // API Health Check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      webPushConfigured: Boolean(process.env.VAPID_PRIVATE_KEY),
      fcmAdminConfigured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
    });
  });

  // Imagem do Time da Semana para WhatsApp Link Preview & Redes Sociais
  app.get("/api/cover-team/image", async (_req, res) => {
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
          } else if (photoUrl.startsWith("https://")) {
            return res.redirect(photoUrl);
          }
        }
      }
      return res.sendFile(path.join(__dirname, "public", "images", "ousadia_alegria_crest.png"));
    } catch {
      return res.sendFile(path.join(__dirname, "public", "images", "ousadia_alegria_crest.png"));
    }
  });

  // Disparo Autenticado de Notificações (Web Push W3C + FCM Dual-Channel)
  app.post("/api/send-notification", async (req, res) => {
    const user = await requireFirebaseAuth(req, res);
    if (!user) return;

    const clientIp = getClientIp(req);
    if (!checkRateLimit(`notif_${user.uid}_${clientIp}`, 30, 60000)) {
      return res.status(429).json({ ok: false, error: "Limite de envio de notificações excedido. Tente novamente mais tarde." });
    }

    try {
      const result = await sendDualChannelPush(req.body || {});
      return res.status(200).json(result);
    } catch (err: any) {
      console.error("❌ Erro no endpoint /api/send-notification:", err);
      return res.status(500).json({ ok: false, error: "Erro interno no processamento da notificação" });
    }
  });

  // Validação Autenticada de Comprovante Pix via Gemini Vision (Server-Side)
  app.post("/api/verify-receipt", async (req, res) => {
    const user = await requireFirebaseAuth(req, res);
    if (!user) return;

    const clientIp = getClientIp(req);
    if (!checkRateLimit(`receipt_${user.uid}_${clientIp}`, 15, 60000)) {
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

      const verificationSignature = createReceiptSignature({
        transactionId: result.transactionId || '',
        extractedAmount: result.extractedAmount || 0,
        expectedAmount: expectedVal,
        isApproved: Boolean(result.isApproved),
        uid: user.uid,
      });

      return res.status(200).json({
        ...result,
        verifiedByUid: user.uid,
        ...(verificationSignature ? { verificationSignature } : {}),
      });
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
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor Full-Stack rodando em http://localhost:${PORT}`);
  });
}

startServer();
