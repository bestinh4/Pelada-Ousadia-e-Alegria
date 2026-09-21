
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Registro do Service Worker para Notificações e PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('✅ SW registrado com sucesso:', registration.scope);
      
      // Verifica se há um SW esperando para ser ativado
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('🔄 Nova versão do SW disponível, recarregue a página.');
            }
          });
        }
      });
    } catch (err) {
      console.error('❌ Falha ao registrar SW:', err);
    }
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
