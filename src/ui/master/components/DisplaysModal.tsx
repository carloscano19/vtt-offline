import React, { useEffect, useState } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { DisplayInfo } from '../../../types/ipc';
import { X, Monitor, Maximize2, Tv, RefreshCw } from 'lucide-react';

export const DisplaysModal: React.FC = () => {
  const showDisplaysModal = useUIStore((s) => s.showDisplaysModal);
  const setShowDisplaysModal = useUIStore((s) => s.setShowDisplaysModal);

  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDisplays = async () => {
    if (!window.electronAPI) {
      setDisplays([
        {
          id: 1,
          label: 'Pantalla principal (Modo web / desarrollo)',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          isPrimary: true
        }
      ]);
      return;
    }

    setLoading(true);
    try {
      const list = await window.electronAPI.getDisplays();
      setDisplays(list);
    } catch (err) {
      console.error('Error al obtener pantallas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showDisplaysModal) {
      loadDisplays();

      // Escuchar cambios de pantallas conectados en caliente
      if (window.electronAPI) {
        const cleanup = window.electronAPI.onDisplaysChanged((updatedList) => {
          setDisplays(updatedList);
        });
        return cleanup;
      }
    }
  }, [showDisplaysModal]);

  if (!showDisplaysModal) return null;

  const handleMove = async (displayId: number, fullscreen: boolean) => {
    if (window.electronAPI) {
      await window.electronAPI.movePlayersWindow(displayId, fullscreen);
      setShowDisplaysModal(false);
    } else {
      alert('Esta función requiere la aplicación de escritorio de Electron.');
    }
  };

  const handleToggleFullscreen = () => {
    if (window.electronAPI) {
      window.electronAPI.togglePlayersFullscreen();
    } else {
      alert('Esta función requiere la aplicación de escritorio de Electron.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-[460px] p-5 text-slate-200 space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-sm text-white">Gestión de Pantalla de Jugadores</h3>
          </div>
          <button onClick={() => setShowDisplaysModal(false)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-400">
          La ventana de jugadores se proyecta en una segunda pantalla conectada (TV o monitor por HDMI). Puedes moverla a cualquiera de las pantallas detectadas:
        </p>

        {/* Lista de pantallas detectadas */}
        <div className="space-y-2">
          {displays.map((disp, idx) => (
            <div
              key={disp.id}
              className="p-3 bg-slate-800/80 border border-slate-700 rounded-lg flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Tv className="w-4 h-4 text-sky-400" />
                  <span className="font-semibold text-xs text-white truncate">{disp.label}</span>
                  {disp.isPrimary && (
                    <span className="px-1.5 py-0.2 text-[9px] bg-slate-700 text-slate-300 rounded font-semibold uppercase">
                      Principal (Máster)
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Resolución: {disp.bounds.width} x {disp.bounds.height}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleMove(disp.id, true)}
                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors"
                  title="Mover a esta pantalla en pantalla completa"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Pantalla Completa</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Botón rápido para alternar pantalla completa */}
        <div className="pt-2 border-t border-slate-700/80 flex items-center justify-between text-xs">
          <span className="text-slate-400">Atajo en la ventana de jugadores: <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-sky-400 font-mono">F11</kbd></span>
          <button
            onClick={handleToggleFullscreen}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-200 hover:text-white"
          >
            Alternar Pantalla Completa
          </button>
        </div>
      </div>
    </div>
  );
};
