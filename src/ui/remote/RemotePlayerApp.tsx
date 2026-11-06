import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { PixiCanvas } from '../../pixi/PixiCanvas';
import { CanvasErrorBoundary } from '../common/CanvasErrorBoundary';
import { onlineRoomManager } from '../../modules/online/onlineRoomManager';
import { audioManager } from '../../modules/audio/audioManager';
import { Maximize2, Minimize2, Volume2, VolumeX, Crosshair, User, AlertCircle, Wifi, WifiOff } from 'lucide-react';

interface RemotePlayerAppProps {
  roomCode: string;
}

export const RemotePlayerApp: React.FC<RemotePlayerAppProps> = ({ roomCode }) => {
  const setGame = useGameStore((s) => s.setGame);
  const setPlayerCamera = useGameStore((s) => s.setPlayerCamera);
  const playerCamera = useGameStore((s) => s.game.playerCamera);
  const entities = useGameStore((s) => s.game.entities);
  const music = useGameStore((s) => s.game.music);

  const [savedName, setSavedName] = useState<string>(() => {
    try {
      return localStorage.getItem('vtt_remote_player_name') || '';
    } catch {
      return '';
    }
  });
  const [nameInput, setNameInput] = useState(savedName);
  const [isJoined, setIsJoined] = useState(Boolean(savedName));

  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const hasCenteredInitiallyRef = useRef(false);

  // Guardar nombre y conectar
  const handleJoin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem('vtt_remote_player_name', trimmed);
    } catch {}
    setSavedName(trimmed);
    setIsJoined(true);
  };

  // Conectar a la sala online
  useEffect(() => {
    if (!isJoined || !savedName) return;

    onlineRoomManager.connectAsPlayer(roomCode, savedName).catch((err) => {
      console.error('[RemotePlayerApp] Error al conectar a la sala:', err);
      setWarningMessage('No se pudo conectar a la sala. Comprueba el código o la conexión.');
    });

    const cleanupStatus = onlineRoomManager.onConnectionStatus((status) => {
      setConnectionStatus(status);
    });

    const cleanupWarning = onlineRoomManager.onWarning((msg) => {
      setWarningMessage(msg);
      setTimeout(() => setWarningMessage(null), 5000);
    });

    const cleanupState = onlineRoomManager.onState((incomingState) => {
      setGame(incomingState);

      // Centrado inicial de cámara (en el token controlado o marco de la tele)
      if (!hasCenteredInitiallyRef.current) {
        hasCenteredInitiallyRef.current = true;
        const myToken = incomingState.entities?.find(
          (ent) => ent.type === 'token' && ent.controlledBy && ent.controlledBy.toLowerCase() === savedName.toLowerCase()
        );
        if (myToken) {
          setPlayerCamera({ x: myToken.x, y: myToken.y, zoom: playerCamera.zoom || 1 });
        } else if (incomingState.playerCamera) {
          setPlayerCamera(incomingState.playerCamera);
        }
      }
    });

    const cleanupPos = onlineRoomManager.onEntityPos(({ id, x, y }) => {
      useGameStore.getState().updateEntity(id, { x, y }, false);
    });

    return () => {
      cleanupStatus();
      cleanupWarning();
      cleanupState();
      cleanupPos();
      onlineRoomManager.closeRoom();
    };
  }, [isJoined, savedName, roomCode, setGame, setPlayerCamera]);

  // Sincronizar música
  useEffect(() => {
    if (soundEnabled && music) {
      audioManager.sync(music);
    }
  }, [soundEnabled, music]);

  // Centrar cámara en el token del jugador
  const centerOnMyToken = useCallback(() => {
    if (!savedName) return;
    const myToken = entities.find(
      (ent) => ent.type === 'token' && ent.controlledBy && ent.controlledBy.toLowerCase() === savedName.toLowerCase()
    );
    if (myToken) {
      setPlayerCamera({ x: myToken.x, y: myToken.y });
    } else {
      // Si aún no tiene token asignado, centrar en encuadre de la tele
      setPlayerCamera({ x: playerCamera.x, y: playerCamera.y });
    }
  }, [entities, savedName, playerCamera, setPlayerCamera]);

  const toggleSound = () => {
    if (!soundEnabled) {
      setSoundEnabled(true);
      audioManager.init();
      if (music) audioManager.sync(music);
    } else {
      setSoundEnabled(false);
      if (music) audioManager.sync({ ...music, isPlaying: false });
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {}
  };

  // Pantalla de bienvenida / introducción de nombre
  if (!isJoined) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center p-4 select-none">
        <form
          onSubmit={handleJoin}
          className="bg-slate-900 border border-slate-700/80 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-5 text-slate-200"
        >
          <div className="flex items-center gap-3 text-sky-400">
            <User className="w-6 h-6" />
            <h1 className="text-lg font-bold">Unirse a la partida</h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Te estás conectando a la sala en directo de tu máster. Introduce tu nombre para identificarte en la mesa.
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Tu nombre o personaje:</label>
            <input
              type="text"
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Ej. Zeyr, Aragorn, etc."
              maxLength={30}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="w-full py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 font-semibold text-sm text-white shadow-lg transition-all active:scale-98 cursor-pointer"
            >
              Entrar al tablero
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden relative select-none">
      <CanvasErrorBoundary fallbackTitle="Error en el tablero remoto">
        <PixiCanvas isMaster={false} />
      </CanvasErrorBoundary>

      {/* Barra superior de estado y controles */}
      <div className="absolute top-3 left-3 flex items-center gap-2 z-50 pointer-events-auto">
        {/* Indicador de conexión */}
        <div className="bg-slate-900/90 border border-slate-700/70 rounded-lg px-3 py-1.5 shadow-lg backdrop-blur-xs flex items-center gap-2 text-xs">
          {connectionStatus === 'connected' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300 font-medium">{savedName}</span>
            </>
          ) : connectionStatus === 'connecting' ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              <span className="text-amber-300">Conectando...</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-rose-300">Desconectado</span>
            </>
          )}
        </div>

        {/* Botón "Centrar en mi ficha" */}
        <button
          onClick={centerOnMyToken}
          className="bg-slate-900/90 hover:bg-slate-800 border border-slate-700/70 text-slate-200 hover:text-white px-3 py-1.5 rounded-lg shadow-lg backdrop-blur-xs text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
          title="Centrar la cámara en tu token o en el mapa"
        >
          <Crosshair className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden sm:inline">Centrar en mi ficha</span>
        </button>

        {/* Botón de Sonido / Autoplay */}
        <button
          onClick={toggleSound}
          className={`px-3 py-1.5 rounded-lg shadow-lg backdrop-blur-xs text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border ${
            soundEnabled
              ? 'bg-emerald-950/80 hover:bg-emerald-900 border-emerald-600/70 text-emerald-300'
              : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700/70 text-slate-300'
          }`}
          title={soundEnabled ? 'Silenciar música' : 'Activar sonido (música de la mesa)'}
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
          <span>{soundEnabled ? 'Sonido activo' : 'Activar sonido'}</span>
        </button>
      </div>

      {/* Botón Pantalla Completa (arriba a la derecha) */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 p-2 bg-slate-900/70 hover:bg-slate-900 text-slate-300 hover:text-white rounded-lg border border-slate-700/60 shadow-lg backdrop-blur-xs transition-opacity opacity-40 hover:opacity-100 z-50 flex items-center gap-1.5 text-xs cursor-pointer"
        title="Alternar Pantalla Completa (F11)"
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>

      {/* Avisos flotantes */}
      {warningMessage && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-rose-950/90 border border-rose-500/70 text-rose-200 px-4 py-2 rounded-lg shadow-2xl text-xs flex items-center gap-2 z-50 backdrop-blur-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{warningMessage}</span>
        </div>
      )}
    </div>
  );
};
