import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useUIStore } from '../../stores/useUIStore';
import { PixiCanvas } from '../../pixi/PixiCanvas';
import { CanvasErrorBoundary } from '../common/CanvasErrorBoundary';
import { syncChannel } from '../../modules/sync/syncChannel';
import { invalidateCachedTexture } from '../../pixi/utils/textureCache';
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
  const [showConnected, setShowConnected] = useState(false);
  const hasConnectedRef = React.useRef(false);

  // Ocultar hint tras 6 segundos
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(t);
  }, []);

  // Escuchar cambios de fullscreen y reportar tamaño de ventana
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      syncChannel.sendViewport(window.innerWidth, window.innerHeight);
    };

    const handleResize = () => {
      syncChannel.sendViewport(window.innerWidth, window.innerHeight);
    };

    // Reportar inmediatamente al montar
    syncChannel.sendViewport(window.innerWidth, window.innerHeight);

    document.addEventListener('fullscreenchange', handleFsChange);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      window.removeEventListener('resize', handleResize);
    };
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
      // Si la versión del estado difiere de la local, recargar para actualizar
      if (
        state.appVersion &&
        typeof __APP_VERSION__ !== 'undefined' &&
        state.appVersion !== __APP_VERSION__
      ) {
        console.log(`[PlayersApp] Versión recibida (${state.appVersion}) distinta de local (${__APP_VERSION__}). Recargando...`);
        window.location.reload();
        return;
      }
      setGame(state);
      if (!hasConnectedRef.current) {
        hasConnectedRef.current = true;
        setShowConnected(true);
        setTimeout(() => setShowConnected(false), 3000);
      }
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

    // 5. Invalidador de textura al descargarse un asset en segundo plano
    const cleanupAsset = syncChannel.onAssetDownloaded((assetId) => {
      invalidateCachedTexture(assetId);
    });

    // 6. Recibir orden de recarga por actualización de app enviada desde el máster
    const cleanupReload = syncChannel.onAppReload(() => {
      console.log('[PlayersApp] Orden de recarga recibida desde el máster.');
      window.location.reload();
    });

    return () => {
      cleanupState();
      cleanupRuler();
      cleanupCamera();
      cleanupAsset();
      cleanupReload();
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

      {/* Indicador discreto al conectarse al máster (3 segundos) */}
      {showConnected && (
        <div className="absolute top-3 left-3 bg-slate-900/85 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg shadow-lg text-xs flex items-center gap-2 pointer-events-none backdrop-blur-xs z-50 animate-fade-in transition-opacity">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Conectado al máster</span>
        </div>
      )}

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
