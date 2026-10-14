import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { MAIN_LOGO_URL } from '../constants.tsx';

interface PWAInstallButtonProps {
  variant?: 'header' | 'banner' | 'card';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  variant = 'header',
  className = ''
}) => {
  const { isInstalled, isInstallable, isIOS, isAndroid, isInAppBrowser, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Regra estrita: se o app já estiver instalado de forma correta, NÃO exibir nada
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (!success) {
        // Se o usuário não aceitou ou navegador preferiu manual
        setShowGuideModal(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  const renderGuideModal = () => {
    if (!showGuideModal || typeof document === 'undefined') return null;

    return createPortal(
      <div 
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 999999 }}
        className="bg-navy-deep/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
        onClick={() => setShowGuideModal(false)}
      >
        <div 
          className="bg-white text-navy-deep max-w-md w-full rounded-3xl p-5 sm:p-6 shadow-2xl border border-surface-container-high/60 flex flex-col gap-4 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header com Escudo Oficial */}
          <div className="flex items-center justify-between pb-3 border-b border-surface-container-high/50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 via-primary-container to-navy-deep p-[2px] shadow-sm">
                <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center p-1">
                  <img src={MAIN_LOGO_URL} alt="O&A" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                </div>
              </div>
              <div>
                <h3 className="font-headline-sm text-base sm:text-lg font-bold text-navy-deep leading-tight">
                  Instalar Aplicativo Oficial
                </h3>
                <p className="font-body-sm text-xs text-outline">
                  Ousadia & Alegria • Pelada
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowGuideModal(false)}
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline hover:text-navy-deep transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Vantagens da Instalação Correta */}
          <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200/70 text-blue-950 flex flex-col gap-1.5 text-xs">
            <div className="flex items-center gap-2 font-bold text-blue-900">
              <span className="material-symbols-outlined text-[18px] text-amber-500">verified</span>
              <span>Por que instalar de forma correta?</span>
            </div>
            <p className="text-[11px] leading-relaxed text-blue-900/80">
              • Receba notificações e o <strong>som de apito do juiz</strong> mesmo com o <strong>aplicativo fechado</strong>.<br />
              • Ícone oficial na tela inicial sem barra de navegador.<br />
              • Acesso instantâneo em 1 toque na velocidade máxima.
            </p>
          </div>

          {/* Aviso se estiver dentro de navegador embutido (Instagram / WhatsApp) */}
          {isInAppBrowser && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5 text-xs">
              <span className="material-symbols-outlined text-[20px] text-amber-600 shrink-0">open_in_browser</span>
              <div>
                <strong>Atenção: Você está no Instagram / WhatsApp!</strong>
                <p className="text-[11px] mt-0.5 text-amber-900 leading-snug">
                  Para instalar, toque no menu de <strong>3 pontinhos (⋮)</strong> no topo da tela e selecione <strong>"Abrir no Chrome"</strong> (ou <strong>"Abrir no Safari"</strong>).
                </p>
              </div>
            </div>
          )}

          {/* Botão de Instalação Direta Automática (quando suportado nativamente) */}
          {isInstallable && (
            <button
              type="button"
              onClick={async () => {
                const ok = await install();
                if (ok) {
                  setShowGuideModal(false);
                }
              }}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-headline-sm text-sm font-bold flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">download_for_offline</span>
              <span>INSTALAR AGORA (1 CLIQUE)</span>
            </button>
          )}

          {/* Instruções Específicas por Sistema Operacional */}
          {isIOS ? (
            <div className="flex flex-col gap-3">
              <h4 className="font-headline-sm text-xs font-bold uppercase tracking-wider text-outline flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-navy-deep">phone_iphone</span>
                Como instalar no iPhone / iPad (Safari):
              </h4>
              <div className="space-y-2.5 text-xs text-navy-deep">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high/40">
                  <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    1
                  </div>
                  <div className="min-w-0">
                    Toque no botão <strong>Compartilhar</strong> na barra inferior do Safari (o ícone de um quadrado com a seta para cima <span className="inline-block px-1.5 py-0.5 rounded bg-white border text-blue-600 font-bold">↑</span>).
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high/40">
                  <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    2
                  </div>
                  <div className="min-w-0">
                    Role a lista para baixo e toque em <strong>"Adicionar à Tela de Início"</strong> (com ícone de <span className="inline-block px-1.5 py-0.5 rounded bg-white border text-blue-600 font-bold">+</span>).
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high/40">
                  <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    3
                  </div>
                  <div className="min-w-0">
                    Toque em <strong>"Adicionar"</strong> no canto superior direito. Pronto! O app estará instalado na sua tela inicial.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <h4 className="font-headline-sm text-xs font-bold uppercase tracking-wider text-outline flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-emerald-600">android</span>
                Como instalar no Android (Chrome / Samsung):
              </h4>
              <div className="space-y-2.5 text-xs text-navy-deep">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high/40">
                  <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    1
                  </div>
                  <div className="min-w-0">
                    Toque no menu de <strong>3 pontinhos (⋮)</strong> no topo direito do navegador Chrome.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high/40">
                  <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    2
                  </div>
                  <div className="min-w-0">
                    Selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high/40">
                  <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    3
                  </div>
                  <div className="min-w-0">
                    Confirme em <strong>"Instalar"</strong>. O app será baixado e fixado na tela do seu celular!
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Botão de Fechar */}
          <button
            type="button"
            onClick={() => setShowGuideModal(false)}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-navy-deep to-blue-900 text-white font-headline-sm text-xs font-bold shadow-md hover:opacity-95 active:scale-98 transition-all"
          >
            Entendi, vou instalar agora!
          </button>
        </div>
      </div>,
      document.body
    );
  };

  // 1. Variante HEADER (Botão compacto na barra de navegação)
  if (variant === 'header') {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          className={`h-9 px-3 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-label-md text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all animate-pulse ${className}`}
          title="Instalar aplicativo na tela inicial do celular"
        >
          <span className="material-symbols-outlined text-[18px]">download_for_offline</span>
          <span className="hidden xs:inline">Instalar App</span>
          <span className="xs:hidden">Instalar</span>
        </button>
        {renderGuideModal()}
      </>
    );
  }

  // 2. Variante BANNER / CARD (Destaque visual na Dashboard para quem ainda não instalou)
  return (
    <>
      <div className={`w-full rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 p-3.5 sm:p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-amber-400/60 ${className}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-950 text-amber-400 flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-[24px]">install_mobile</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-headline-sm text-xs sm:text-sm font-bold text-slate-950">
                Instale o App no seu Celular
              </h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950 text-amber-300">
                Recomendado ⭐
              </span>
            </div>
            <p className="text-[11px] text-slate-950/80 leading-snug">
              Tenha o ícone na tela inicial e receba o apito e notificações mesmo com o app fechado!
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleInstallClick}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-white font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[18px] text-amber-400">download</span>
          <span>Instalar Aplicativo</span>
        </button>
      </div>
      {renderGuideModal()}
    </>
  );
};
