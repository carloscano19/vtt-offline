import React, { useState, useEffect } from 'react';
import { onlineRoomManager, RemoteUser } from '../../../modules/online/onlineRoomManager';
import { useGameStore } from '../../../stores/useGameStore';
import { Globe, Copy, Check, Users, X, AlertTriangle, ShieldCheck, DoorClosed } from 'lucide-react';

interface OnlineRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnlineRoomModal: React.FC<OnlineRoomModalProps> = ({ isOpen, onClose }) => {
  const [roomCode, setRoomCode] = useState<string | null>(onlineRoomManager.getRoomCode());
  const [connectedUsers, setConnectedUsers] = useState<RemoteUser[]>(onlineRoomManager.getConnectedUsers());
  const [copied, setCopied] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const unsubUsers = onlineRoomManager.onConnectedUsers((users) => {
      setConnectedUsers(users);
    });
    const unsubWarning = onlineRoomManager.onWarning((msg) => {
      setWarning(msg);
    });

    setRoomCode(onlineRoomManager.getRoomCode());

    return () => {
      unsubUsers();
      unsubWarning();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://vtt-offline.vercel.app';
  const shareableUrl = roomCode ? `${origin}/?play=${roomCode}` : '';

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setWarning(null);
    try {
      const code = await onlineRoomManager.openRoom();
      setRoomCode(code);
      // Emitir estado actual
      const currentGame = useGameStore.getState().game;
      onlineRoomManager.broadcastState(currentGame, true);
    } catch (err: any) {
      console.error('[OnlineRoomModal] Error al crear sala:', err);
      setWarning(err.message || 'Error al conectar con Supabase Realtime.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCloseRoom = async () => {
    await onlineRoomManager.closeRoom();
    setRoomCode(null);
  };

  const handleCopy = async () => {
    if (!shareableUrl) return;
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('Error al copiar al portapapeles:', err);
    }
  };

  const playerUsers = connectedUsers.filter((u) => u.role === 'player');

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-6 max-w-lg w-full shadow-2xl text-slate-200 space-y-5">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-white">Sala Online para Jugadores</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Advertencias */}
        {warning && (
          <div className="bg-amber-950/70 border border-amber-600/60 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{warning}</span>
          </div>
        )}

        {!roomCode ? (
          /* Estado: Sin sala activa */
          <div className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Crea una sala en directo para que tus jugadores puedan conectarse desde cualquier lugar con su propio ordenador.
              Verán la pantalla de jugadores en tiempo real con niebla, visión y luces, sin necesidad de iniciar sesión ni claves de base de datos.
            </p>

            <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Seguro y privado</span>
              </div>
              <p>
                El máster es la autoridad de la partida. Lo oculto (tokens invisibles, notas, puertas con llave) se filtra antes de transmitirse.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={isCreating}
                className="w-full py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-sm shadow-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
              >
                <Globe className="w-4 h-4" />
                <span>{isCreating ? 'Creando sala...' : 'Crear Sala Online'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Estado: Sala activa */
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Enlace de invitación para tus jugadores:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareableUrl}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-sky-300 font-mono select-all focus:outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Copiar enlace"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Código de sala: <span className="font-mono text-slate-300">{roomCode}</span>
              </p>
            </div>

            {/* Jugadores conectados */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>Jugadores conectados ({playerUsers.length})</span>
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>

              {playerUsers.length === 0 ? (
                <div className="bg-slate-950/50 border border-slate-800/80 rounded-lg p-3 text-xs text-slate-500 text-center italic">
                  Esperando a que los jugadores se unan con el enlace...
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {playerUsers.map((u) => (
                    <div
                      key={u.id}
                      className="bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between text-xs"
                    >
                      <span className="font-medium text-slate-200">{u.name}</span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                        En línea
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Botón cerrar sala */}
            <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
              <button
                type="button"
                onClick={handleCloseRoom}
                className="px-3.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700/70 text-rose-300 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <DoorClosed className="w-3.5 h-3.5" />
                <span>Cerrar sala</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
