import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Player, Match, PixConfig } from '../types.ts';
import { generatePixPayload } from '../utils/pixUtils.ts';
import { db, doc, updateDoc, collection, addDoc, getDocs, query, where } from '../services/firebase.ts';
import { playSound } from '../utils/sound.ts';
import { getCurrentMonthKey, getMensalistaPaymentInfo, getMonthName } from '../utils/mensalistaUtils.ts';

interface PixPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player;
  match: Match | null;
  prices: {
    mensalista: number;
    avulso: number;
    multa: number;
  };
  pixConfig: PixConfig;
  initialSharedFile?: File | null;
  onClearSharedFile?: () => void;
}

export const PixIcon: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-5 h-5',
  color = 'currentColor'
}) => (
  <svg
    viewBox="0 0 512 512"
    fill={color}
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 ${className}`}
    aria-hidden="true"
  >
    <path d="M242.4 292.5C247.8 287.1 257.1 287.1 262.5 292.5L339.5 369.5C353.7 383.7 372.6 391.5 392.6 391.5H407.7L310.6 488.6C280.3 518.9 231.1 518.9 200.8 488.6L103.3 391.2H112.6C132.6 391.2 151.5 383.4 165.7 369.2L242.4 292.5ZM262.5 218.9C256.9 224.4 247.9 224.5 242.4 218.9L165.7 142.2C151.5 127.9 132.6 120.2 112.6 120.2H103.3L200.7 22.76C231.1-7.586 280.3-7.586 310.6 22.76L407.8 119.9H392.6C372.6 119.9 353.7 127.7 339.5 141.9L262.5 218.9ZM112.6 142.7C126.4 142.7 139.1 148.3 149.7 158.1L226.4 234.8C233.6 241.9 243 245.5 252.5 245.5C261.9 245.5 271.3 241.9 278.5 234.8L355.5 157.8C365.3 148.1 378.8 142.5 392.6 142.5H430.3L488.6 200.8C518.9 231.1 518.9 280.3 488.6 310.6L430.3 368.9H392.6C378.8 368.9 365.3 363.3 355.5 353.5L278.5 276.5C264.6 262.6 240.3 262.6 226.4 276.5L149.7 353.2C139.1 363 126.4 368.6 112.6 368.6H80.78L22.76 310.6C-7.586 280.3-7.586 231.1 22.76 200.8L80.78 142.7H112.6Z" />
  </svg>
);

async function compressReceiptPreview(file: File): Promise<{ base64ForAi: string; mimeType: string; previewDataUrl: string }> {
  if (file.type === 'application/pdf') {
    const base64ForAi = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return {
      base64ForAi,
      mimeType: 'application/pdf',
      previewDataUrl: ''
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 1100;
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height >= width && height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);

        // Miniatura compacta para salvar no Firestore sem estourar limite de documento
        const thumbCanvas = document.createElement('canvas');
        const THUMB_MAX = 650;
        let tW = img.width;
        let tH = img.height;
        if (tW > tH && tW > THUMB_MAX) {
          tH = Math.round((tH * THUMB_MAX) / tW);
          tW = THUMB_MAX;
        } else if (tH >= tW && tH > THUMB_MAX) {
          tW = Math.round((tW * THUMB_MAX) / tH);
          tH = THUMB_MAX;
        }
        thumbCanvas.width = tW;
        thumbCanvas.height = tH;
        const tCtx = thumbCanvas.getContext('2d');
        if (tCtx) {
          tCtx.fillStyle = '#FFFFFF';
          tCtx.fillRect(0, 0, tW, tH);
          tCtx.drawImage(img, 0, 0, tW, tH);
        }
        const previewDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.62);

        resolve({
          base64ForAi: dataUrl,
          mimeType: 'image/jpeg',
          previewDataUrl
        });
      };
      img.onerror = reject;
      img.src = String(e.target?.result || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const PixPaymentModal: React.FC<PixPaymentModalProps> = ({
  isOpen,
  onClose,
  player,
  match,
  prices,
  pixConfig,
  initialSharedFile,
  onClearSharedFile
}) => {
  const isMensalista = player.playerType === 'mensalista';
  const basePrice = isMensalista ? (prices.mensalista || 60) : (prices.avulso || 40);
  const isBasePaid = isMensalista ? Boolean(player.monthlyPaid) : player.paymentStatus === 'pago';
  const hasFine = Boolean(player.hasNoShowFine || player.hasLateRemovalFine);
  const fineValue = hasFine ? (player.fineAmount || prices.multa || 20) : 0;

  const [includeFine, setIncludeFine] = useState<boolean>(hasFine);
  const [copiedPix, setCopiedPix] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    status: 'idle' | 'success' | 'error';
    title?: string;
    message?: string;
    details?: string;
  }>({ status: 'idle' });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setIncludeFine(hasFine);
  }, [hasFine, player.id]);

  // Calcular o valor total que o atleta está pagando agora
  const expectedAmount = (() => {
    if (!isBasePaid && hasFine && includeFine) {
      return basePrice + fineValue;
    }
    if (!isBasePaid) {
      return basePrice;
    }
    if (hasFine) {
      return fineValue;
    }
    return basePrice;
  })();

  const paymentLabel = (() => {
    if (!isBasePaid && hasFine && includeFine) {
      return `${isMensalista ? 'Mensalidade (Venc. Dia 10)' : 'Pelada Avulso'} (R$ ${basePrice}) + Multa (R$ ${fineValue})`;
    }
    if (!isBasePaid) {
      return isMensalista ? `Mensalidade Oficial (Vencimento até dia 10)` : 'Taxa da Pelada (Avulso)';
    }
    if (hasFine) {
      return 'Quitação de Multa Pendente';
    }
    return isMensalista ? `Mensalidade de ${getMonthName()} (Quitada ✓ • Próx: Dia 10)` : 'Taxa da Pelada (Avulso)';
  })();

  const pixCopiaECola = generatePixPayload({
    pixKey: pixConfig.pixKey,
    pixKeyType: pixConfig.pixKeyType,
    receiverName: pixConfig.receiverName,
    receiverCity: pixConfig.receiverCity,
    amount: expectedAmount,
    txid: `OA${player.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`,
    description: `Pelada OA ${player.name.slice(0, 12)}`
  });

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(pixCopiaECola)}`;

  const handleCopyPixCode = async () => {
    try {
      await navigator.clipboard.writeText(pixCopiaECola);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 3000);
    } catch {
      alert('Código Pix: ' + pixCopiaECola);
    }
  };

  const handleCopyPixKey = async () => {
    try {
      await navigator.clipboard.writeText(pixConfig.pixKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 3000);
    } catch {
      alert('Chave Pix: ' + pixConfig.pixKey);
    }
  };

  const processReceiptFile = async (file: File) => {
    if (!file) return;
    setSelectedFileName(file.name);
    setIsVerifying(true);
    setVerificationResult({ status: 'idle' });

    try {
      const { base64ForAi, mimeType, previewDataUrl } = await compressReceiptPreview(file);
      if (previewDataUrl) {
        setPreviewImg(previewDataUrl);
      }

      const response = await fetch('/api/verify-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data: base64ForAi,
          mimeType,
          expectedAmount,
          receiverName: pixConfig.receiverName,
          pixKey: pixConfig.pixKey,
          playerName: player.name
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Erro ao analisar o comprovante.');
      }

      // Verificar se o ID da transação já foi utilizado anteriormente para evitar comprovante duplicado
      const cleanTxId = (data.transactionId || '').trim();
      if (data.isApproved && cleanTxId.length >= 8) {
        const dupSnap = await getDocs(
          query(collection(db, 'receipts'), where('transactionId', '==', cleanTxId))
        );
        if (!dupSnap.empty) {
          setVerificationResult({
            status: 'error',
            title: 'Comprovante Já Utilizado',
            message: 'Este comprovante Pix (mesmo ID de transação) já foi enviado e registrado anteriormente.'
          });
          setIsVerifying(false);
          return;
        }
      }

      if (!data.isApproved) {
        setVerificationResult({
          status: 'error',
          title: data.isScheduled ? 'Agendamento Não Aceito' : 'Comprovante Não Aprovado',
          message:
            data.rejectionReason ||
            `O comprovante enviado não pôde ser validado para o valor de R$ ${expectedAmount.toFixed(2)}.`,
          details: data.extractedAmount
            ? `Valor lido no comprovante: R$ ${Number(data.extractedAmount).toFixed(2)}`
            : undefined
        });
        setIsVerifying(false);
        return;
      }

      // Aprovado! Atualizar o status do atleta no Firestore e registrar o comprovante na coleção "receipts"
      const nowIso = new Date().toISOString();
      const paymentType =
        !isBasePaid && hasFine && includeFine
          ? isMensalista
            ? 'mensalista_com_multa'
            : 'avulso_com_multa'
          : !isBasePaid
            ? isMensalista
              ? 'mensalista'
              : 'avulso'
            : 'multa';

      const receiptDocRef = await addDoc(collection(db, 'receipts'), {
        playerId: player.id,
        playerName: player.name,
        playerPhoto: player.photoUrl || '',
        playerType: player.playerType,
        paymentType,
        expectedAmount,
        extractedAmount: Number(data.extractedAmount) || expectedAmount,
        payerName: data.payerName || player.name,
        receiverName: data.receiverName || pixConfig.receiverName,
        bankName: data.bankName || 'Pix',
        transactionId: cleanTxId,
        receiptDate: data.receiptDate || new Date().toLocaleDateString('pt-BR'),
        receiptTime: data.receiptTime || '',
        summary: data.summary || `Pix R$ ${expectedAmount.toFixed(2)} confirmado`,
        receiptPreviewUrl: previewDataUrl || '',
        verifiedByAi: true,
        matchId: match?.id || '',
        matchDate: match?.date || '',
        createdAt: nowIso
      });

      const playerUpdates: Record<string, any> = {
        lastPaymentAt: nowIso,
        lastPaymentAmount: Number(data.extractedAmount) || expectedAmount,
        lastReceiptId: receiptDocRef.id,
        lastReceiptSummary:
          data.summary ||
          `R$ ${(Number(data.extractedAmount) || expectedAmount).toFixed(2)} (${data.bankName || 'Pix'})`
      };

      if (!isBasePaid) {
        if (isMensalista) {
          playerUpdates.monthlyPaid = true;
          playerUpdates.monthlyPaidMonth = getCurrentMonthKey();
        } else {
          playerUpdates.paymentStatus = 'pago';
        }
      }

      if (hasFine && (includeFine || isBasePaid)) {
        playerUpdates.hasNoShowFine = false;
        playerUpdates.hasLateRemovalFine = false;
        playerUpdates.fineAmount = 0;
        playerUpdates.fineReason = null;
      }

      await updateDoc(doc(db, 'players', player.id), playerUpdates);
      playSound('cheer');

      setVerificationResult({
        status: 'success',
        title: 'Pagamento Confirmado na Hora! ✅',
        message: `Seu pagamento de R$ ${(Number(data.extractedAmount) || expectedAmount).toFixed(2)} foi validado automaticamente e seu status já está como PAGO na pelada!`,
        details: `${data.bankName ? `Banco: ${data.bankName} • ` : ''}${data.receiptDate || 'Hoje'} ${data.receiptTime || ''}`
      });
    } catch (err: any) {
      console.error('Erro ao validar comprovante:', err);
      setVerificationResult({
        status: 'error',
        title: 'Erro ao Ler Comprovante',
        message: err?.message || 'Não foi possível validar a imagem. Tente enviar um print nítido do comprovante.'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Se o atleta compartilhou o comprovante direto do app do banco (Web Share Target), processa automaticamente
  useEffect(() => {
    if (isOpen && initialSharedFile) {
      processReceiptFile(initialSharedFile);
      if (onClearSharedFile) onClearSharedFile();
    }
  }, [isOpen, initialSharedFile]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 99999
      }}
      className="bg-navy-deep/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isVerifying) onClose();
      }}
    >
      <div
        className="bg-white text-navy-deep max-w-md w-full max-h-[92dvh] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-surface-container-high/60 shadow-2xl flex flex-col gap-3.5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-surface-container-high/50 pb-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#32BCAD]/15 text-[#32BCAD] flex items-center justify-center shrink-0">
              <PixIcon className="w-5 h-5" color="#32BCAD" />
            </div>
            <div className="min-w-0">
              <h3 className="font-headline-sm text-sm sm:text-base text-navy-deep font-bold truncate">
                Pagamento Pix & Comprovante
              </h3>
              <p className="text-[11px] text-outline truncate">
                Pague no Pix e envie o comprovante para confirmação imediata
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isVerifying}
            className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* BODY SCROLLABLE */}
        <div className="flex flex-col gap-3.5 overflow-y-auto min-h-0 flex-1 pr-1">
          {/* RESUMO DO VALOR DO ATLETA */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-navy-deep to-secondary text-white flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                {paymentLabel}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold uppercase">
                {player.name}
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="font-scoreboard-num text-3xl sm:text-4xl tracking-wide text-white">
                R$ {expectedAmount.toFixed(2).replace('.', ',')}
              </span>
              <span className="text-[11px] text-white/80 font-medium">
                Recebedor: {pixConfig.receiverName}
              </span>
            </div>

            {/* Opção de incluir/desmarcar multa se o atleta tiver ambos pendentes */}
            {!isBasePaid && hasFine && (
              <label className="mt-1 pt-2 border-t border-white/15 flex items-center justify-between gap-2 text-xs cursor-pointer select-none">
                <span className="text-amber-200 font-semibold">
                  Incluir multa pendente (+ R$ {fineValue},00) neste Pix?
                </span>
                <input
                  type="checkbox"
                  checked={includeFine}
                  onChange={(e) => setIncludeFine(e.target.checked)}
                  className="w-4 h-4 accent-emerald-400 rounded cursor-pointer"
                />
              </label>
            )}
          </div>

          {/* PASSO 1: QR CODE E PIX COPIA E COLA */}
          <div className="p-3.5 rounded-2xl bg-surface-container-low border border-surface-container-high/60 flex flex-col items-center gap-2.5">
            <div className="w-full flex items-center justify-between text-xs font-bold text-navy-deep">
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-navy-deep text-white text-[11px] flex items-center justify-center">
                  1
                </span>
                <span>Pague via Pix Copia e Cola ou QR Code</span>
              </span>
              <span className="text-[11px] text-emerald-700 font-semibold">Valor já incluso</span>
            </div>

            <div className="bg-white p-2.5 rounded-2xl border border-surface-container-high shadow-xs">
              <img
                src={qrCodeUrl}
                alt="QR Code Pix Oficial"
                className="w-36 h-36 sm:w-40 sm:h-40 object-contain"
              />
            </div>

            <div className="w-full flex flex-col gap-2">
              <button
                type="button"
                onClick={handleCopyPixCode}
                className={`w-full min-h-[44px] py-2.5 px-3.5 rounded-xl font-headline-sm text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all ${
                  copiedPix
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#32BCAD] hover:bg-[#2aa89a] text-white'
                }`}
              >
                {copiedPix ? (
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                ) : (
                  <PixIcon className="w-4 h-4" color="#ffffff" />
                )}
                <span>
                  {copiedPix
                    ? 'CÓDIGO PIX COPIADO! ABRA SEU BANCO'
                    : `COPIAR PIX COPIA E COLA (R$ ${expectedAmount.toFixed(2).replace('.', ',')})`}
                </span>
              </button>

              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-surface-container-high text-xs">
                <div className="min-w-0">
                  <span className="text-[10px] text-outline block font-semibold uppercase">
                    Chave Pix Direta ({pixConfig.pixKeyType.toUpperCase()})
                  </span>
                  <span className="font-bold text-navy-deep truncate block">
                    {pixConfig.pixKey}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyPixKey}
                  className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-navy-deep font-bold text-[11px] shrink-0 active:scale-95"
                >
                  {copiedKey ? 'Chave Copiada!' : 'Copiar Chave'}
                </button>
              </div>
            </div>
          </div>

          {/* PASSO 2: ENVIAR OU COMPARTILHAR COMPROVANTE PARA BAIXA AUTOMÁTICA */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border-2 border-emerald-500/40 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] flex items-center justify-center">
                  2
                </span>
                <span>Envie o Comprovante (Baixa Automática)</span>
              </span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900">
                Leitura Inteligente
              </span>
            </div>

            <p className="text-[11px] text-emerald-900/90 leading-snug">
              Você pode <strong>compartilhar o comprovante direto do app do seu banco</strong> escolhendo o app <strong>O&A Pelada</strong> ou tocar no botão abaixo para enviar o print/PDF:
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  processReceiptFile(file);
                }
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isVerifying}
              className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-headline-sm text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {isVerifying ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>VALIDANDO COMPROVANTE...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">upload_file</span>
                  <span>ENVIAR COMPROVANTE PIX (PRINT OU PDF)</span>
                </>
              )}
            </button>

            {selectedFileName && !isVerifying && (
              <span className="text-[11px] text-emerald-900 font-medium text-center truncate">
                Arquivo selecionado: {selectedFileName}
              </span>
            )}

            {/* FEEDBACK DA VERIFICAÇÃO AUTOMÁTICA */}
            {verificationResult.status === 'success' && (
              <div className="p-3 rounded-xl bg-emerald-600 text-white flex flex-col gap-1 shadow-sm animate-fade-in">
                <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
                  <span className="material-symbols-outlined text-[20px]">verified</span>
                  <span>{verificationResult.title}</span>
                </div>
                <p className="text-xs text-white/95 leading-snug">
                  {verificationResult.message}
                </p>
                {verificationResult.details && (
                  <p className="text-[11px] text-emerald-100 font-semibold mt-0.5">
                    {verificationResult.details}
                  </p>
                )}
              </div>
            )}

            {verificationResult.status === 'error' && (
              <div className="p-3 rounded-xl bg-red-600 text-white flex flex-col gap-1 shadow-sm animate-fade-in">
                <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
                  <span className="material-symbols-outlined text-[20px]">error</span>
                  <span>{verificationResult.title}</span>
                </div>
                <p className="text-xs text-white/95 leading-snug">
                  {verificationResult.message}
                </p>
                {verificationResult.details && (
                  <p className="text-[11px] text-red-100 font-semibold mt-0.5">
                    {verificationResult.details}
                  </p>
                )}
              </div>
            )}

            {previewImg && (
              <div className="mt-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold uppercase text-emerald-900">
                  Prévia do Comprovante Enviado
                </span>
                <img
                  src={previewImg}
                  alt="Prévia do comprovante"
                  className="max-h-36 rounded-lg border border-emerald-300 object-contain bg-white p-1"
                />
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex justify-end pt-2 border-t border-surface-container-high/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isVerifying}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container text-navy-deep font-headline-sm text-xs font-bold active:scale-95 transition-all"
          >
            {verificationResult.status === 'success' ? 'Concluir e Voltar' : 'Fechar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
