import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/common/ErrorBoundary';
import { useGameStore } from './stores/useGameStore';
import { useUIStore } from './stores/useUIStore';
import { authManager } from './modules/auth/authManager';
import { db } from './db/dexie';
import './ui/styles/theme.css';

// Solo en desarrollo: acceso a los stores para depuración y verificación automatizada
if (import.meta.env.DEV) {
  (window as any).__vtt = { useGameStore, useUIStore, authManager, db };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
