
import React, { useState } from 'react';
import { loginWithGoogle } from '../services/firebase.ts';

const Login: React.FC = () => {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const logoUrl = "https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png";

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try { await loginWithGoogle(); }
    catch (err: any) { alert("Conexão falhou."); }
    finally { setIsLoggingIn(false); }
  };

  return (
    <div className="min-h-screen bg-neo-dots flex flex-col items-center justify-center p-8 relative overflow-hidden">
      <div className="w-full max-w-sm space-y-16 flex flex-col items-center animate-fade-in relative z-10">
        <div className="relative group">
           <div className="absolute inset-0 bg-navy/5 blur-[80px] rounded-full scale-150 animate-pulse"></div>
           <img src={logoUrl} alt="Ousadia e Alegria" className="w-64 h-64 object-contain relative z-10 drop-shadow-2xl animate-float" />
        </div>
        
        <div className="text-center space-y-6">
          <h1 className="text-6xl font-condensed italic font-black tracking-tighter text-navy uppercase leading-none">OUSADIA & ALEGRIA</h1>
          <div className="flex items-center justify-center gap-4">
             <div className="w-8 h-1 bg-primary rounded-full"></div>
             <p className="text-[12px] font-black uppercase text-navy/40 tracking-[0.5em]">ESTÁDIO DIGITAL</p>
             <div className="w-8 h-1 bg-primary rounded-full"></div>
          </div>
        </div>

        <div className="w-full space-y-8">
          <button 
            onClick={handleGoogleLogin} 
            disabled={isLoggingIn}
            className="w-full h-20 bg-navy text-white rounded-[2rem] font-black uppercase text-[12px] tracking-[0.4em] shadow-elite active:scale-95 transition-all flex items-center justify-center gap-4"
          >
            {isLoggingIn ? <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin"></div> : 'ENTRAR NA PELADA'}
          </button>
          
          <div className="text-center">
             <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">CROATIA ELITE SERIES v4.0</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
