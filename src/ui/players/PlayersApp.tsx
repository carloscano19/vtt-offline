import React, { useEffect } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useUIStore } from '../../stores/useUIStore';
import { PixiCanvas } from '../../pixi/PixiCanvas';
import { CanvasErrorBoundary } from '../common/CanvasErrorBoundary';

export const PlayersApp: React.FC = () => {
  const setGame = useGameStore((s) => s.setGame);
  const setPlayerCamera = useGameStore((s) => s.setPlayerCamera);

  // Stores UI (para regla proyectada)
  const setRulerMode = useUIStore((s) => s.setRulerMode);
  const setRulerDiagonalRule = useUIStore((s) => s.setRulerDiagonalRule);
  const setRulerVisibleToPlayers = useUIStore((s) => s.setRulerVisibleToPlayers);
  const startRulerMeasure = useUIStore((s) => s.startRulerMeasure);
  const updateRulerMeasure = useUIStore((s) => s.updateRulerMeasure);
  const endRulerMeasure = useUIStore((s) => s.endRulerMeasure);
  const clearRuler = useUIStore((s) => s.clearRuler);

  useEffect(() => {
    if (!window.electronAPI) return;

    // 1. Recibir estado completo ligero desde la ventana máster por IPC
    const cleanupState = window.electronAPI.onReceiveState((state) => {
      setGame(state);
    });

    // 2. Recibir sincronización de regla desde el máster
    const cleanupRuler = window.electronAPI.onReceiveRuler((ruler) => {
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
    const cleanupCamera = window.electronAPI.onReceiveCamera((camera) => {
      setPlayerCamera(camera);
    });

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
    </div>
  );
};
