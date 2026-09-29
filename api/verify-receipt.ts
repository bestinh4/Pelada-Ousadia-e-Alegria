import { GoogleGenAI, Type } from "@google/genai";

export interface VerifyReceiptInput {
  base64Data: string;
  mimeType: string;
  expectedAmount: number;
  receiverName?: string;
  pixKey?: string;
  playerName?: string;
}

export interface VerifyReceiptOutput {
  isValidReceipt: boolean;
  isApproved: boolean;
  isScheduled: boolean;
  extractedAmount: number;
  payerName: string;
  receiverName: string;
  bankName: string;
  transactionId: string;
  receiptDate: string;
  receiptTime: string;
  summary: string;
  rejectionReason?: string;
}

export async function analyzeReceiptWithGemini(input: VerifyReceiptInput): Promise<VerifyReceiptOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Chave GEMINI_API_KEY não configurada no servidor.");
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const cleanBase64 = input.base64Data.includes(",")
    ? input.base64Data.split(",")[1]
    : input.base64Data;

  const prompt = `Você é o auditor financeiro oficial da pelada "Ousadia & Alegria".
Analise a imagem ou documento enviado e verifique se trata-se de um COMPROVANTE DE PAGAMENTO PIX ou TRANSFERÊNCIA BANCÁRIA válido e efetivado.

Dados esperados da cobrança:
- Atleta: ${input.playerName || "Atleta"}
- Valor esperado a pagar: R$ ${Number(input.expectedAmount || 0).toFixed(2)}
- Recebedor / Chave Pix oficial configurada: ${input.receiverName || "Ousadia & Alegria"} (${input.pixKey || ""})

Regras de validação:
1. Verifique se a imagem realmente é um comprovante de pagamento Pix ou transferência bancária concluída.
2. Verifique se NÃO é apenas um AGENDAMENTO ("isScheduled": true se estiver escrito Agendado / Agendamento). Comprovantes agendados NÃO são aprovados.
3. Extraia o valor numérico exato pago no comprovante ("extractedAmount", exemplo: 40.00).
4. Para aprovar automaticamente ("isApproved": true):
   - "isValidReceipt" deve ser true
   - "isScheduled" deve ser false
   - O valor extraído ("extractedAmount") deve ser maior ou igual a R$ ${(Number(input.expectedAmount || 0) - 0.5).toFixed(2)} (tolerância de centavos).
5. Caso reprovado, explique de forma clara e curta em português no campo "rejectionReason" (ex: "O valor do comprovante (R$ 20,00) é menor que o valor da cobrança (R$ 40,00)." ou "Este comprovante é um agendamento e ainda não foi efetivado." ou "A imagem enviada não parece ser um comprovante Pix válido.").
6. No campo "summary", escreva um resumo curto em português (ex: "Pix de R$ 40,00 confirmado • Nubank • 29/09 às 19:45").`;

  const requestConfig = {
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: input.mimeType || "image/jpeg",
            data: cleanBase64,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isValidReceipt: {
            type: Type.BOOLEAN,
            description: "True se a imagem/PDF for um comprovante bancário/Pix real.",
          },
          isScheduled: {
            type: Type.BOOLEAN,
            description: "True se for apenas um agendamento e não um pagamento já realizado.",
          },
          isApproved: {
            type: Type.BOOLEAN,
            description: "True se for comprovante válido, não agendado e com valor compatível ao esperado.",
          },
          extractedAmount: {
            type: Type.NUMBER,
            description: "Valor numérico extraído do comprovante em reais (ex: 40).",
          },
          payerName: {
            type: Type.STRING,
            description: "Nome do pagador identificado no comprovante, ou vazio se não constar.",
          },
          receiverName: {
            type: Type.STRING,
            description: "Nome do recebedor/favorecido identificado no comprovante.",
          },
          bankName: {
            type: Type.STRING,
            description: "Instituição financeira/banco do comprovante (ex: Nubank, Itaú, Inter, Santander, PicPay).",
          },
          transactionId: {
            type: Type.STRING,
            description: "ID da transação Pix (E2E ID) ou código de autenticação, se visível.",
          },
          receiptDate: {
            type: Type.STRING,
            description: "Data do pagamento mostrada no comprovante (ex: 29/09/2026).",
          },
          receiptTime: {
            type: Type.STRING,
            description: "Horário do pagamento mostrado no comprovante (ex: 19:42).",
          },
          summary: {
            type: Type.STRING,
            description: "Resumo curto do comprovante validado.",
          },
          rejectionReason: {
            type: Type.STRING,
            description: "Motivo em português caso isApproved seja false.",
          },
        },
        required: [
          "isValidReceipt",
          "isScheduled",
          "isApproved",
          "extractedAmount",
          "payerName",
          "receiverName",
          "bankName",
          "transactionId",
          "receiptDate",
          "receiptTime",
          "summary",
        ],
      },
    },
  };

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      ...requestConfig,
    });
  } catch {
    response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      ...requestConfig,
    });
  }

  const rawText = response.text || "{}";
  const parsed = JSON.parse(rawText) as VerifyReceiptOutput;
  return parsed;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { base64Data, mimeType, expectedAmount, receiverName, pixKey, playerName } = req.body || {};
    if (!base64Data) {
      return res.status(400).json({ error: "Comprovante não enviado." });
    }

    const result = await analyzeReceiptWithGemini({
      base64Data,
      mimeType: mimeType || "image/jpeg",
      expectedAmount: Number(expectedAmount) || 0,
      receiverName,
      pixKey,
      playerName,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Erro na verificação de comprovante:", error);
    return res.status(500).json({
      error: error?.message || "Não foi possível analisar o comprovante no momento.",
    });
  }
}
