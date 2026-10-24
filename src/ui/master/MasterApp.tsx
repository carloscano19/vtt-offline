import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useUIStore } from '../../stores/useUIStore';
import { TopToolbar } from './components/TopToolbar';
import { Sidebar } from './components/Sidebar';
import { PixiCanvas } from '../../pixi/PixiCanvas';
import { CanvasErrorBoundary } from '../common/CanvasErrorBoundary';
import { GridModal } from './components/GridModal';
import { RulerModal } from './components/RulerModal';
import { SaveLoadModal } from './components/SaveLoadModal';
import { DisplaysModal } from './components/DisplaysModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { saveAutoSaveToDb, loadAutoSaveFromDb } from '../../modules/persistence/saveManager';
import { syncChannel } from '../../modules/sync/syncChannel';

export const MasterApp: React.FC = () => {
  useKeyboardShortcuts();

  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const ruler = useUIStore((s) => s.ruler);

  const [isGridModalOpen, setIsGridModalOpen] = useState(false);
  const [isRulerModalOpen, setIsRulerModalOpen] = useState(false);

  // 1. Restaurar último autoguardado al arrancar si existe
  useEffect(() => {
    loadAutoSaveFromDb().then((auto) => {
      if (auto && auto.entities && auto.entities.length > 0) {
        setGame(auto);
      }
    });
  }, [setGame]);

  // 2. Autoguardado periódico cada 60 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      saveAutoSaveToDb(game);
    }, 60000);
    return () => clearInterval(timer);
  }, [game]);

  // 3. Autoguardado web en beforeunload y pagehide
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveAutoSaveToDb(game);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [game]);

  // 4. Sincronización ligera por BroadcastChannel hacia la ventana de jugadores (sin blobs)
  useEffect(() => {
    syncChannel.sendState(game);
  }, [game]);

  useEffect(() => {
    syncChannel.sendRuler(ruler);
  }, [ruler]);

  // Responder a peticiones de sincronización de la ventana de jugadores cuando acaba de abrirse
  useEffect(() => {
    const cleanup = syncChannel.onRequestState(() => {
      syncChannel.sendState(game);
      syncChannel.sendRuler(ruler);
    });
    return cleanup;
  }, [game, ruler]);

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* Barra de herramientas superior */}
      <TopToolbar
        onOpenGridModal={() => setIsGridModalOpen(true)}
        onOpenRulerModal={() => setIsRulerModalOpen(true)}
      />

      {/* Área central: Tablero PixiJS y panel lateral derecho */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 h-full relative">
          <CanvasErrorBoundary fallbackTitle="Error en el tablero del Máster">
            <PixiCanvas isMaster={true} />
          </CanvasErrorBoundary>
        </main>
        <Sidebar />
      </div>

      {/* Modales */}
      <GridModal isOpen={isGridModalOpen} onClose={() => setIsGridModalOpen(false)} />
      <RulerModal isOpen={isRulerModalOpen} onClose={() => setIsRulerModalOpen(false)} />
      <SaveLoadModal />
      <DisplaysModal />
    </div>
  );
};
