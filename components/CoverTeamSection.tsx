import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CoverTeam, Player } from '../types.ts';
import { db, doc, onSnapshot, setDoc, deleteDoc, collection, getDocs, query, orderBy, limit, addDoc } from '../services/firebase.ts';
import { MASTER_ADMIN_EMAIL, OFFICIAL_INSTAGRAM_URL, OFFICIAL_INSTAGRAM_HANDLE } from '../constants.tsx';

interface CoverTeamSectionProps {
  players: Player[];
  user: any;
  currentUserRole?: 'admin' | 'player';
  variant?: 'full' | 'compact';
  isChristmasThemeActive?: boolean;
}

// Ícone SVG vetorizado de alta fidelidade do Instagram
export const InstagramIcon: React.FC<{ className?: string; color?: string }> = ({ className = "w-4 h-4", color = "currentColor" }) => (
  <svg 
    className={className} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path 
      d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" 
      fill={color} 
    />
  </svg>
);

// Função para compactar imagens de celular para caber perfeitamente no Firestore
async function compressCoverPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 1600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Qualidade 0.84 gera ~120-170KB com nitidez impecável
        const base64 = canvas.toDataURL('image/jpeg', 0.84);
        resolve(base64);
      };
      img.onerror = reject;
      img.src = String(e.target?.result || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Ícone SVG vetorizado do WhatsApp
export const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.697.073-2.02-.474-1.688-.698-2.77-2.428-2.855-2.54-.085-.113-.679-.904-.679-1.724 0-.82.427-1.224.58-1.389.152-.165.333-.207.444-.207.111 0 .222.001.32.005.103.004.24-.039.375.285.14.336.478 1.166.52 1.251.042.085.07.185.014.296-.056.111-.084.18-.168.278-.084.098-.176.219-.252.294-.084.084-.171.175-.074.341.097.166.432.713.927 1.154.636.568 1.172.744 1.338.827.166.084.263.07.361-.042.097-.113.416-.484.527-.65.111-.167.222-.139.374-.084.152.056.969.457 1.135.54.166.083.277.125.319.194.042.069.042.403-.102.808z" />
    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.05 22l4.98-1.306A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.167c-1.644 0-3.17-.478-4.464-1.303l-.32-.204-2.956.775.789-2.883-.223-.355A8.134 8.134 0 013.833 12c0-4.503 3.664-8.167 8.167-8.167 4.503 0 8.167 3.664 8.167 8.167 0 4.503-3.664 8.167-8.167 8.167z" />
  </svg>
);

// Converter Data URL base64 ou URL remota em File real para envio nativo de imagem
export async function urlOrBase64ToFile(url: string, filename = 'time-da-semana.jpg'): Promise<File> {
  // Se for Data URL ou URL comum, o fetch() do navegador decodifica nativamente via C++ de forma assíncrona
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || 'image/jpeg' });
  } catch {
    // Fallback caso fetch() de Data URL falhe em algum WebView específico
    if (url.startsWith('data:')) {
      const parts = url.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const cleanBase64 = parts[1].replace(/\s/g, '');
      const bstr = atob(cleanBase64);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) {
        u8arr[i] = bstr.charCodeAt(i);
      }
      return new File([u8arr], filename, { type: mime });
    }
    throw new Error('Falha ao processar arquivo da imagem');
  }
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof (ctx as any).roundRect === 'function') {
    ctx.beginPath();
    (ctx as any).roundRect(x, y, w, h, r);
    ctx.closePath();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Gera o arquivo da foto com tratamento gráfico profissional, enquadramento esportivo e todos os atletas marcados
export async function generatePhotoWithTaggedAthletes(
  photoUrl: string,
  teamName: string,
  athleteNames: string[],
  matchDate?: string,
  isChristmasTheme = false
): Promise<File> {
  return new Promise(async (resolve) => {
    const fallbackToFile = async () => {
      try {
        const f = await urlOrBase64ToFile(photoUrl, 'time-da-semana-ousadia-alegria.jpg');
        resolve(f);
      } catch {
        resolve(new File([], 'time-da-semana.jpg', { type: 'image/jpeg' }));
      }
    };

    // Timeout de segurança de 3.5s para garantir que nunca fique travado
    const timer = setTimeout(fallbackToFile, 3500);

    // Carregar fontes esportivas do sistema se suportado
    try {
      if (typeof document !== 'undefined' && document.fonts) {
        await document.fonts.ready;
      }
    } catch {}

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      clearTimeout(timer);
      try {
        const origW = img.naturalWidth || img.width || 1200;
        const origH = img.naturalHeight || img.height || 900;

        // Limitar resolução razoável para envio no WhatsApp (máx 1600px na maior dimensão para altíssima nitidez)
        let scale = 1;
        if (origW > 1600 || origH > 1600) {
          scale = 1600 / Math.max(origW, origH);
        }
        const W = Math.round(origW * scale);
        const H = Math.round(origH * scale);

        // Fator de escala proporcional calibrado para largura padrão de 1080px
        const s = Math.max(0.72, Math.min(1.45, W / 1080));
        const padX = Math.round(36 * s);

        const fontHeading = `'Bebas Neue', 'Barlow Condensed', 'Impact', sans-serif`;
        const fontBody = `'Plus Jakarta Sans', system-ui, -apple-system, sans-serif`;

        // Canvas preliminar para medição precisa de todos os elementos antes de renderizar
        const measureCanvas = document.createElement('canvas');
        const mctx = measureCanvas.getContext('2d');
        if (!mctx) return fallbackToFile();

        // 1. Medir badges superiores
        const badgeH = Math.round(32 * s);
        const badgeRadius = Math.round(badgeH / 2);
        const badgePadX = Math.round(14 * s);

        const leftBadgeText = isChristmasTheme 
          ? `🏆 TIME DA SEMANA • EDIÇÃO DE NATAL 🎅` 
          : `🏆 TIME DA SEMANA${matchDate ? ` • ${matchDate}` : ''}`;
        mctx.font = `bold ${Math.round(13 * s)}px ${fontBody}`;
        const leftBadgeW = Math.round(mctx.measureText(leftBadgeText).width + badgePadX * 2);

        const rightBadgeText = '📸 @pelada_ousadia_alegria';
        mctx.font = `800 ${Math.round(12.5 * s)}px ${fontBody}`;
        const rightBadgeW = Math.round(mctx.measureText(rightBadgeText).width + badgePadX * 2);

        // Verificar se os dois badges cabem lado a lado sem risco de colisão
        const canFitBadgesSameRow = (leftBadgeW + rightBadgeW + padX * 2 + Math.round(16 * s)) <= W;
        const headerRowH = canFitBadgesSameRow ? badgeH : (badgeH * 2 + Math.round(8 * s));

        // 2. Medir Título do Time (ajuste gradual se o nome for muito longo)
        let teamFontSize = Math.round(38 * s);
        mctx.font = `900 ${teamFontSize}px ${fontHeading}`;
        const cleanTeamName = `⭐ ${teamName.toUpperCase().trim() || 'CAMPEÕES DA PELADA'}`;
        while (teamFontSize > 20 * s && mctx.measureText(cleanTeamName).width > W - padX * 2) {
          teamFontSize -= 2;
          mctx.font = `900 ${teamFontSize}px ${fontHeading}`;
        }
        const teamTitleH = Math.round(teamFontSize * 1.15);

        // 3. Medir e empacotar os chips dos Atletas com quebra de linha inteligente
        interface ChipItem {
          name: string;
          w: number;
        }

        const chipH = Math.round(34 * s);
        const chipGapX = Math.round(8 * s);
        const chipGapY = Math.round(8 * s);
        const chipPadInnerX = Math.round(12 * s);
        const chipFontSize = Math.round(13 * s);
        mctx.font = `bold ${chipFontSize}px ${fontBody}`;

        const validAthletes = athleteNames.filter(n => Boolean(n && n.trim()));
        const chips: ChipItem[] = validAthletes.map(name => {
          const tw = mctx.measureText(name).width;
          const w = Math.min(W - padX * 2, Math.round(tw + chipPadInnerX * 2 + 20 * s));
          return { name, w };
        });

        const chipLines: ChipItem[][] = [];
        let curLine: ChipItem[] = [];
        let curLineW = 0;
        const maxLineWidth = W - padX * 2;

        for (const chip of chips) {
          const needed = curLine.length === 0 ? chip.w : (curLineW + chipGapX + chip.w);
          if (needed <= maxLineWidth) {
            curLine.push(chip);
            curLineW = needed;
          } else {
            if (curLine.length > 0) chipLines.push(curLine);
            curLine = [chip];
            curLineW = chip.w;
          }
        }
        if (curLine.length > 0) chipLines.push(curLine);

        const labelH = validAthletes.length > 0 ? Math.round(22 * s) : 0;
        const chipsTotalH = chipLines.length > 0 ? (chipLines.length * chipH + (chipLines.length - 1) * chipGapY) : 0;

        // 4. Rodapé e espaçamentos equilibrados
        const footerH = Math.round(34 * s);
        const padTop = Math.round(24 * s);
        const padBottom = Math.round(22 * s);
        const sectionGap = Math.round(14 * s);

        const bannerH = padTop 
          + headerRowH 
          + sectionGap 
          + teamTitleH 
          + (validAthletes.length > 0 ? (sectionGap + labelH + chipsTotalH) : 0)
          + sectionGap 
          + footerH 
          + padBottom;

        // Criar canvas final com resolução precisa
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H + bannerH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return fallbackToFile();

        // 1. Desenhar a foto oficial inteira sem nenhum corte
        ctx.drawImage(img, 0, 0, W, H);

        // 2. Fundo sofisticado do rodapé (Gradiente estádio azul marinho noite profunda)
        const bgGrad = ctx.createLinearGradient(0, H, 0, H + bannerH);
        bgGrad.addColorStop(0, '#040814');
        bgGrad.addColorStop(0.25, '#071228');
        bgGrad.addColorStop(0.65, '#050c1e');
        bgGrad.addColorStop(1, '#02050e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, H, W, bannerH);

        // Marca d'água quadriculada croata sutil no fundo
        const patternSquare = Math.round(14 * s);
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 6; c++) {
            const isRed = (r + c) % 2 === 0;
            ctx.fillStyle = isRed ? 'rgba(220, 38, 38, 0.05)' : 'rgba(255, 255, 255, 0.04)';
            ctx.fillRect(W - (6 - c) * patternSquare, H + bannerH - (4 - r) * patternSquare, patternSquare, patternSquare);
          }
        }

        // 3. Divisória metálica dourada de alto impacto no topo do rodapé
        const dividerH = Math.max(3, Math.round(4 * s));
        const goldGrad = ctx.createLinearGradient(0, 0, W, 0);
        goldGrad.addColorStop(0, '#78350f');
        goldGrad.addColorStop(0.15, '#d97706');
        goldGrad.addColorStop(0.5, '#fef08a');
        goldGrad.addColorStop(0.85, '#d97706');
        goldGrad.addColorStop(1, '#78350f');
        ctx.fillStyle = goldGrad;
        ctx.fillRect(0, H, W, dividerH);

        // 4. Renderizar Badges Superiores (Sem qualquer risco de sobreposição)
        let curY = H + padTop;
        if (canFitBadgesSameRow) {
          // Left Badge (Time da Semana)
          drawRoundedRect(ctx, padX, curY, leftBadgeW, badgeH, badgeRadius);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
          ctx.lineWidth = Math.max(1, Math.round(1.5 * s));
          ctx.stroke();

          ctx.fillStyle = '#fbbf24';
          ctx.font = `bold ${Math.round(13 * s)}px ${fontBody}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(leftBadgeText, padX + badgePadX, curY + badgeH / 2);

          // Right Badge (Instagram Oficial)
          const rightX = W - padX - rightBadgeW;
          drawRoundedRect(ctx, rightX, curY, rightBadgeW, badgeH, badgeRadius);
          const instaGrad = ctx.createLinearGradient(rightX, 0, rightX + rightBadgeW, 0);
          instaGrad.addColorStop(0, '#f09433');
          instaGrad.addColorStop(0.5, '#dc2743');
          instaGrad.addColorStop(1, '#bc1888');
          ctx.fillStyle = instaGrad;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = Math.max(1, Math.round(1.5 * s));
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = `800 ${Math.round(12.5 * s)}px ${fontBody}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(rightBadgeText, rightX + badgePadX, curY + badgeH / 2);

          curY += badgeH + sectionGap;
        } else {
          // Stacked Badges quando a largura for estreita
          drawRoundedRect(ctx, padX, curY, leftBadgeW, badgeH, badgeRadius);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
          ctx.lineWidth = Math.max(1, Math.round(1.5 * s));
          ctx.stroke();

          ctx.fillStyle = '#fbbf24';
          ctx.font = `bold ${Math.round(13 * s)}px ${fontBody}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(leftBadgeText, padX + badgePadX, curY + badgeH / 2);

          curY += badgeH + Math.round(8 * s);

          drawRoundedRect(ctx, padX, curY, rightBadgeW, badgeH, badgeRadius);
          const instaGrad = ctx.createLinearGradient(padX, 0, padX + rightBadgeW, 0);
          instaGrad.addColorStop(0, '#f09433');
          instaGrad.addColorStop(0.5, '#dc2743');
          instaGrad.addColorStop(1, '#bc1888');
          ctx.fillStyle = instaGrad;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = Math.max(1, Math.round(1.5 * s));
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = `800 ${Math.round(12.5 * s)}px ${fontBody}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(rightBadgeText, padX + badgePadX, curY + badgeH / 2);

          curY += badgeH + sectionGap;
        }

        // 5. Renderizar Título da Equipe Campeã com tipografia esportiva e sombra de contraste
        ctx.font = `900 ${teamFontSize}px ${fontHeading}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = Math.round(8 * s);
        ctx.shadowOffsetY = Math.round(3 * s);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(cleanTeamName, padX, curY);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        curY += teamTitleH + (validAthletes.length > 0 ? sectionGap : 0);

        // 6. Renderizar Seção dos Atletas Marcados como Chips Esportivos
        if (validAthletes.length > 0) {
          ctx.font = `800 ${Math.round(11.5 * s)}px ${fontBody}`;
          ctx.fillStyle = '#f59e0b';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(`👥 ELENCO CAMPEÃO (${validAthletes.length} ATLETAS):`, padX, curY);

          curY += labelH;

          // Renderizar linhas de chips (Nenhum atleta é cortado)
          for (const line of chipLines) {
            let cx = padX;
            for (const chip of line) {
              drawRoundedRect(ctx, cx, curY, chip.w, chipH, Math.round(8 * s));
              ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
              ctx.fill();
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
              ctx.lineWidth = Math.max(1, Math.round(1 * s));
              ctx.stroke();

              // Ícone bola de futebol
              ctx.font = `${Math.round(11.5 * s)}px sans-serif`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText('⚽', cx + Math.round(10 * s), curY + chipH / 2);

              // Nome do atleta em destaque
              ctx.font = `bold ${chipFontSize}px ${fontBody}`;
              ctx.fillStyle = '#ffffff';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(chip.name, cx + Math.round(28 * s), curY + chipH / 2);

              cx += chip.w + chipGapX;
            }
            curY += chipH + chipGapY;
          }

          curY -= chipGapY;
          curY += sectionGap;
        }

        // 7. Rodapé de Assinatura Oficial (Linha fina + xadrez croata + texto)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX, curY);
        ctx.lineTo(W - padX, curY);
        ctx.stroke();

        const footerTextY = curY + Math.round(17 * s);

        // Mini xadrez croata decorativo à esquerda e à direita
        const sq = Math.max(4, Math.round(5.5 * s));
        const drawCheckers = (startX: number, startY: number) => {
          for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 3; c++) {
              ctx.fillStyle = (r + c) % 2 === 0 ? '#dc2626' : '#ffffff';
              ctx.fillRect(startX + c * sq, startY + r * sq, sq, sq);
            }
          }
        };

        drawCheckers(padX, footerTextY - sq);
        drawCheckers(W - padX - sq * 3, footerTextY - sq);

        ctx.font = `800 ${Math.round(11 * s)}px ${fontBody}`;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🇭🇷 OUSADIA & ALEGRIA F.C. • O FUTEBOL DA QUARTA-FEIRA', W / 2, footerTextY);

        canvas.toBlob((blob) => {
          if (!blob) return fallbackToFile();
          resolve(new File([blob], 'time-da-semana-ousadia-alegria.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.94);
      } catch (drawErr) {
        console.warn("Erro ao gerar arte com atletas:", drawErr);
        fallbackToFile();
      }
    };

    img.onerror = fallbackToFile;
    img.src = photoUrl;
  });
}

export const CoverTeamSection: React.FC<CoverTeamSectionProps> = ({
  players = [],
  user,
  currentUserRole,
  isChristmasThemeActive = false
}) => {
  const [coverTeam, setCoverTeam] = useState<CoverTeam | null>(null);
  const [historyList, setHistoryList] = useState<CoverTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Estados de compartilhamento direto
  const [isSharing, setIsSharing] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Estados do formulário de edição
  const [isSaving, setIsSaving] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [formData, setFormData] = useState({
    teamName: '',
    photoUrl: '',
    matchDate: '',
    editionTitle: '',
    caption: '',
    instagramUrl: '',
    playerIds: [] as string[],
    highlightPlayer: ''
  });
  const [photoMode, setPhotoMode] = useState<'gallery' | 'camera' | 'url'>('gallery');
  const [availableTeamsFromSession, setAvailableTeamsFromSession] = useState<any[]>([]);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const isMaster = user?.email === MASTER_ADMIN_EMAIL;
  const isAdmin = isMaster || currentUserRole === 'admin';

  // Carregar capa atual em tempo real
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "coverTeam"), (docSnap) => {
      if (docSnap.exists()) {
        setCoverTeam(docSnap.data() as CoverTeam);
      } else {
        setCoverTeam(null);
      }
      setIsLoading(false);
    }, (err) => {
      console.warn("Erro ao carregar time capa:", err);
      setIsLoading(false);
    });

    return () => unsub();
  }, []);

  // Formatador da data da conquista (seguro contra valores nulos)
  const formattedMatchDate = (() => {
    if (!coverTeam?.matchDate) return '';
    try {
      const parts = coverTeam.matchDate.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      }
      return coverTeam.matchDate;
    } catch {
      return coverTeam.matchDate;
    }
  })();

  // Atletas escalados no time da capa
  const squadPlayers = (coverTeam?.playerIds || []).map(id => {
    return players.find(p => p.id === id) || {
      id,
      name: coverTeam?.playerNames?.[coverTeam.playerIds?.indexOf(id) || 0] || 'Atleta',
      photoUrl: `https://ui-avatars.com/api/?name=Atleta&background=003a75&color=fff`,
      position: 'Linha'
    };
  });

  // Carregar histórico de capas anteriores
  const loadHistory = async () => {
    try {
      const q = query(collection(db, "coverTeamHistory"), orderBy("createdAt", "desc"), limit(20));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as CoverTeam));
      setHistoryList(items);
    } catch (e) {
      console.warn("Erro ao buscar histórico de capas:", e);
    }
  };

  // Carregar equipes da sessão ativa para preenchimento com 1 clique
  const loadSessionTeams = async () => {
    try {
      const snap = await doc(db, "sessions", "current");
      onSnapshot(snap, (s) => {
        if (s.exists()) {
          const d = s.data();
          if (Array.isArray(d?.teams)) {
            setAvailableTeamsFromSession(d.teams);
          }
        }
      });
    } catch {}
  };

  // Abrir modal automaticamente se solicitado de outra tela (ex: final da pelada no Sorteio & Equipes)
  useEffect(() => {
    try {
      const openModal = localStorage.getItem('oa_open_cover_modal');
      const selectedTeamRaw = localStorage.getItem('oa_selected_cover_team');
      if (openModal === 'true' && isAdmin) {
        localStorage.removeItem('oa_open_cover_modal');
        let prefilledTeam = null;
        if (selectedTeamRaw) {
          try {
            prefilledTeam = JSON.parse(selectedTeamRaw);
            localStorage.removeItem('oa_selected_cover_team');
          } catch {}
        }
        handleOpenEditModal(prefilledTeam);
      }
    } catch {}

    const handleCustomEvent = (e: any) => {
      if (isAdmin) handleOpenEditModal(e?.detail);
    };
    window.addEventListener('oa_open_cover_modal', handleCustomEvent);
    return () => window.removeEventListener('oa_open_cover_modal', handleCustomEvent);
  }, [isAdmin, coverTeam]);

  const handleOpenEditModal = (prefilledTeam?: any) => {
    loadSessionTeams();
    const todayStr = new Date().toISOString().split('T')[0];
    if (prefilledTeam) {
      setFormData({
        teamName: prefilledTeam.teamName || prefilledTeam.name || 'Time Campeão',
        photoUrl: '',
        matchDate: prefilledTeam.matchDate || todayStr,
        editionTitle: 'Time da Semana',
        caption: 'Parabéns à equipe campeã pelo show de bola e pela vitória na pelada! 🏆⚽',
        instagramUrl: OFFICIAL_INSTAGRAM_URL,
        playerIds: Array.isArray(prefilledTeam.playerIds) ? prefilledTeam.playerIds : [],
        highlightPlayer: ''
      });
    } else if (coverTeam) {
      setFormData({
        teamName: coverTeam.teamName || '',
        photoUrl: coverTeam.photoUrl || '',
        matchDate: coverTeam.matchDate || todayStr,
        editionTitle: coverTeam.editionTitle || 'Time da Semana',
        caption: coverTeam.caption || '',
        instagramUrl: coverTeam.instagramUrl || OFFICIAL_INSTAGRAM_URL,
        playerIds: coverTeam.playerIds || [],
        highlightPlayer: coverTeam.highlightPlayer || ''
      });
    } else {
      setFormData({
        teamName: 'Time 1 - Campeão da Pelada',
        photoUrl: '',
        matchDate: todayStr,
        editionTitle: 'Time da Semana',
        caption: 'Parabéns à equipe campeã pelo show de bola e pela vitória na pelada! 🏆⚽',
        instagramUrl: OFFICIAL_INSTAGRAM_URL,
        playerIds: [],
        highlightPlayer: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("Por favor selecione um arquivo de imagem válido.");
      return;
    }

    setIsCompressing(true);
    try {
      const compressedBase64 = await compressCoverPhoto(file);
      setFormData(prev => ({ ...prev, photoUrl: compressedBase64 }));
    } catch (err) {
      alert("Erro ao processar imagem. Tente novamente.");
    } finally {
      setIsCompressing(false);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleApplyTeamFromSession = (team: any) => {
    if (!team) return;
    setFormData(prev => ({
      ...prev,
      teamName: team.name || prev.teamName,
      playerIds: Array.isArray(team.playerIds) ? team.playerIds : prev.playerIds
    }));
  };

  const handleTogglePlayer = (playerId: string) => {
    setFormData(prev => {
      const exists = prev.playerIds.includes(playerId);
      const next = exists 
        ? prev.playerIds.filter(id => id !== playerId)
        : [...prev.playerIds, playerId];
      return { ...prev, playerIds: next };
    });
  };

  const handleSaveCoverTeam = async () => {
    if (!formData.photoUrl.trim()) {
      alert("Adicione uma foto do time (faça upload ou insira um link da foto).");
      return;
    }

    if (!formData.teamName.trim()) {
      alert("Informe o nome do time.");
      return;
    }

    setIsSaving(true);
    try {
      // Normalizar link do Instagram se o usuário digitou apenas @usuario
      let cleanInsta = (formData.instagramUrl || '').trim();
      if (cleanInsta && !cleanInsta.startsWith('http')) {
        if (cleanInsta.startsWith('@')) {
          cleanInsta = `https://www.instagram.com/${cleanInsta.replace('@', '')}/`;
        } else if (!cleanInsta.includes('/')) {
          cleanInsta = `https://www.instagram.com/${cleanInsta}/`;
        }
      }

      const playerNames = formData.playerIds
        .map(id => players.find(p => p.id === id)?.name)
        .filter(Boolean) as string[];

      const payload: CoverTeam = {
        teamName: formData.teamName.trim(),
        photoUrl: formData.photoUrl.trim(),
        matchDate: formData.matchDate || new Date().toISOString().split('T')[0],
        editionTitle: formData.editionTitle.trim() || 'Time Capa da Semana',
        caption: formData.caption.trim(),
        instagramUrl: cleanInsta,
        playerIds: formData.playerIds,
        playerNames: playerNames,
        highlightPlayer: formData.highlightPlayer.trim() || undefined,
        createdAt: coverTeam?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: user?.displayName || user?.email || 'Admin'
      };

      // 1. Atualizar a capa principal em settings/coverTeam
      await setDoc(doc(db, "settings", "coverTeam"), payload, { merge: true });

      // 2. Salvar também no histórico de capas para a galeria permanente
      await addDoc(collection(db, "coverTeamHistory"), {
        ...payload,
        archivedAt: new Date().toISOString()
      });

      setIsModalOpen(false);
      alert("📸 Time Capa da Semana publicado com sucesso!");
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar o time capa.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveCover = async () => {
    if (!confirm("Deseja realmente remover o destaque do Time Capa atual?")) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, "settings", "coverTeam"));
      setIsModalOpen(false);
      alert("Time capa removido.");
    } catch {
      alert("Erro ao remover capa.");
    } finally {
      setIsSaving(false);
    }
  };

  const getShareCaption = () => {
    if (!coverTeam) return '';
    const athleteNames = squadPlayers.map(p => p.name).filter(Boolean);
    const athleteList = athleteNames.length > 0
      ? `👥 *ATLETAS CAMPEÕES:*\n${athleteNames.map(n => `⚽ ${n}`).join('\n')}\n\n`
      : '';

    return (
      `📸 *TIME DA SEMANA • OUSADIA & ALEGRIA F.C.* 🇭🇷\n` +
      `🏆 *${coverTeam.teamName}*\n` +
      (formattedMatchDate ? `📅 *Rodada de ${formattedMatchDate}*\n` : '') +
      (coverTeam.caption ? `💬 "${coverTeam.caption}"\n\n` : '\n') +
      athleteList +
      `👏 Parabéns à equipe pelo show de bola na pelada!\n\n` +
      `📷 Siga nosso Instagram oficial:\n` +
      `${coverTeam.instagramUrl || OFFICIAL_INSTAGRAM_URL}`
    );
  };

  const handleShare = async () => {
    if (!coverTeam || isSharing) return;
    setIsSharing(true);
    setShareFeedback(null);
    const caption = getShareCaption();
    const athleteNames = squadPlayers.map(p => p.name).filter(Boolean);

    // Timer de segurança de 3.5 segundos para garantir que o botão NUNCA fique travado
    const safetyTimer = setTimeout(() => {
      setIsSharing(false);
    }, 3500);

    try {
      // Gera a foto com a faixa dos atletas marcados incorporada na imagem
      const file = await generatePhotoWithTaggedAthletes(
        coverTeam.photoUrl,
        coverTeam.teamName,
        athleteNames,
        formattedMatchDate,
        isChristmasThemeActive
      );

      let canShareFiles = false;
      try {
        canShareFiles = !!(typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] }));
      } catch {
        canShareFiles = false;
      }

      if (canShareFiles) {
        try {
          const sharePromise = navigator.share({
            files: [file],
            title: `🏆 ${coverTeam.teamName} • Time da Semana`,
            text: caption
          });

          // No mobile o share sheet abre imediatamente
          setTimeout(() => {
            clearTimeout(safetyTimer);
            setIsSharing(false);
            setShareFeedback("📸 Janela de envio aberta! Escolha o WhatsApp da turma.");
          }, 1000);

          await sharePromise;
          clearTimeout(safetyTimer);
          setIsSharing(false);
          setShareFeedback("Foto compartilhada com sucesso!");
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') {
            clearTimeout(safetyTimer);
            setIsSharing(false);
            return;
          }
          console.warn("Falha no share nativo com arquivo, acionando fallback:", shareErr);
        }
      }

      // Fallback amigável para PC/WhatsApp Web: cópia para área de transferência + download + link do WhatsApp
      let copied = false;
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          const item = new ClipboardItem({ [file.type]: file });
          await navigator.clipboard.write([item]);
          copied = true;
        } catch {}
      }

      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();

      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(caption)}`, '_blank');

      clearTimeout(safetyTimer);
      setIsSharing(false);

      if (copied) {
        setShareFeedback("📸 Foto com atletas copiada e baixada! No WhatsApp Web, aperte Ctrl+V no grupo para colar a foto.");
      } else {
        setShareFeedback("📸 Foto com atletas baixada no seu aparelho! Basta anexá-la no grupo.");
      }
    } catch (err: any) {
      clearTimeout(safetyTimer);
      setIsSharing(false);
      console.warn("Erro ao compartilhar foto:", err);
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(caption)}`, '_blank');
      setShareFeedback("Abrindo WhatsApp com a legenda e atletas...");
    }
  };

  const handleCopyImage = async () => {
    if (!coverTeam) return;
    try {
      const athleteNames = squadPlayers.map(p => p.name).filter(Boolean);
      const file = await generatePhotoWithTaggedAthletes(
        coverTeam.photoUrl,
        coverTeam.teamName,
        athleteNames,
        formattedMatchDate,
        isChristmasThemeActive
      );

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const item = new ClipboardItem({ [file.type]: file });
        await navigator.clipboard.write([item]);
        setShareFeedback("✅ Foto com atletas copiada! No WhatsApp Web, aperte Ctrl+V no grupo.");
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(file);
        link.download = file.name;
        link.click();
        setShareFeedback("📥 Foto baixada no seu aparelho!");
      }
    } catch {
      setShareFeedback("Não foi possível copiar diretamente. Clique em Baixar Foto.");
    }
  };

  const handleDownloadImage = async () => {
    if (!coverTeam) return;
    try {
      const athleteNames = squadPlayers.map(p => p.name).filter(Boolean);
      const file = await generatePhotoWithTaggedAthletes(
        coverTeam.photoUrl,
        coverTeam.teamName,
        athleteNames,
        formattedMatchDate,
        isChristmasThemeActive
      );

      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
      setShareFeedback("📥 Download iniciado!");
    } catch {
      setShareFeedback("Erro ao baixar a imagem.");
    }
  };

  if (isLoading) {
    return null;
  }

  // Se não houver capa cadastrada ainda:
  if (!coverTeam) {
    if (!isAdmin) {
      // Atleta comum: pequeno banner de convite para acompanhar o Instagram
      return (
        <div className="w-full rounded-2xl bg-gradient-to-r from-navy-deep via-[#2d1b4e] to-slate-950 p-4 border border-purple-500/30 text-white shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shrink-0 shadow-md">
              <InstagramIcon className="w-5 h-5" color="#ffffff" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                  Instagram Oficial
                </span>
                <span className="text-xs font-bold text-amber-300">📸 Time da Semana</span>
              </div>
              <p className="text-xs text-white/80 mt-0.5">
                Ao final da pelada, a foto da equipe campeã é tirada e destacada aqui e no nosso perfil!
              </p>
            </div>
          </div>
          <a
            href={OFFICIAL_INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
          >
            <InstagramIcon className="w-4 h-4" color="#ffffff" />
            <span>Seguir {OFFICIAL_INSTAGRAM_HANDLE}</span>
          </a>
        </div>
      );
    }

    // Diretoria (Admin): Card atrativo de convite para publicar a primeira foto da semana
    return (
      <div className="w-full rounded-2xl bg-gradient-to-r from-navy-deep via-[#1e1e38] to-slate-900 p-4 sm:p-5 border-2 border-dashed border-amber-400/50 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shrink-0 shadow-lg shadow-rose-900/40">
            <span className="material-symbols-outlined text-[26px]">photo_camera</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-label-md text-[10px] font-black uppercase tracking-wider">
                DESTAQUE
              </span>
              <h3 className="font-headline-sm text-sm sm:text-base font-bold text-white">
                Time da Semana (Rodada Anterior)
              </h3>
            </div>
            <p className="text-xs text-white/80 mt-1 leading-relaxed">
              Exiba a foto do time campeão da rodada anterior! Faça o upload direto da galeria do celular ou cole uma URL, com link para o Instagram oficial da pelada.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenEditModal}
          className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-700 text-slate-950 font-headline-sm text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-amber-500/25 active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">photo_library</span>
          <span>Definir Time da Semana</span>
        </button>

        {isModalOpen && renderModal()}
      </div>
    );
  }

  // Render do Modal de Edição/Criação da Capa
  function renderModal() {
    if (typeof document === 'undefined') return null;

    return createPortal(
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999 }}
        className="bg-navy-deep/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSaving && !isCompressing) setIsModalOpen(false);
        }}
      >
        <div
          className="bg-white text-navy-deep max-w-lg w-full max-h-[92dvh] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-surface-container-high/60 shadow-2xl flex flex-col gap-4 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-surface-container-high/40 pb-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shadow-xs">
                <span className="material-symbols-outlined text-[22px]">photo_camera</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-sm sm:text-base text-navy-deep font-bold">
                  {coverTeam ? 'Editar Time da Semana (Rodada Anterior)' : 'Publicar Time da Semana (Rodada Anterior)'}
                </h3>
                <p className="text-[11px] text-outline">Destaque oficial da equipe campeã no app e no Instagram</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={isSaving || isCompressing}
              className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Form Scrollable Area */}
          <div className="flex flex-col gap-3.5 overflow-y-auto min-h-0 flex-1 pr-1">
            {/* Foto do Time */}
            <div className="space-y-2">
              <label className="font-label-md text-xs text-navy-deep font-bold flex items-center justify-between">
                <span>FOTO OFICIAL DO TIME *</span>
                <span className="text-[10px] text-outline font-semibold">Tirada no final da pelada</span>
              </label>

              {/* Botões de Escolha: Galeria, Câmera ou URL */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPhotoMode('gallery')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all border flex flex-col sm:flex-row items-center justify-center gap-1 text-center ${
                    photoMode === 'gallery'
                      ? 'bg-navy-deep text-white border-navy-deep shadow-xs'
                      : 'bg-surface-container text-outline hover:text-navy-deep border-transparent'
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">photo_library</span>
                  <span>Galeria</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoMode('camera')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all border flex flex-col sm:flex-row items-center justify-center gap-1 text-center ${
                    photoMode === 'camera'
                      ? 'bg-navy-deep text-white border-navy-deep shadow-xs'
                      : 'bg-surface-container text-outline hover:text-navy-deep border-transparent'
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">photo_camera</span>
                  <span>Câmera</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoMode('url')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all border flex flex-col sm:flex-row items-center justify-center gap-1 text-center ${
                    photoMode === 'url'
                      ? 'bg-navy-deep text-white border-navy-deep shadow-xs'
                      : 'bg-surface-container text-outline hover:text-navy-deep border-transparent'
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">link</span>
                  <span>URL Imagem</span>
                </button>
              </div>

              {photoMode === 'gallery' ? (
                <div>
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isCompressing}
                    className="w-full min-h-[52px] py-3 px-4 rounded-xl border-2 border-dashed border-primary-container/50 hover:border-primary-container bg-surface-container-low hover:bg-surface-container text-navy-deep font-headline-sm text-xs sm:text-sm font-bold flex items-center justify-center gap-2 active:scale-98 transition-all"
                  >
                    {isCompressing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
                        <span>Otimizando foto da galeria...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[22px] text-primary-container">photo_library</span>
                        <span>{formData.photoUrl ? 'Escolher Outra Foto da Galeria' : 'Escolher Foto da Galeria do Celular'}</span>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-outline mt-1 text-center">
                    Abre suas fotos/álbuns do celular com otimização automática para o app.
                  </p>
                </div>
              ) : photoMode === 'camera' ? (
                <div>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isCompressing}
                    className="w-full min-h-[52px] py-3 px-4 rounded-xl border-2 border-dashed border-amber-500/50 hover:border-amber-600 bg-amber-50/50 hover:bg-amber-50 text-amber-950 font-headline-sm text-xs sm:text-sm font-bold flex items-center justify-center gap-2 active:scale-98 transition-all"
                  >
                    {isCompressing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                        <span>Processando captura...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[22px] text-amber-600">photo_camera</span>
                        <span>{formData.photoUrl ? 'Tirar Outra Foto com a Câmera' : 'Abrir Câmera e Tirar Foto'}</span>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-outline mt-1 text-center">
                    Tira a foto da equipe no fim da pelada instantaneamente.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <input
                    type="url"
                    placeholder="https://exemplo.com/foto-time-da-semana.jpg ou URL do Firestore"
                    value={formData.photoUrl}
                    onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-semibold"
                  />
                  <p className="text-[11px] text-outline">
                    Cole o link direto da imagem hospedada no Firestore, Cloud Storage ou web.
                  </p>
                </div>
              )}

              {/* Preview da Imagem Sem Cortes */}
              {formData.photoUrl && (
                <div className="relative w-full h-56 rounded-xl overflow-hidden bg-slate-950 border border-surface-container-high/60 shadow-inner group flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-cover bg-center blur-xl opacity-35 scale-110 pointer-events-none"
                    style={{ backgroundImage: `url(${formData.photoUrl})` }}
                  />
                  <img
                    src={formData.photoUrl}
                    alt="Pré-visualização do time da semana"
                    className="w-full h-full object-contain relative z-10"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, photoUrl: '' })}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold shadow-md flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      <span>Remover Foto</span>
                    </button>
                  </div>
                  <span className="absolute bottom-2 left-2 px-2.5 py-1 rounded bg-black/75 text-white text-[10px] font-bold z-20 flex items-center gap-1">
                    <span>✅</span>
                    <span>Foto Completa sem Cortes</span>
                  </span>
                </div>
              )}
            </div>

            {/* Atalho: Carregar Equipe da Última Pelada */}
            {availableTeamsFromSession.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-amber-700">bolt</span>
                  <span>Preencher com uma equipe da última pelada:</span>
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {availableTeamsFromSession.map((t, idx) => (
                    <button
                      key={t.id || idx}
                      type="button"
                      onClick={() => handleApplyTeamFromSession(t)}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-amber-950 font-label-md text-xs font-bold active:scale-95 transition-all"
                    >
                      ⚽ {t.name} ({t.playerIds?.length || 0} atletas)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Nome do Time e Título */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-label-md text-xs text-navy-deep font-bold block mb-1">
                  NOME DA EQUIPE *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Time 1 - Campeão"
                  value={formData.teamName}
                  onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-bold"
                />
              </div>

              <div>
                <label className="font-label-md text-xs text-navy-deep font-bold block mb-1">
                  DATA DA PELADA
                </label>
                <input
                  type="date"
                  value={formData.matchDate}
                  onChange={(e) => setFormData({ ...formData, matchDate: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-bold"
                />
              </div>
            </div>

            {/* Link do Post do Instagram */}
            <div>
              <label className="font-label-md text-xs text-navy-deep font-bold flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5">
                  <InstagramIcon className="w-3.5 h-3.5 text-rose-600" color="#dc2743" />
                  <span>LINK DO POST OU PERFIL DO INSTAGRAM</span>
                </span>
                <span className="text-[10px] text-outline font-normal">Opcional</span>
              </label>
              <input
                type="text"
                placeholder="Ex: https://www.instagram.com/p/C-xyz... ou @ousadiaealegriapelada"
                value={formData.instagramUrl}
                onChange={(e) => setFormData({ ...formData, instagramUrl: e.target.value })}
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-semibold"
              />
              <span className="text-[10px] text-outline mt-1 block">
                Ao clicar no card, os atletas serão direcionados diretamente para o post/perfil para curtir e comentar!
              </span>
            </div>

            {/* Legenda / Mensagem da Conquista */}
            <div>
              <label className="font-label-md text-xs text-navy-deep font-bold block mb-1">
                LEGENDA / COMEMORAÇÃO
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Equipe invicta da noite com 4 vitórias seguidas! Show de bola na Granja Cantinho do Céu."
                value={formData.caption}
                onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-semibold resize-none"
              />
            </div>

            {/* Seleção de Atletas do Time Campeão */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-label-md text-xs text-navy-deep font-bold">
                  ATLETAS DO TIME ({formData.playerIds.length} selecionado{formData.playerIds.length === 1 ? '' : 's'})
                </label>
                <span className="text-[10px] text-outline font-medium">Toque para marcar/desmarcar</span>
              </div>

              <div className="max-h-36 overflow-y-auto p-2 bg-surface-container-low rounded-xl border border-surface-container-high/60 flex flex-wrap gap-1.5">
                {players.map(p => {
                  const isSelected = formData.playerIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleTogglePlayer(p.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        isSelected
                          ? 'bg-primary-container text-white shadow-xs'
                          : 'bg-white hover:bg-surface-container text-navy-deep border border-surface-container-high/60'
                      }`}
                    >
                      <img
                        src={p.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}`}
                        alt={p.name}
                        className="w-4 h-4 rounded-full object-cover shrink-0"
                      />
                      <span className="truncate max-w-[110px]">{p.name}</span>
                      {isSelected && <span className="text-[11px]">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-surface-container-high/40 shrink-0 gap-2">
            {coverTeam ? (
              <button
                type="button"
                onClick={handleRemoveCover}
                disabled={isSaving}
                className="px-3 py-2 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all"
              >
                Remover Capa
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-surface-container-high text-navy-deep font-label-md text-xs font-bold active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCoverTeam}
                disabled={isSaving || isCompressing || !formData.photoUrl}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white font-headline-sm text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-900/20 active:scale-95 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[17px]">
                  {isSaving ? 'sync' : 'publish'}
                </span>
                <span>{isSaving ? 'Publicando...' : 'Salvar & Destacar'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Render do Lightbox em Tela Cheia com Zoom Interativo
  function renderLightbox() {
    if (!coverTeam || typeof document === 'undefined') return null;

    return createPortal(
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 100000 }}
        className="bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 select-none animate-fade-in"
        onClick={() => {
          setLightboxZoom(1);
          setIsLightboxOpen(false);
        }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between text-white z-20 gap-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl shrink-0">📸</span>
            <div className="min-w-0">
              <h4 className="font-headline-sm text-sm sm:text-base font-bold text-white truncate">
                {coverTeam.teamName}
              </h4>
              <p className="text-xs text-white/70 truncate">{formattedMatchDate || 'Time Capa da Semana'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Controles de Zoom */}
            <div className="flex items-center bg-white/10 rounded-full p-0.5 border border-white/20">
              <button
                type="button"
                onClick={() => setLightboxZoom(z => Math.max(1, +(z - 0.25).toFixed(2)))}
                disabled={lightboxZoom <= 1}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 text-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Reduzir Zoom"
              >
                <span className="material-symbols-outlined text-[18px]">remove</span>
              </button>
              <button
                type="button"
                onClick={() => setLightboxZoom(1)}
                className="px-2 text-xs font-mono font-bold text-amber-300 hover:underline"
                title="Redefinir Zoom (100%)"
              >
                {Math.round(lightboxZoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setLightboxZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))}
                disabled={lightboxZoom >= 3}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 text-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Aumentar Zoom"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setLightboxZoom(1);
                setIsLightboxOpen(false);
              }}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
              title="Fechar tela cheia"
            >
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
          </div>
        </div>

        {/* Center Image - Sem cortes, com zoom e rolagem suave se ampliada */}
        <div 
          className="flex-1 flex items-center justify-center p-2 min-h-0 overflow-auto scrollbar-none" 
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={coverTeam.photoUrl}
            alt={coverTeam.teamName}
            style={{
              transform: `scale(${lightboxZoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)'
            }}
            className="max-w-full max-h-[82dvh] object-contain rounded-xl shadow-2xl cursor-pointer"
            onClick={() => setLightboxZoom(z => z >= 2 ? 1 : +(z + 0.5).toFixed(2))}
            title="Toque na foto para alternar o zoom"
          />
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-center gap-2.5 pt-2 z-20" onClick={(e) => e.stopPropagation()}>
          {squadPlayers.length > 0 && (
            <div className="w-full text-center px-4 py-2.5 rounded-xl bg-black/80 backdrop-blur-md border border-amber-400/25 max-w-2xl mx-auto shadow-2xl flex flex-col gap-1.5">
              <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider">
                👥 Atletas Marcados na Foto ({squadPlayers.length} Campeões)
              </span>
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {squadPlayers.map(p => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-xs font-bold text-white shadow-xs"
                  >
                    <span className="text-[10px]">⚽</span>
                    <span>{p.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-center gap-2.5 flex-wrap">
            <a
              href={coverTeam.instagramUrl || OFFICIAL_INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
            >
              <InstagramIcon className="w-4 h-4" color="#ffffff" />
              <span>Ver no Instagram Oficial</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </a>
            <button
              type="button"
              onClick={handleShare}
              disabled={isSharing}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/40 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
            >
              <WhatsAppIcon className="w-4 h-4 fill-current text-white" />
              <span>{isSharing ? 'Preparando...' : 'Compartilhar Foto no Zap'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadImage}
              className="px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
              title="Baixar Foto com os atletas marcados"
            >
              <span className="material-symbols-outlined text-[17px] text-amber-400">download</span>
              <span>Baixar Foto</span>
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Render do Histórico de Capas Anteriores
  function renderHistoryModal() {
    if (typeof document === 'undefined') return null;

    return createPortal(
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999 }}
        className="bg-navy-deep/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-hidden"
        onClick={() => setIsHistoryModalOpen(false)}
      >
        <div
          className="bg-white text-navy-deep max-w-2xl w-full max-h-[88dvh] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-surface-container-high/60 shadow-2xl flex flex-col gap-4 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-surface-container-high/40 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏆</span>
              <div>
                <h3 className="font-headline-sm text-base text-navy-deep font-bold">
                  Mural das Capas da Semana
                </h3>
                <p className="text-xs text-outline">Galeria com as fotos dos times campeões de cada pelada</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsHistoryModalOpen(false)}
              className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className="overflow-y-auto min-h-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3.5 pr-1">
            {historyList.length === 0 ? (
              <div className="sm:col-span-2 text-center py-8 text-outline text-xs">
                Nenhuma foto anterior arquivada ainda.
              </div>
            ) : (
              historyList.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="rounded-xl border border-surface-container-high/60 overflow-hidden bg-surface-container-lowest flex flex-col shadow-xs"
                >
                  <div className="relative h-40 bg-slate-900 overflow-hidden">
                    <img
                      src={item.photoUrl}
                      alt={item.teamName}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold">
                      {item.matchDate || 'Pelada'}
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-1.5 flex-1 justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-navy-deep">{item.teamName}</h4>
                      {item.caption && <p className="text-[11px] text-outline line-clamp-2 mt-0.5">{item.caption}</p>}
                    </div>
                    {item.instagramUrl && (
                      <a
                        href={item.instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-rose-600 font-bold hover:underline flex items-center gap-1 mt-1"
                      >
                        <InstagramIcon className="w-3 h-3" color="#dc2743" />
                        <span>Ver no Instagram</span>
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className={`w-full rounded-2xl sm:rounded-3xl bg-surface-container-lowest p-3.5 sm:p-5 shadow-[0_12px_36px_rgba(0,58,117,0.06)] border ${isChristmasThemeActive ? 'border-amber-400/50 shadow-rose-950/10' : 'border-amber-400/30'} overflow-hidden relative group`}>
      {/* Detalhe superior brilhante */}
      <div className={`absolute top-0 left-0 right-0 h-1.5 ${isChristmasThemeActive ? 'bg-gradient-to-r from-red-600 via-amber-400 to-emerald-600' : 'bg-gradient-to-r from-amber-400 via-rose-500 to-purple-600'}`} />

      {/* Header do Card */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-surface-container-high/50 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shrink-0 shadow-sm shadow-rose-900/30">
            <InstagramIcon className="w-5 h-5" color="#ffffff" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full ${isChristmasThemeActive ? 'bg-gradient-to-r from-red-600 via-amber-500 to-emerald-700 text-white shadow-xs' : 'bg-amber-400 text-slate-950'} font-label-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1`}>
                <span>{isChristmasThemeActive ? '🎅' : '⭐'}</span>
                <span>{isChristmasThemeActive ? 'TIME DA SEMANA • EDIÇÃO DE NATAL' : 'TIME DA SEMANA • RODADA ANTERIOR'}</span>
              </span>
              {formattedMatchDate && (
                <span className="text-[11px] font-semibold text-outline">
                  {formattedMatchDate}
                </span>
              )}
            </div>
            <h3 className="font-headline-sm text-sm sm:text-base font-extrabold text-navy-deep truncate mt-0.5">
              {coverTeam.teamName}
            </h3>
          </div>
        </div>

        {/* Ações no Header */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              loadHistory();
              setIsHistoryModalOpen(true);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-navy-deep font-label-md text-xs font-bold border border-surface-container-high/60 flex items-center gap-1 active:scale-95 transition-all"
            title="Ver galeria de capas de edições anteriores"
          >
            <span className="material-symbols-outlined text-[16px] text-amber-600">history_edu</span>
            <span className="hidden sm:inline">Galeria</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenEditModal}
              className="px-3 py-1.5 rounded-xl bg-navy-deep hover:bg-slate-900 text-white font-headline-sm text-xs font-bold flex items-center gap-1 shadow-xs active:scale-95 transition-all"
              title="Trocar a foto ou editar informações do Time da Semana"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              <span>Editar Time</span>
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo Principal: Foto Panorâmica com Efeito Instagram */}
      <div className="mt-3.5 flex flex-col gap-3">
        {/* Container da Foto 100% visível, SEM CORTES nem texto cobrindo os atletas */}
        <div
          onClick={() => {
            setLightboxZoom(1);
            setIsLightboxOpen(true);
          }}
          className="relative w-full rounded-2xl overflow-hidden bg-slate-950 cursor-pointer shadow-lg group border border-slate-800/80 flex items-center justify-center p-1 sm:p-2.5 transition-all hover:border-amber-400/50"
          title="Toque para ver a foto completa sem cortes e com zoom"
        >
          {/* Fundo com desfoque ambiente suave gerado a partir da própria foto */}
          <div
            className="absolute inset-0 bg-cover bg-center blur-2xl opacity-25 scale-110 pointer-events-none"
            style={{ backgroundImage: `url(${coverTeam.photoUrl})` }}
          />

          {/* Foto oficial 100% visível, SEM CORTES, adaptada a qualquer proporção (retrato, paisagem, quadrada) */}
          <img
            src={coverTeam.photoUrl}
            alt={coverTeam.teamName}
            className="w-auto h-auto max-w-full max-h-[70vh] sm:max-h-[620px] object-contain relative z-10 transition-transform duration-300 group-hover:scale-[1.01] block mx-auto rounded-xl shadow-2xl"
          />

          {/* Selos flutuantes superiores sutis (não cobrem ninguém) */}
          <div className="absolute top-3 left-3 z-20 pointer-events-none">
            <span className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-amber-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border border-white/10 shadow-sm">
              <span>🏆</span>
              <span>Foto Oficial da Turma</span>
            </span>
          </div>

          <div className="absolute top-3 right-3 z-20">
            <div className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-white text-[11px] font-bold flex items-center gap-1 shadow-sm border border-white/10 group-hover:bg-black/90 transition-colors">
              <span className="material-symbols-outlined text-[15px] text-amber-400">zoom_in</span>
              <span>Toque p/ Ampliar</span>
            </div>
          </div>

          {/* Faixa com atletas marcados estilo tag do Instagram sobre a foto */}
          {squadPlayers.length > 0 && (
            <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 pointer-events-none">
              <div className="bg-slate-950/85 backdrop-blur-md rounded-xl p-2.5 border border-amber-400/30 shadow-2xl flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm shrink-0">👥</span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 truncate">
                      Atletas Marcados na Foto ({squadPlayers.length})
                    </span>
                  </div>
                  <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 shrink-0">
                    🏆 Campeões
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap max-h-16 overflow-hidden">
                  {squadPlayers.map(p => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-[11px] font-bold text-white shadow-xs"
                    >
                      <span className="text-[9px]">⚽</span>
                      <span>{p.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bloco de Destaque da Equipe Campeã & Instagram Oficial (Abaixo da foto, sem encobrir ninguém) */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface-container-low border border-surface-container-high/60 flex flex-col gap-3 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <span>🏆</span>
                  <span>CAMPEÕES DA RODADA ANTERIOR</span>
                </span>
                {formattedMatchDate && (
                  <span className="text-[11px] font-semibold text-outline">
                    Rodada de {formattedMatchDate}
                  </span>
                )}
              </div>
              <h4 className="font-headline-sm text-base sm:text-xl font-black text-navy-deep truncate mt-1">
                {coverTeam.teamName}
              </h4>
            </div>

            {/* Link em destaque para o Instagram Oficial da Pelada */}
            <a
              href={coverTeam.instagramUrl || OFFICIAL_INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white font-headline-sm text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-rose-900/30 shrink-0 active:scale-95 transition-all"
            >
              <InstagramIcon className="w-4 h-4 sm:w-5 sm:h-5" color="#ffffff" />
              <span>Ver no Instagram Oficial</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </a>
          </div>

          {/* Legenda Oficial */}
          {coverTeam.caption && (
            <p className="text-xs sm:text-sm text-navy-deep font-medium leading-relaxed bg-surface-container-lowest p-3 rounded-xl border border-surface-container-high/40">
              &ldquo;{coverTeam.caption}&rdquo;
            </p>
          )}
        </div>

        {/* Atletas do Time Campeão em Destaque */}
        {squadPlayers.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] text-outline font-bold">
              <span>ELENCO DA CAPA ({squadPlayers.length} ATLETAS)</span>
              <span>PARABÉNS AOS CAMPEÕES! 👏</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {squadPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface-container-low border border-surface-container-high/60 shrink-0 shadow-2xs hover:bg-surface-container transition-colors"
                >
                  <img
                    src={p.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=003a75&color=fff`}
                    alt={p.name}
                    className="w-6 h-6 rounded-full object-cover shrink-0 border border-white"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-xs text-navy-deep leading-tight truncate max-w-[120px]">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-outline font-semibold leading-none">
                      {p.position || 'Atleta'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feedback de compartilhamento / cópia não-intrusivo */}
        {shareFeedback && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-xs font-bold flex items-center justify-between gap-2 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
              <span>{shareFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setShareFeedback(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-bold p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Barra de Ações Inferior: Compartilhar & Instagram */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-surface-container-high/40 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleShare}
              disabled={isSharing}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-green-600 to-emerald-700 hover:from-emerald-500 hover:to-green-600 text-white font-headline-sm text-xs sm:text-sm font-bold flex items-center gap-2 shadow-md shadow-emerald-900/30 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
            >
              <WhatsAppIcon className="w-4 h-4 fill-current text-white" />
              <span>{isSharing ? 'Preparando Foto...' : 'Compartilhar Foto no Zap'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyImage}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-navy-deep font-label-md text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              title="Copiar imagem com os atletas marcados para colar no WhatsApp Web (Ctrl+V)"
            >
              <span className="material-symbols-outlined text-[17px] text-emerald-600">content_copy</span>
              <span className="hidden sm:inline">Copiar</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadImage}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-navy-deep font-label-md text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              title="Baixar imagem com os atletas marcados"
            >
              <span className="material-symbols-outlined text-[17px] text-blue-600">download</span>
              <span className="hidden sm:inline">Baixar</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setLightboxZoom(1);
                setIsLightboxOpen(true);
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-navy-deep font-label-md text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px] text-amber-600">fullscreen</span>
              <span>Tela Cheia</span>
            </button>

            <a
              href={coverTeam.instagramUrl || OFFICIAL_INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white font-headline-sm text-xs font-bold flex items-center gap-2 shadow-sm shadow-rose-900/20 active:scale-95 transition-all"
            >
              <InstagramIcon className="w-4 h-4" color="#ffffff" />
              <span>{OFFICIAL_INSTAGRAM_HANDLE}</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </a>
          </div>
        </div>
      </div>

      {isModalOpen && renderModal()}
      {isLightboxOpen && renderLightbox()}
      {isHistoryModalOpen && renderHistoryModal()}
    </div>
  );
};
