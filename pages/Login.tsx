
import React, { useState } from 'react';
import { loginWithGoogle } from '../services/firebase.ts';
import { MASTER_ADMIN_EMAIL } from '../constants.tsx';

interface LoginProps {
  onDirectLogin?: (user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onDirectLogin }) => {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const logoUrl = "https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png";

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try { 
      await loginWithGoogle(); 
    } catch (err: any) { 
      console.warn("Falha no login com Google:", err);
      setLoginError("Popups do Google podem ser bloqueados no iframe do preview. Utilize o Acesso Direto abaixo para navegar no app!");
    } finally { 
      setIsLoggingIn(false); 
    }
  };

  const handleAdminAccess = () => {
    if (onDirectLogin) {
      onDirectLogin({
        uid: "master_admin_diogo",
        email: MASTER_ADMIN_EMAIL,
        displayName: "Diogo (Admin)",
        photoURL: "https://ui-avatars.com/api/?name=Diogo&background=003a75&color=fff"
      });
    }
  };

  const handleGuestAccess = () => {
    if (onDirectLogin) {
      onDirectLogin({
        uid: "atleta_convidado_preview",
        email: "convidado@ousadia.app",
        displayName: "Atleta Convidado",
        photoURL: "https://ui-avatars.com/api/?name=Atleta&background=003a75&color=fff"
      });
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Stadium Aura Background */}
      <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-primary-container/10 blur-3xl pointer-events-none animate-pulse-slow"></div>
      <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-secondary/10 blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm space-y-6 flex flex-col items-center animate-fade-in relative z-10">
        
        {/* ESCUDO DO CLUBE */}
        <div className="relative group">
           <div className="absolute inset-0 bg-primary-container/15 blur-2xl rounded-full scale-125"></div>
           <div className="w-32 h-32 sm:w-36 sm:h-36 bg-surface-container-lowest rounded-2xl p-4 border border-surface-container-high/50 shadow-[0_12px_36px_rgba(0,58,117,0.08)] flex items-center justify-center relative z-10">
             <img src={logoUrl} alt="Ousadia e Alegria" className="w-full h-full object-contain" />
           </div>
        </div>
        
        {/* TÍTULO & BRANDING */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary-container animate-ping"></span>
            <span className="font-label-md text-label-md text-primary-container uppercase tracking-wider font-semibold">
              TEMPORADA 2026
            </span>
          </div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-navy-deep uppercase tracking-wide">
            OUSADIA & ALEGRIA
          </h1>
          <p className="font-body-sm text-body-sm text-outline uppercase tracking-wider">
            Estádio Digital & Gestão de Pelada
          </p>
        </div>

        {/* FEEDBACK DE ERRO SE POPUP FOR BLOQUEADO */}
        {loginError && (
          <div className="w-full bg-error-container/20 border border-error-container text-on-error-container p-3 rounded-xl font-body-sm text-body-sm flex items-center gap-2 animate-slide-up">
            <span className="material-symbols-outlined text-error shrink-0 text-[18px]">info</span>
            <p className="leading-snug">{loginError}</p>
          </div>
        )}

        {/* BOTÕES DE ENTRADA */}
        <div className="w-full space-y-2.5">
          {/* BOTÃO PRINCIPAL: ENTRAR COMO ADMIN (DIOGO) */}
          <button 
            onClick={handleAdminAccess}
            className="w-full h-12 bg-gradient-to-r from-primary-container to-primary-bright text-on-primary rounded-xl font-headline-sm text-headline-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
            <span>ENTRAR COMO DIOGO (ADMIN)</span>
          </button>

          {/* BOTÃO SECUNDÁRIO: MODO CONVIDADO */}
          <button 
            onClick={handleGuestAccess}
            className="w-full h-12 bg-surface-container-lowest hover:bg-surface-container border border-surface-container-high/60 text-navy-deep rounded-xl font-headline-sm text-headline-sm shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">visibility</span>
            <span>EXPLORAR MODO CONVIDADO / ATLETA</span>
          </button>

          {/* DIVISOR */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1 h-px bg-surface-container-high"></div>
            <span className="font-label-caps text-label-caps text-outline uppercase tracking-wider">OU VIA CONTA GOOGLE</span>
            <div className="flex-1 h-px bg-surface-container-high"></div>
          </div>

          {/* BOTÃO GOOGLE */}
          <button 
            onClick={handleGoogleLogin} 
            disabled={isLoggingIn}
            className="w-full h-12 bg-navy-deep hover:bg-navy text-canvas-white rounded-xl font-headline-sm text-headline-sm shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {isLoggingIn ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12.24 10.285V13.4h6.887C18.2 15.632 15.645 18 12.24 18c-3.315 0-6-2.685-6-6s2.685-6 6-6c1.605 0 3.03.615 4.14 1.62l2.43-2.43C17.34 3.735 14.97 3 12.24 3 7.275 3 3.24 7.035 3.24 12s4.035 9 9 9c4.965 0 9-3.69 9-9 0-.66-.075-1.29-.21-1.715H12.24z"/>
                </svg>
                <span>LOGIN OFICIAL COM GOOGLE</span>
              </>
            )}
          </button>
        </div>

        {/* FOOTER */}
        <div className="text-center pt-2">
           <p className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
             CROATIA ELITE SERIES • PWA ARENA
           </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
