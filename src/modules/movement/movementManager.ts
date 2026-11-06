import { onlineRoomManager } from '../online/onlineRoomManager';
import { useGameStore } from '../../stores/useGameStore';
import { useUIStore } from '../../stores/useUIStore';
import { syncChannel } from '../sync/syncChannel';
import { validateStep, validateUndo } from './movementValidator';
import { movementSound } from './movementSound';

class MovementManager {
  private initialized = false;
  private errorListeners: ((reason: string) => void)[] = [];

  constructor() {
    this.init();
  }

  public init() {
    if (this.initialized) return;
    this.initialized = true;

    onlineRoomManager.onMessage((msg) => {
      // 1. En el Máster: Autoridad absoluta para validar y aplicar movimientos
      if (onlineRoomManager.isMasterUser()) {
        if (msg.type === 'MOVE_STEP_REQUEST') {
          const { tokenId, dx, dy, playerName, requestId } = msg.payload || {};
          const game = useGameStore.getState().game;
          const result = validateStep(game, tokenId, dx, dy, playerName);

          if (result.success && result.newPos && result.remaining !== undefined && result.path) {
            useGameStore.getState().updateEntity(tokenId, {
              x: result.newPos.x,
              y: result.newPos.y,
              movementState: {
                remaining: result.remaining,
                path: result.path
              }
            });

            onlineRoomManager.sendBroadcastMessage({
              type: 'MOVE_STEP_APPLIED',
              payload: {
                requestId,
                tokenId,
                x: result.newPos.x,
                y: result.newPos.y,
                remaining: result.remaining,
                path: result.path
              }
            });
          } else {
            onlineRoomManager.sendBroadcastMessage({
              type: 'MOVE_STEP_REJECTED',
              payload: {
                requestId,
                tokenId,
                reason: result.reason || 'Movimiento no permitido'
              }
            });
          }
        } else if (msg.type === 'MOVE_UNDO_REQUEST') {
          const { tokenId, playerName, requestId } = msg.payload || {};
          const game = useGameStore.getState().game;
          const result = validateUndo(game, tokenId, playerName);

          if (result.success && result.newPos && result.remaining !== undefined && result.path) {
            useGameStore.getState().updateEntity(tokenId, {
              x: result.newPos.x,
              y: result.newPos.y,
              movementState: {
                remaining: result.remaining,
                path: result.path
              }
            });

            onlineRoomManager.sendBroadcastMessage({
              type: 'MOVE_STEP_APPLIED',
              payload: {
                requestId,
                tokenId,
                x: result.newPos.x,
                y: result.newPos.y,
                remaining: result.remaining,
                path: result.path
              }
            });
          } else {
            onlineRoomManager.sendBroadcastMessage({
              type: 'MOVE_STEP_REJECTED',
              payload: {
                requestId,
                tokenId,
                reason: result.reason || 'No hay pasos para deshacer'
              }
            });
          }
        } else if (msg.type === 'END_TURN_REQUEST') {
          const { playerName } = msg.payload || {};
          if (playerName) {
            this.handleEndTurn(playerName);
          }
        }
      }

      // 2. En el Jugador Remoto: recibir avisos de rechazo
      if (!onlineRoomManager.isMasterUser()) {
        if (msg.type === 'MOVE_STEP_REJECTED') {
          const reason = msg.payload?.reason || 'Movimiento no permitido';
          movementSound.playWallBump();
          this.errorListeners.forEach((cb) => cb(reason));
        }
      }
    });
  }

  public onError(cb: (reason: string) => void): () => void {
    this.errorListeners.push(cb);
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== cb);
    };
  }

  public requestStep(tokenId: string, dx: number, dy: number, playerName: string) {
    if (!onlineRoomManager.isRoomActive()) return;
    onlineRoomManager.sendBroadcastMessage({
      type: 'MOVE_STEP_REQUEST',
      payload: {
        requestId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}_${Math.random()}`,
        tokenId,
        dx,
        dy,
        playerName
      }
    });
  }

  public requestUndo(tokenId: string, playerName: string) {
    if (!onlineRoomManager.isRoomActive()) return;
    onlineRoomManager.sendBroadcastMessage({
      type: 'MOVE_UNDO_REQUEST',
      payload: {
        requestId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}_${Math.random()}`,
        tokenId,
        playerName
      }
    });
  }

  public handleEndTurn(playerName: string) {
    const game = useGameStore.getState().game;
    const playerTokens = game.entities.filter(
      (ent) => ent.type === 'token' && ent.controlledBy && ent.controlledBy.trim().toLowerCase() === playerName.trim().toLowerCase()
    );

    for (const token of playerTokens) {
      useGameStore.getState().updateEntity(token.id, {
        movementState: {
          remaining: 0,
          path: token.movementState?.path || [],
          turnEnded: true
        }
      });
    }

    const message = `${playerName} ha terminado su turno`;
    try {
      useUIStore.getState().addToast(message, 'info', 4000);
    } catch {}
    syncChannel.sendTurnEndedNotice(message);
  }

  public requestEndTurn(playerName: string) {
    if (!onlineRoomManager.isRoomActive()) return;
    onlineRoomManager.sendBroadcastMessage({
      type: 'END_TURN_REQUEST',
      payload: { playerName }
    });
  }
}

export const movementManager = new MovementManager();
