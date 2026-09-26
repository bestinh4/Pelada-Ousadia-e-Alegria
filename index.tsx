
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Registro do Service Worker para Notificações e limpeza de caches antigos
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      registration.update().catch(() => {});
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (err) {
      console.error('Falha ao registrar SW:', err);
    }
  });
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.error('Erro capturado pelo RootErrorBoundary:', error);
    try {
      localStorage.removeItem('oa_real_players_cache');
      localStorage.removeItem('oa_real_match_cache');
      localStorage.removeItem('oa_real_session_cache');
      localStorage.removeItem('oa_real_finance_cache');
      localStorage.removeItem('oa_real_expenses_cache');
      localStorage.removeItem('oa_current_page');
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary-container/10 text-primary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">refresh</span>
          </div>
          <h2 className="font-headline-sm text-lg font-bold text-navy-deep">
            Sincronizando dados atualizados...
          </h2>
          <p className="text-xs text-outline max-w-xs">
            O cache local foi atualizado. Toque abaixo para recarregar o aplicativo.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-3 bg-primary-container text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition-all"
          >
            RECARREGAR APLICATIVO
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);

