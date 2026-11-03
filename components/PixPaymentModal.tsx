import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Player, Match, PixConfig } from '../types.ts';
import { generatePixPayload } from '../utils/pixUtils.ts';
import { db, doc, updateDoc, setDoc, collection, addDoc, getDocs, query, where } from '../services/firebase.ts';
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
  initialPaymentMode?: 'all' | 'multa_only' | 'pelada_only';
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
  onClearSharedFile,
  initialPaymentMode
}) => {
  const isMensalista = player.playerType === 'mensalista';
  const basePrice = isMensalista ? (prices.mensalista || 60) : (prices.avulso || 40);
  const currentMonthKey = getCurrentMonthKey();
  const isMensalPaidMonth = Boolean(player.monthlyPaid && player.monthlyPaidMonth === currentMonthKey);
  const isBasePaid = isMensalista ? isMensalPaidMonth : player.paymentStatus === 'pago';
  const hasFine = Boolean(player.hasNoShowFine || player.hasLateRemovalFine);
  const fineValue = hasFine ? (player.fineAmount || prices.multa || 20) : 0;

  // Modo de pagamento selecionado:
  // 'multa_only' -> Paga exclusivamente a multa (não altera presença ou pagamento da pelada)
  // 'all'        -> Paga a taxa da pelada/mensalidade + a multa pendente
  // 'pelada_only'-> Paga apenas a taxa da pelada/mensalidade
  const determineInitialMode = (): 'all' | 'multa_only' | 'pelada_only' => {
    if (initialPaymentMode) return initialPaymentMode;
    if (hasFine && isBasePaid) return 'multa_only';
    if (hasFine && !isBasePaid) return 'all';
    return 'pelada_only';
  };

  const [paymentMode, setPaymentMode] = useState<'all' | 'multa_only' | 'pelada_only'>(determineInitialMode());
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

  // Sincronizar modo inicial quando abrir o modal ou mudar o atleta
  useEffect(() => {
    if (isOpen) {
      setPaymentMode(determineInitialMode());
      setVerificationResult({ status: 'idle' });
      setSelectedFileName(null);
      setPreviewImg(null);
    }
  }, [isOpen, initialPaymentMode, hasFine, isBasePaid, player.id]);

  // Calcular o valor total baseado no modo de pagamento selecionado
  const expectedAmount = (() => {
    if (paymentMode === 'multa_only') {
      return fineValue;
    }
    if (paymentMode === 'pelada_only') {
      return basePrice;
    }
    // modo 'all'
    if (!isBasePaid && hasFine) {
      return basePrice + fineValue;
    }
    if (hasFine) {
      return fineValue;
    }
    return basePrice;
  })();

  const paymentLabel = (() => {
    if (paymentMode === 'multa_only') {
      return `Quitação de Multa Pendente (R$ ${fineValue},00)`;
    }
    if (paymentMode === 'pelada_only') {
      return isMensalista ? `Mensalidade Oficial (R$ ${basePrice},00)` : `Taxa da Pelada Avulso (R$ ${basePrice},00)`;
    }
    // modo 'all'
    if (!isBasePaid && hasFine) {
      return `${isMensalista ? 'Mensalidade' : 'Taxa da Pelada'} (R$ ${basePrice}) + Multa (R$ ${fineValue})`;
    }
    if (hasFine) {
      return `Quitação de Multa Pendente (R$ ${fineValue},00)`;
    }
    return isMensalista ? `Mensalidade de ${getMonthName()} (R$ ${basePrice},00)` : `Taxa da Pelada Avulso (R$ ${basePrice},00)`;
  })();

  const isPayingMultaOnly = paymentMode === 'multa_only';

  const pixDescription = isPayingMultaOnly
    ? `Multa OA ${player.name.slice(0, 12)}`
    : `Pelada OA ${player.name.slice(0, 12)}`;

  const pixTxId = isPayingMultaOnly
    ? `OAM${player.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`
    : `OA${player.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;

  const pixCopiaECola = generatePixPayload({
    pixKey: pixConfig.pixKey,
    pixKeyType: pixConfig.pixKeyType,
    receiverName: pixConfig.receiverName,
    receiverCity: pixConfig.receiverCity,
    amount: expectedAmount,
    txid: pixTxId,
    description: pixDescription
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

      let data: any = null;
      try {
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
        if (response.ok) {
          data = await response.json();
        }
      } catch (fetchErr) {
        console.warn('Aviso na API de IA, prosseguindo com validação resiliente:', fetchErr);
      }

      // Se a IA não retornou ou deu erro de leitura, registrar como pendente de conferência manual (NUNCA auto-aprovar)
      if (!data || typeof data !== 'object') {
        const todayStr = new Date().toLocaleDateString('pt-BR');
        const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        data = {
          isValidReceipt: false,
          isApproved: false,
          isScheduled: false,
          requiresManualReview: true,
          extractedAmount: 0,
          payerName: player.name,
          receiverName: pixConfig.receiverName,
          bankName: 'Pix',
          transactionId: 'TX_' + Date.now().toString(36).toUpperCase(),
          receiptDate: todayStr,
          receiptTime: timeStr,
          summary: `Comprovante salvo para conferência manual da Diretoria`,
          rejectionReason: 'Não foi possível ler o comprovante automaticamente. Ele foi enviado para conferência da Diretoria.'
        };
      }

      // Verificar se o ID da transação já foi utilizado anteriormente para evitar comprovante duplicado
      const cleanTxId = (data.transactionId || '').trim();
      if (data.isApproved && cleanTxId.length >= 8 && !cleanTxId.startsWith('TX_')) {
        const dupSnap = await getDocs(
          query(collection(db, 'receipts'), where('transactionId', '==', cleanTxId))
        );
        if (!dupSnap.empty) {
          // Se o comprovante já existente pertence a este mesmo atleta, revalidar imediatamente sem travar
          const samePlayerReceipt = dupSnap.docs.find(d => {
            const rData = d.data();
            return (
              rData.playerId === player.id ||
              (player.email && rData.playerId === player.email) ||
              (rData.playerName && rData.playerName.toLowerCase() === player.name.toLowerCase())
            );
          });

          if (samePlayerReceipt) {
            const rData = samePlayerReceipt.data();
            const playerUpdates: Record<string, any> = {
              lastReceiptId: samePlayerReceipt.id,
              lastReceiptSummary: rData.summary || `Pix confirmado anteriormente`,
              lastPaymentAt: rData.createdAt || new Date().toISOString()
            };

            if (isPayingMultaOnly) {
              playerUpdates.hasNoShowFine = false;
              playerUpdates.hasLateRemovalFine = false;
              playerUpdates.fineAmount = 0;
              playerUpdates.fineReason = null;
              playerUpdates.lastFinePaidAt = rData.createdAt || new Date().toISOString();
            } else {
              playerUpdates.paymentStatus = 'pago';
              playerUpdates.paidMatchId = match?.id || rData.matchId || '';
              playerUpdates.paidMatchDate = match?.date || rData.matchDate || '';
              if (isMensalista) {
                playerUpdates.monthlyPaid = true;
                playerUpdates.monthlyPaidMonth = currentMonthKey;
              }
              if (hasFine && paymentMode === 'all') {
                playerUpdates.hasNoShowFine = false;
                playerUpdates.hasLateRemovalFine = false;
                playerUpdates.fineAmount = 0;
                playerUpdates.fineReason = null;
                playerUpdates.lastFinePaidAt = rData.createdAt || new Date().toISOString();
              }
            }

            await setDoc(doc(db, 'players', player.id), playerUpdates, { merge: true });
            playSound('cheer');
            setVerificationResult({
              status: 'success',
              title: isPayingMultaOnly ? 'Multa Reconhecida! ✅' : 'Comprovante Reconhecido! ✅',
              message: isPayingMultaOnly
                ? 'Seu comprovante de multa já havia sido recebido e sua multa foi regularizada!'
                : 'Seu comprovante já havia sido recebido e seu status foi revalidado como PAGO na pelada!',
              details: `ID: ${cleanTxId}`
            });
            setIsVerifying(false);
            return;
          }

          setVerificationResult({
            status: 'error',
            title: 'Comprovante Já Utilizado por Outro Atleta',
            message: 'Este comprovante Pix (mesmo ID de transação) já foi registrado para outro atleta na pelada.'
          });
          setIsVerifying(false);
          return;
        }
      }

      // Se detectou explicitamente que é apenas agendamento futuro
      if (data.isScheduled) {
        setVerificationResult({
          status: 'error',
          title: 'Agendamento Não Aceito',
          message: 'Este comprovante indica um AGENDAMENTO futuro e o pagamento ainda não foi efetivado. Efetive o Pix agora para validar.',
          details: data.rejectionReason
        });
        setIsVerifying(false);
        return;
      }

      // Determinar o tipo de pagamento exato
      const targetPaymentType = isPayingMultaOnly
        ? 'multa'
        : paymentMode === 'all'
          ? (isMensalista ? 'mensalista_com_multa' : 'avulso_com_multa')
          : (isMensalista ? 'mensalista' : 'avulso');

      // Caso o comprovante NÃO tenha sido aprovado automaticamente:
      if (!data.isApproved) {
        // Se a leitura foi inconclusiva ou requer revisão manual, salvar na coleção receipts para a Diretoria conferir
        if (data.requiresManualReview || !data.rejectionReason) {
          const nowIso = new Date().toISOString();
          await addDoc(collection(db, 'receipts'), {
            playerId: player.id,
            playerName: player.name,
            playerPhoto: player.photoUrl || '',
            playerType: player.playerType,
            paymentType: targetPaymentType,
            expectedAmount,
            extractedAmount: 0,
            payerName: data.payerName || player.name,
            receiverName: data.receiverName || pixConfig.receiverName,
            bankName: data.bankName || 'Pix',
            transactionId: cleanTxId || ('TX_' + Date.now().toString(36).toUpperCase()),
            receiptDate: data.receiptDate || new Date().toLocaleDateString('pt-BR'),
            receiptTime: data.receiptTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            summary: isPayingMultaOnly
              ? 'Comprovante de MULTA aguardando conferência manual da Diretoria'
              : 'Aguardando conferência manual da Diretoria',
            receiptPreviewUrl: previewDataUrl || '',
            verifiedByAi: false,
            status: 'pendente_conferencia',
            matchId: match?.id || '',
            matchDate: match?.date || '',
            createdAt: nowIso
          });

          await setDoc(doc(db, 'players', player.id), {
            lastReceiptSummary: isPayingMultaOnly
              ? 'Comprovante de multa enviado • Em conferência pela Diretoria'
              : 'Comprovante enviado • Em conferência pela Diretoria'
          }, { merge: true });

          setVerificationResult({
            status: 'success',
            title: isPayingMultaOnly ? 'Comprovante de Multa Enviado! 📋' : 'Comprovante Enviado para a Diretoria! 📋',
            message: isPayingMultaOnly
              ? 'A leitura automática foi inconclusiva. O comprovante de quitação da multa foi enviado para a Diretoria regularizar.'
              : 'A leitura automática foi inconclusiva. Seu comprovante foi salvo com sucesso e a Diretoria fará a baixa manual no Financeiro.',
            details: 'Você pode acompanhar pelo painel da pelada assim que a Diretoria conferir.'
          });
          setIsVerifying(false);
          return;
        }

        // Se o comprovante foi recusado (ex: valor menor, imagem inválida)
        setVerificationResult({
          status: 'error',
          title: 'Comprovante Não Aprovado',
          message: data.rejectionReason || 'O valor ou os dados do comprovante não coincidem com o valor da cobrança da pelada.',
          details: data.summary
        });
        setIsVerifying(false);
        return;
      }

      // APROVADO COM SEGURANÇA! Atualizar o status do atleta no Firestore e registrar na coleção "receipts"
      const nowIso = new Date().toISOString();
      const finalAmount = Number(data.extractedAmount) || expectedAmount;

      const receiptDocRef = await addDoc(collection(db, 'receipts'), {
        playerId: player.id,
        playerName: player.name,
        playerPhoto: player.photoUrl || '',
        playerType: player.playerType,
        paymentType: targetPaymentType,
        expectedAmount,
        extractedAmount: finalAmount,
        payerName: data.payerName || player.name,
        receiverName: data.receiverName || pixConfig.receiverName,
        bankName: data.bankName || 'Pix',
        transactionId: cleanTxId || ('TX_' + Date.now().toString(36).toUpperCase()),
        receiptDate: data.receiptDate || new Date().toLocaleDateString('pt-BR'),
        receiptTime: data.receiptTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        summary: data.summary || `${isPayingMultaOnly ? 'Multa' : 'Pix'} R$ ${finalAmount.toFixed(2)} confirmado`,
        receiptPreviewUrl: previewDataUrl || '',
        verifiedByAi: Boolean(data.verifiedByAi ?? true),
        status: 'aprovado',
        matchId: match?.id || '',
        matchDate: match?.date || '',
        createdAt: nowIso
      });

      const playerUpdates: Record<string, any> = {
        lastPaymentAt: nowIso,
        lastPaymentAmount: finalAmount,
        lastReceiptId: receiptDocRef.id,
        lastReceiptSummary: isPayingMultaOnly
          ? `Multa R$ ${finalAmount.toFixed(2)} quitada (${data.bankName || 'Pix'})`
          : (data.summary || `R$ ${finalAmount.toFixed(2)} (${data.bankName || 'Pix'})`),
      };

      if (isPayingMultaOnly) {
        // Se está pagando APENAS a multa, removemos as multas SEM alterar status da pelada!
        playerUpdates.hasNoShowFine = false;
        playerUpdates.hasLateRemovalFine = false;
        playerUpdates.fineAmount = 0;
        playerUpdates.fineReason = null;
        playerUpdates.lastFinePaidAt = nowIso;
      } else {
        // Pagamento da pelada ou pelada + multa
        playerUpdates.paymentStatus = 'pago';
        playerUpdates.paidMatchId = match?.id || '';
        playerUpdates.paidMatchDate = match?.date || '';
        if (isMensalista) {
          playerUpdates.monthlyPaid = true;
          playerUpdates.monthlyPaidMonth = currentMonthKey;
        }
        if (hasFine && paymentMode === 'all') {
          playerUpdates.hasNoShowFine = false;
          playerUpdates.hasLateRemovalFine = false;
          playerUpdates.fineAmount = 0;
          playerUpdates.fineReason = null;
          playerUpdates.lastFinePaidAt = nowIso;
        }
      }

      await setDoc(doc(db, 'players', player.id), playerUpdates, { merge: true });
      playSound('cheer');

      setVerificationResult({
        status: 'success',
        title: isPayingMultaOnly ? 'Multa Paga com Sucesso! ✅' : 'Pagamento Confirmado na Hora! ✅',
        message: isPayingMultaOnly
          ? `Sua multa de R$ ${finalAmount.toFixed(2)} foi quitada! Seu cadastro está regularizado junto à Diretoria da pelada.`
          : `Seu pagamento de R$ ${finalAmount.toFixed(2)} foi processado com sucesso e seu status já está atualizado como PAGO na pelada!`,
        details: `${data.bankName ? `Banco: ${data.bankName} • ` : ''}${data.receiptDate || 'Hoje'} ${data.receiptTime || ''}`
      });
    } catch (err: any) {
      console.error('Erro ao processar comprovante:', err);
      // NUNCA marcar como pago em falha inesperada!
      setVerificationResult({
        status: 'error',
        title: 'Falha no Processamento',
        message: 'Não foi possível validar o comprovante no momento. Verifique sua conexão e tente enviar novamente, ou procure a Diretoria da pelada.'
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

            {/* Opção de alternar entre pagar Apenas Multa, Tudo Junto ou Apenas Pelada */}
            {hasFine && !isBasePaid ? (
              <div className="mt-1 pt-2 border-t border-white/20 flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-amber-200">
                  Escolha o que deseja pagar neste Pix:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('multa_only')}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-0.5 border ${
                      paymentMode === 'multa_only'
                        ? 'bg-red-500 text-white border-red-300 shadow-sm'
                        : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                    }`}
                  >
                    <span>Apenas Multa</span>
                    <span className="text-[10px] opacity-90 font-mono">R$ {fineValue},00</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMode('all')}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-0.5 border ${
                      paymentMode === 'all'
                        ? 'bg-amber-400 text-navy-deep border-amber-300 shadow-sm font-black'
                        : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                    }`}
                  >
                    <span>Pelada + Multa</span>
                    <span className="text-[10px] opacity-90 font-mono">R$ {basePrice + fineValue},00</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMode('pelada_only')}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-0.5 border ${
                      paymentMode === 'pelada_only'
                        ? 'bg-emerald-500 text-white border-emerald-300 shadow-sm'
                        : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                    }`}
                  >
                    <span>Apenas Pelada</span>
                    <span className="text-[10px] opacity-90 font-mono">R$ {basePrice},00</span>
                  </button>
                </div>
              </div>
            ) : hasFine && isBasePaid ? (
              <div className="mt-1 pt-2 border-t border-white/20 text-[11px] text-amber-200 font-medium flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-amber-300">info</span>
                <span>Sua pelada/mensalidade está paga. Este Pix é exclusivo para quitar a multa pendente.</span>
              </div>
            ) : null}
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
                    : isPayingMultaOnly
                      ? `COPIAR PIX DA MULTA (R$ ${expectedAmount.toFixed(2).replace('.', ',')})`
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
