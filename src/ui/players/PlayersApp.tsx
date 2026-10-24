import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useUIStore } from '../../stores/useUIStore';
import { PixiCanvas } from '../../pixi/PixiCanvas';
import { CanvasErrorBoundary } from '../common/CanvasErrorBoundary';
import { syncChannel } from '../../modules/sync/syncChannel';
import { Maximize2, Minimize2, Tv } from 'lucide-react';

export const PlayersApp: React.FC = () => {
  const setGame = useGameStore((s) => s.setGame);
  const setPlayerCamera = useGameStore((s) => s.setPlayerCamera);

  // Stores UI (para regla proyectada)
  const setRulerMode = useUIStore((s) => s.setRulerMode);
  const setRulerDiagonalRule = useUIStore((s) => s.setRulerDiagonalRule);
  const setRulerVisibleToPlayers = useUIStore((s) => s.setRulerVisibleToPlayers);
  const startRulerMeasure = useUIStore((s) => s.startRulerMeasure);
  const updateRulerMeasure = useUIStore((s) => s.updateRulerMeasure);
  const clearRuler = useUIStore((s) => s.clearRuler);

  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [showHint, setShowHint] = useState(true);

  // Ocultar hint tras 6 segundos
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(t);
  }, []);

  // Escuchar cambios de fullscreen
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Error al alternar pantalla completa:', err);
    }
  };

  useEffect(() => {
    // 1. Recibir estado completo ligero desde la ventana máster por BroadcastChannel
    const cleanupState = syncChannel.onState((state) => {
      setGame(state);
    });

    // 2. Recibir sincronización de regla desde el máster
    const cleanupRuler = syncChannel.onRuler((ruler) => {
      setRulerMode(ruler.mode);
      setRulerDiagonalRule(ruler.diagonalRule);
      setRulerVisibleToPlayers(ruler.visibleToPlayers);

      if (ruler.startPos && ruler.currentPos && ruler.visibleToPlayers) {
        startRulerMeasure(ruler.startPos);
        updateRulerMeasure(ruler.currentPos);
      } else {
        clearRuler();
      }
    });

    // 3. Recibir sincronización directa de cámara
    const cleanupCamera = syncChannel.onCamera((camera) => {
      setPlayerCamera(camera);
    });

    // 4. Solicitar estado actual de la partida al máster al abrir la ventana
    syncChannel.requestCurrentState();

    return () => {
      cleanupState();
      cleanupRuler();
      cleanupCamera();
    };
  }, [setGame, setPlayerCamera, setRulerMode, setRulerDiagonalRule, setRulerVisibleToPlayers, startRulerMeasure, updateRulerMeasure, clearRuler]);

  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden relative select-none">
      <CanvasErrorBoundary fallbackTitle="Error en el tablero de Jugadores">
        <PixiCanvas isMaster={false} />
      </CanvasErrorBoundary>

      {/* Botón flotante discreto para pantalla completa */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 p-2 bg-slate-900/70 hover:bg-slate-900 text-slate-300 hover:text-white rounded-lg border border-slate-700/60 shadow-lg backdrop-blur-xs transition-opacity opacity-40 hover:opacity-100 z-50 flex items-center gap-1.5 text-xs"
        title="Alternar Pantalla Completa (F11)"
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        <span className="hidden sm:inline">{isFullscreen ? 'Salir' : 'Pantalla Completa'}</span>
      </button>

      {/* Indicación discreta inicial */}
      {showHint && !isFullscreen && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-sky-500/50 text-slate-200 px-4 py-2 rounded-lg shadow-xl text-xs flex items-center gap-2 pointer-events-none backdrop-blur-xs z-50 animate-fade-in">
          <Tv className="w-4 h-4 text-sky-400" />
          <span>Arrastra esta ventana a la TV o monitor secundario y pulsa <strong className="text-sky-300">F11</strong> o el botón de pantalla completa.</span>
        </div>
      )}
    </div>
  );
};
