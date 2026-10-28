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
import { AuthModal } from './components/AuthModal';
import { LockScreen } from './components/LockScreen';
import { CreditsModal } from './components/CreditsModal';
import { FpsCounter } from './components/FpsCounter';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { saveAutoSaveToDb, loadAutoSaveFromDb } from '../../modules/persistence/saveManager';
import { syncChannel } from '../../modules/sync/syncChannel';
import { visionManager } from '../../modules/vision/visionManager';
import { unionExplored } from '../../modules/vision/fogMemory';
import { TokenVisibility } from '../../modules/vision/visibilityPolygon';
import { audioManager } from '../../modules/audio/audioManager';
import { cloudGameSync } from '../../modules/persistence/cloudGameSync';
import { authManager } from '../../modules/auth/authManager';
import { ShieldAlert } from 'lucide-react';

export const MasterApp: React.FC = () => {
  useKeyboardShortcuts();

  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const ruler = useUIStore((s) => s.ruler);
  const showAuthModal = useUIStore((s) => s.showAuthModal);
  const setShowAuthModal = useUIStore((s) => s.setShowAuthModal);
  const showCreditsModal = useUIStore((s) => s.showCreditsModal);
  const setShowCreditsModal = useUIStore((s) => s.setShowCreditsModal);

  const [isGridModalOpen, setIsGridModalOpen] = useState(false);
  const [isRulerModalOpen, setIsRulerModalOpen] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [hasControl, setHasControl] = useState(true);
  const [showFps, setShowFps] = useState(false);

  // Estado de autenticación para pantalla de clave al abrir
  const [isAuthenticated, setIsAuthenticated] = useState(authManager.isAuthenticated());
  const [isAuthReady, setIsAuthReady] = useState(authManager.isReady());

  useEffect(() => {
    return authManager.onAuthStateChange((user) => {
      setIsAuthenticated(!!user);
      setIsAuthReady(true);
    });
  }, []);

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

  // Alternar contador de FPS con tecla 'F'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        setShowFps((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const hasControlRef = useRef(hasControl);
  hasControlRef.current = hasControl;

  // 1. Restaurar último autoguardado al arrancar si existe y sincronizar con la nube
  useEffect(() => {
    if (!isAuthenticated) return;
    loadAutoSaveFromDb().then(async (auto) => {
      if (auto && auto.entities && auto.entities.length > 0) {
        setGame(auto);
      }
      await cloudGameSync.syncOnStartupOrLogin();
    });
  }, [isAuthenticated, setGame]);

  // 2. Autoguardado periódico cada 60 segundos y autoguardado a la nube con debounce tras cada cambio
  useEffect(() => {
    if (!hasControl || !isAuthenticated) return;
    cloudGameSync.scheduleAutoSave(game);

    const timer = setInterval(() => {
      if (hasControlRef.current) {
        const curr = useGameStore.getState().game;
        saveAutoSaveToDb(curr);
        cloudGameSync.saveGameToCloud(curr);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [game, hasControl, isAuthenticated]);

  // 3. Autoguardado web en beforeunload y pagehide (solo si esta pestaña tiene el control)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasControlRef.current && authManager.isAuthenticated()) {
        const curr = useGameStore.getState().game;
        saveAutoSaveToDb(curr);
        cloudGameSync.saveImmediate(curr);
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
    if (!hasControl || !isAuthenticated) return;
    syncChannel.sendState(game);
  }, [game, hasControl, isAuthenticated]);

  // 4b. Memoria de exploración (fuente única: el máster). Solo se actualiza cuando visionManager
  // recalcula (nueva referencia de visibilidades), no en cada render.
  const lastVisRef = useRef<TokenVisibility[] | null>(null);
  const exploredEmpty = (game.fog.explored?.length ?? 0) === 0;
  useEffect(() => {
    if (!hasControl || !isAuthenticated) return;
    const vis = visionManager.getTokensVisibility(game.entities, game.grid.size || 70);
    if (vis.length === 0) return;
    if (vis === lastVisRef.current && !exploredEmpty) return;
    lastVisRef.current = vis;
    const store = useGameStore.getState();
    const next = unionExplored(store.game.fog.explored ?? [], vis.map((v) => v.polygon));
    store.setFogExplored(next);
  }, [game.entities, game.grid.size, exploredEmpty, hasControl, isAuthenticated]);

  // 4c. Reproducción de música exclusivamente en la ventana máster (HDMI / salida del sistema)
  useEffect(() => {
    if (!isAuthenticated) return;
    audioManager.sync(game.music);
  }, [game.music, isAuthenticated]);

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

  // Recibir cambios de cámara realizados directamente desde la ventana de jugadores (TV)
  useEffect(() => {
    const cleanup = syncChannel.onPlayerCameraChanged((cam) => {
      const store = useGameStore.getState();
      if (store.game.followMasterCamera) {
        store.setFollowMasterCamera(false);
      }
      store.setPlayerCamera(cam);
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

  if (!isAuthReady) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center select-none">
        <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LockScreen onUnlock={() => setIsAuthenticated(true)} />;
  }

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
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <CreditsModal isOpen={showCreditsModal} onClose={() => setShowCreditsModal(false)} />

      {/* Indicador discreto de versión en esquina inferior izquierda (abre créditos al pulsar) */}
      <button
        type="button"
        onClick={() => setShowCreditsModal(true)}
        className="fixed bottom-2 left-2 z-20 pointer-events-auto text-[10px] text-slate-500 hover:text-slate-300 font-mono select-none px-1.5 py-0.5 rounded bg-slate-950/70 backdrop-blur-xs border border-slate-800/40 hover:border-slate-700 transition-colors cursor-pointer"
        title={`Versión: ${__APP_VERSION__} (Compilación: ${__BUILD_TIME__}) · Clic para ver créditos y licencias`}
      >
        v{__APP_VERSION__} · Créditos
      </button>

      {/* Contador de FPS activado con tecla F */}
      {showFps && <FpsCounter />}

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
