import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useUIStore } from '../../stores/useUIStore';
import { TopToolbar } from './components/TopToolbar';
import { Sidebar } from './components/Sidebar';
import { PixiCanvas } from '../../pixi/PixiCanvas';
import { GridModal } from './components/GridModal';
import { RulerModal } from './components/RulerModal';
import { SaveLoadModal } from './components/SaveLoadModal';
import { DisplaysModal } from './components/DisplaysModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { saveAutoSaveToDb, loadAutoSaveFromDb } from '../../modules/persistence/saveManager';

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

  // 3. Autoguardado antes de cerrar la app (petición desde Electron main)
  useEffect(() => {
    if (window.electronAPI) {
      const cleanup = window.electronAPI.onRequestSaveBeforeQuit(async () => {
        await saveAutoSaveToDb(game);
      });
      return cleanup;
    }
  }, [game]);

  // 4. Sincronización ligera por IPC hacia la ventana de jugadores (sin blobs)
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.sendStateToPlayers(game);
    }
  }, [game]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.sendRulerToPlayers(ruler);
    }
  }, [ruler]);

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
          <PixiCanvas isMaster={true} />
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
