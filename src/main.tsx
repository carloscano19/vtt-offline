import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { useGameStore } from './stores/useGameStore';
import { useUIStore } from './stores/useUIStore';
import './ui/styles/theme.css';

// Solo en desarrollo: acceso a los stores para depuración y verificación automatizada
if (import.meta.env.DEV) {
  (window as any).__vtt = { useGameStore, useUIStore };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
