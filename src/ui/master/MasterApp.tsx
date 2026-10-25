import React, { useEffect, useRef, useState } from 'react';
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
import { visionManager } from '../../modules/vision/visionManager';
import { unionExplored } from '../../modules/vision/fogMemory';
import { TokenVisibility } from '../../modules/vision/visibilityPolygon';
import { ShieldAlert } from 'lucide-react';

export const MasterApp: React.FC = () => {
  useKeyboardShortcuts();

  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const ruler = useUIStore((s) => s.ruler);

  const [isGridModalOpen, setIsGridModalOpen] = useState(false);
  const [isRulerModalOpen, setIsRulerModalOpen] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [hasControl, setHasControl] = useState(true);

  // Detección de máster único por BroadcastChannel
  useEffect(() => {
    syncChannel.startMasterElection();
    const cleanupConflict = syncChannel.onConflict((conflict) => setHasConflict(conflict));
    const cleanupControl = syncChannel.onControl((ctrl) => setHasControl(ctrl));
    return () => {
      cleanupConflict();
      cleanupControl();
    };
  }, []);

  const hasControlRef = useRef(hasControl);
  hasControlRef.current = hasControl;

  // 1. Restaurar último autoguardado al arrancar si existe
  useEffect(() => {
    loadAutoSaveFromDb().then((auto) => {
      if (auto && auto.entities && auto.entities.length > 0) {
        setGame(auto);
      }
    });
  }, [setGame]);

  // 2. Autoguardado periódico cada 60 segundos (solo si esta pestaña tiene el control)
  useEffect(() => {
    if (!hasControl) return;
    const timer = setInterval(() => {
      if (hasControlRef.current) {
        saveAutoSaveToDb(useGameStore.getState().game);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [hasControl]);

  // 3. Autoguardado web en beforeunload y pagehide (solo si esta pestaña tiene el control)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasControlRef.current) {
        saveAutoSaveToDb(useGameStore.getState().game);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, []);

  // 4. Sincronización ligera por BroadcastChannel hacia la ventana de jugadores (sin blobs)
  useEffect(() => {
    if (!hasControl) return;
    syncChannel.sendState(game);
  }, [game, hasControl]);

  // 4b. Memoria de exploración (fuente única: el máster). Solo se actualiza cuando visionManager
  // recalcula (nueva referencia de visibilidades), no en cada render.
  const lastVisRef = useRef<TokenVisibility[] | null>(null);
  const exploredEmpty = (game.fog.explored?.length ?? 0) === 0;
  useEffect(() => {
    if (!hasControl) return;
    const vis = visionManager.getTokensVisibility(game.entities, game.grid.size || 70);
    if (vis.length === 0) return;
    if (vis === lastVisRef.current && !exploredEmpty) return;
    lastVisRef.current = vis;
    const store = useGameStore.getState();
    const next = unionExplored(store.game.fog.explored ?? [], vis.map((v) => v.polygon));
    store.setFogExplored(next);
  }, [game.entities, game.grid.size, exploredEmpty, hasControl]);

  useEffect(() => {
    syncChannel.sendRuler(ruler);
  }, [ruler]);

  // Recibir tamaño real de la pantalla de jugadores
  useEffect(() => {
    const cleanup = syncChannel.onViewport((vp) => {
      useGameStore.getState().setPlayerViewport(vp);
    });
    return cleanup;
  }, []);

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

      {/* Aviso a pantalla completa si hay otra pestaña máster activa */}
      {hasConflict && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center z-50 p-6 select-none animate-fade-in">
          <div className="bg-slate-900 border border-amber-500/50 rounded-xl p-8 max-w-lg w-full shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">
                Ya hay una pantalla de máster abierta
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Se ha detectado otra ventana de máster activa en este navegador. Para evitar que la pantalla de los jugadores salte entre pestañas, solo una pestaña de máster puede tener el control a la vez.
              </p>
              <p className="text-xs text-slate-400">
                Cierra esta pestaña o pulsa <strong className="text-amber-300">"Usar esta"</strong> para tomar el control.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => window.close()}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                Cerrar pestaña
              </button>
              <button
                onClick={async () => {
                  try {
                    const latestAuto = await loadAutoSaveFromDb();
                    if (latestAuto && latestAuto.grid) {
                      setGame(latestAuto);
                      syncChannel.takeControl();
                      setHasConflict(false);
                      setHasControl(true);
                      syncChannel.sendState(latestAuto);
                      syncChannel.sendRuler(ruler);
                      return;
                    }
                  } catch (err) {
                    console.warn('Error al recargar último autoguardado al tomar el control:', err);
                  }

                  syncChannel.takeControl();
                  setHasConflict(false);
                  setHasControl(true);
                  syncChannel.sendState(game);
                  syncChannel.sendRuler(ruler);
                }}
                className="px-5 py-2.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-600/30 transition-all"
              >
                Usar esta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
