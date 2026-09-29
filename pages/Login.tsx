
import React, { useState } from 'react';
import { loginWithGoogle } from '../services/firebase.ts';
import { MAIN_LOGO_URL } from '../constants.tsx';

interface LoginProps {
  onDirectLogin?: (user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onDirectLogin }) => {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const logoUrl = MAIN_LOGO_URL;

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try { 
      await loginWithGoogle(); 
    } catch (err: any) { 
      console.warn("Falha no login com Google:", err);
      setLoginError("Não foi possível concluir o login com o Google neste navegador. Tente novamente ou abra no navegador principal.");
    } finally { 
      setIsLoggingIn(false); 
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Stadium Aura Background */}
      <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-primary-container/10 blur-3xl pointer-events-none animate-pulse-slow"></div>
      <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-secondary/10 blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm space-y-6 flex flex-col items-center animate-fade-in relative z-10">
        
        {/* ESCUDO DO CLUBE REFORMULADO */}
        <div className="relative group">
           <div className="absolute inset-0 bg-gradient-to-tr from-primary-container/25 via-amber-400/20 to-navy-deep/25 blur-2xl rounded-full scale-125"></div>
           <div className="w-36 h-36 sm:w-40 sm:h-40 bg-white rounded-3xl p-2 border-2 border-amber-400/50 shadow-[0_16px_40px_rgba(0,58,117,0.16)] flex items-center justify-center relative z-10 overflow-hidden">
             <img src={logoUrl} alt="Ousadia & Alegria" className="w-full h-full object-contain rounded-2xl" referrerPolicy="no-referrer" />
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
            Arena Oficial • Granja Cantinho do Céu
          </p>
        </div>

        {/* FEEDBACK DE ERRO SE POPUP FOR BLOQUEADO */}
        {loginError && (
          <div className="w-full bg-error-container/20 border border-error-container text-on-error-container p-3 rounded-xl font-body-sm text-body-sm flex items-center gap-2 animate-slide-up">
            <span className="material-symbols-outlined text-error shrink-0 text-[18px]">info</span>
            <p className="leading-snug">{loginError}</p>
          </div>
        )}

        {/* BOTÃO OFICIAL DE LOGIN COM GOOGLE */}
        <div className="w-full space-y-3">
          <button 
            onClick={handleGoogleLogin} 
            disabled={isLoggingIn}
            className="w-full h-12 bg-gradient-to-r from-primary-container via-primary-bright to-navy-deep text-on-primary rounded-xl font-headline-sm text-sm font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-2.5"
          >
            {isLoggingIn ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M12.24 10.285V13.4h6.887C18.2 15.632 15.645 18 12.24 18c-3.315 0-6-2.685-6-6s2.685-6 6-6c1.605 0 3.03.615 4.14 1.62l2.43-2.43C17.34 3.735 14.97 3 12.24 3 7.275 3 3.24 7.035 3.24 12s4.035 9 9 9c4.965 0 9-3.69 9-9 0-.66-.075-1.29-.21-1.715H12.24z"/>
                </svg>
                <span>ENTRAR COM CONTA GOOGLE</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-center text-outline leading-relaxed px-2">
            Use seu e-mail Google para acessar sua conta de atleta ou da Diretoria automaticamente.
          </p>
        </div>

        {/* FOOTER */}
        <div className="text-center pt-2">
           <p className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
             OUSADIA & ALEGRIA F.C. • APP OFICIAL
           </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
