import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

export const PwaReloadPrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        // Comprobar actualizaciones periódicamente cada 60 segundos
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
      let refreshing = false;
      const onControllerChange = () => {
        if (!refreshing) {
          setNeedRefresh(true);
        }
      };
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      };
    }
  }, [setNeedRefresh]);

  if (!needRefresh) {
    return null;
  }

  const handleUpdate = async () => {
    try {
      await updateServiceWorker(true);
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] select-none">
      <div className="bg-slate-900/95 border-2 border-amber-500 text-white px-5 py-3 rounded-xl shadow-2xl shadow-amber-500/20 backdrop-blur-md flex items-center gap-4 animate-fade-in">
        <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
          <RefreshCw className="w-4 h-4 animate-spin" />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold text-amber-200">Hay una versión nueva</p>
          <p className="text-xs text-slate-300">Actualiza para aplicar las últimas mejoras y correcciones.</p>
        </div>
        <button
          onClick={handleUpdate}
          className="ml-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-md hover:shadow-amber-500/30 shrink-0 cursor-pointer"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
};
