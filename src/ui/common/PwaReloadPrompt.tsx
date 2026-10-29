import React, { useEffect, useState, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { useGameStore } from '../../stores/useGameStore';
import { saveAutoSaveToDb } from '../../modules/persistence/saveManager';
import { cloudGameSync } from '../../modules/persistence/cloudGameSync';
import { syncChannel } from '../../modules/sync/syncChannel';

const pageLoadTime = Date.now();
const AUTO_UPDATE_WINDOW_MS = 15000;

export const PwaReloadPrompt: React.FC = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const updatingRef = useRef(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        // Comprobar inmediatamente al registrarse
        r.update();
        // Comprobar periódicamente cada 60 segundos
        setInterval(() => {
          r.update();
        }, 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn('[PWA] Error en registro de Service Worker:', error);
    }
  });

  // Detectar cambio de controlador por si el nuevo Service Worker ya reclamó los clientes
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const onControllerChange = () => {
        setNeedRefresh(true);
      };
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      };
    }
  }, [setNeedRefresh]);

  const performUpdate = async (isAuto: boolean) => {
    if (updatingRef.current) return;
    updatingRef.current = true;
    setIsUpdating(true);
    if (isAuto) setIsAutoUpdating(true);

    try {
      // 1. Asegurar que el guardado local y la sincronización con la nube han terminado
      const state = useGameStore.getState().game;
      if (state) {
        await saveAutoSaveToDb(state);
        await cloudGameSync.saveImmediate(state);
      }
    } catch (err) {
      console.warn('[PWA] Error al guardar datos antes de actualizar:', err);
    }

    try {
      // 2. Notificar a la tele si está abierta por syncChannel para que también se recargue
      syncChannel.sendAppReload(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined);
    } catch (err) {
      console.warn('[PWA] Error al notificar recarga por syncChannel:', err);
    }

    try {
      // 3. Activar nuevo service worker y recargar
      await updateServiceWorker(true);
    } catch {
      window.location.reload();
    }
  };

  // En los primeros 15 segundos tras abrir la app: actualización automática silenciosa sin popup
  useEffect(() => {
    if (!needRefresh || updatingRef.current) return;

    const elapsed = Date.now() - pageLoadTime;
    if (elapsed < AUTO_UPDATE_WINDOW_MS) {
      console.log(`[PWA] Versión nueva detectada en los primeros ${Math.round(elapsed / 1000)}s: actualizando automáticamente...`);
      performUpdate(true);
    }
  }, [needRefresh]);

  if (!needRefresh) {
    return null;
  }

  // Si aún está dentro de los 15s iniciales o se está aplicando la actualización silenciosa, no mostrar popup
  const elapsed = Date.now() - pageLoadTime;
  if (isAutoUpdating || elapsed < AUTO_UPDATE_WINDOW_MS) {
    return null;
  }

  // Pasados los 15 segundos: aviso discreto abajo a la izquierda, junto al botón de versión/créditos
  return (
    <div className="fixed bottom-2 left-28 sm:left-32 z-30 pointer-events-auto select-none flex items-center gap-1.5 animate-fade-in">
      <div className="bg-slate-900/90 border border-amber-500/60 text-white px-2 py-0.5 rounded text-[11px] backdrop-blur-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/10">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
        <span className="text-amber-200 font-medium">Nueva versión</span>
        <button
          onClick={() => performUpdate(false)}
          disabled={isUpdating}
          className="ml-1 px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shrink-0 disabled:opacity-50"
          title="Actualizar a la última versión del VTT"
        >
          {isUpdating ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : null}
          <span>Actualizar</span>
        </button>
      </div>
    </div>
  );
};
