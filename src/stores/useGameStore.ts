import { create } from 'zustand';
import {
  GameState,
  GridConfig,
  CameraState,
  CombatState,
  MusicState,
  MusicTrack,
  FogConfig,
  PlayerViewport,
  ExploredMultiPolygon,
  AmbientConfig,
  WeatherConfig
} from '../types/game';
import { Entity, recalculateDoorEndpoints, TokenStatus } from '../types/entity';
import { revealRect, hideRect } from '../modules/vision/fogMemory';
import { normalizeEntity, normalizeGameState } from '../modules/persistence/normalizer';
import { fitMapInViewport } from '../modules/camera/cameraUtils';
import { syncChannel } from '../modules/sync/syncChannel';
import { useUIStore } from './useUIStore';

/**
 * Reescala proporcionalmente las entidades existentes cuando cambia el tamaño de la cuadrícula.
 */
export function rescaleEntitiesForGridChange(entities: Entity[], oldSize: number, newSize: number): Entity[] {
  if (oldSize <= 0 || newSize <= 0 || oldSize === newSize) return entities;
  const gridRatio = newSize / oldSize;
  return entities.map((entity) => {
    if (entity.type === 'map' && entity.mapData && entity.mapData.pixelsPerGrid > 0) {
      const newScale = newSize / entity.mapData.pixelsPerGrid;
      return {
        ...entity,
        scaleX: newScale,
        scaleY: newScale
      };
    } else if (entity.type === 'token' || entity.type === 'object' || entity.type === 'effect') {
      return {
        ...entity,
        scaleX: entity.scaleX * gridRatio,
        scaleY: entity.scaleY * gridRatio
      };
    } else if (entity.type === 'door' && entity.door && !entity.mapId) {
      const newLength = (entity.door.length ?? oldSize) * gridRatio;
      const { p1, p2 } = recalculateDoorEndpoints(
        entity.x,
        entity.y,
        entity.rotation,
        newLength,
        entity.door.isHingeInverted
      );
      return {
        ...entity,
        door: {
          ...entity.door,
          length: newLength,
          p1,
          p2
        }
      };
    } else if (entity.type === 'wall' && entity.points && !entity.mapId) {
      return {
        ...entity,
        points: entity.points.map((p) => ({ x: p.x * gridRatio, y: p.y * gridRatio }))
      };
    }
    return entity;
  });
}

function createDefaultGame(): GameState {
  const now = Date.now();
  return {
    id: `game_${now}_${Math.random().toString(36).substring(2, 7)}`,
    name: 'Nueva Partida',
    turnCounter: 1,
    grid: {
      size: 70,
      color: '#ffffff',
      opacity: 0.25,
      visible: true,
      snapToGrid: true,
      wallsBlockMovement: false
    },
    entities: [],
    masterCamera: { x: 0, y: 0, zoom: 1 },
    playerCamera: { x: 0, y: 0, zoom: 1 },
    followMasterCamera: false,
    fog: {
      enabled: true,
      rememberExplored: false,
      explored: [],
      revealed: []
    },
    playerViewport: { width: 1920, height: 1080 },
    ambient: {
      preset: 'dusk',
      color: '#c84224',
      intensity: 60
    },
    weather: {
      rain: { enabled: false, intensity: 50, direction: 90 },
      snow: { enabled: false, intensity: 50 },
      wind: { enabled: false, intensity: 50, direction: 0 }
    },
    combat: {
      active: false,
      order: [],
      currentTurnIndex: 0,
      round: 1
    },
    music: {
      playlist: [],
      currentTrackId: null,
      isPlaying: false,
      volume: 0.8,
      loopTrack: false
    },
    createdAt: now,
    updatedAt: now,
    cloudSavedId: null,
    cloudSavedName: null,
    cloudSavedOwner: null,
    remotePlayersFrozen: false,
    onlineRoomOpen: false
  };
}

export interface HistorySnapshot {
  entities: Entity[];
  fog: FogConfig;
}

function createHistorySnapshot(game: GameState): HistorySnapshot {
  return {
    entities: game.entities,
    fog: { ...game.fog }
  };
}

function restoreHistorySnapshot(snap: any): { entities: Entity[]; fog?: FogConfig } {
  if (Array.isArray(snap)) {
    return { entities: snap };
  }
  return {
    entities: snap.entities,
    fog: snap.fog
  };
}

interface GameStoreState {
  game: GameState;
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // Acciones
  setGame: (game: GameState) => void;
  resetGame: () => void;

  // Cuadrícula y mapas
  setGridConfig: (partial: Partial<GridConfig>) => void;

  // Entidades
  addEntity: (entity: Entity) => void;
  updateEntity: (id: string, partial: Partial<Entity>, recordHistory?: boolean) => void;
  removeEntities: (ids: string[]) => void;
  toggleEntityLock: (id: string) => void;
  toggleEntityVisibility: (id: string) => void;
  reorderEntity: (id: string, toIndex: number) => void;
  flipEntitiesHorizontal: (ids: string[]) => void;
  flipEntitiesVertical: (ids: string[]) => void;

  // Cámaras
  setMasterCamera: (camera: Partial<CameraState>) => void;
  setPlayerCamera: (camera: Partial<CameraState>) => void;
  sendMasterCameraToPlayers: () => void;
  setFollowMasterCamera: (follow: boolean) => void;

  // Combate y Estados
  setCombatState: (partial: Partial<CombatState>) => void;
  setTurnCounter: (turn: number) => void;
  nextTurn: () => string[];
  addTokenStatus: (tokenId: string, status: Omit<TokenStatus, 'id'> | TokenStatus) => void;
  removeTokenStatus: (tokenId: string, statusId: string) => void;
  updateTokenStatus: (tokenId: string, statusId: string, updates: Partial<TokenStatus>) => void;
  duplicateEntity: (id: string) => string | undefined;

  // Jugadores remotos y movimiento limitado
  setRemotePlayersFrozen: (frozen: boolean) => void;
  setOnlineRoomOpen: (open: boolean) => void;
  resetTokenMovement: (tokenId: string) => void;
  adjustTokenMovement: (tokenId: string, delta: number) => void;

  // Ambiente y Clima
  setAmbientConfig: (partial: Partial<AmbientConfig>) => void;
  setWeatherConfig: (partial: Partial<WeatherConfig>) => void;

  // Música
  setMusicState: (partial: Partial<MusicState>) => void;
  addMusicTrack: (track: MusicTrack) => void;
  removeMusicTrack: (trackId: string) => void;
  updateMusicTrack: (trackId: string, partial: Partial<MusicTrack>) => void;

  // Niebla y Marco
  setFogConfig: (partial: Partial<FogConfig>) => void;
  resetFogExploration: () => void;
  setFogExplored: (explored: ExploredMultiPolygon) => void;
  revealFogRect: (rect: { x: number; y: number; width: number; height: number }) => void;
  hideFogRect: (rect: { x: number; y: number; width: number; height: number }) => void;
  setPlayerViewport: (viewport: PlayerViewport) => void;

  // Puertas
  toggleDoor: (doorEntityId: string) => void;
  setDoorLocked: (doorEntityId: string, locked: boolean) => void;

  // Historial (Deshacer/Rehacer)
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  game: createDefaultGame(),
  past: [],
  future: [],

  setGame: (game) => {
    const normalized = normalizeGameState(game);
    set({
      game: normalized,
      past: [],
      future: []
    });
  },

  resetGame: () => {
    set({
      game: createDefaultGame(),
      past: [],
      future: []
    });
  },

  setGridConfig: (partial) => {
    set((state) => {
      const oldGrid = state.game.grid;
      const newGrid = { ...oldGrid, ...partial };

      let updatedEntities = state.game.entities;
      let masterCamera = state.game.masterCamera;
      let playerCamera = state.game.playerCamera;

      // Si cambia el tamaño de la cuadrícula, reescalar proporcionalmente entidades existentes
      // y reescalar el zoom de masterCamera y playerCamera en la proporción inversa para mantener el encuadre visible
      if (partial.size && partial.size !== oldGrid.size && oldGrid.size > 0) {
        updatedEntities = rescaleEntitiesForGridChange(state.game.entities, oldGrid.size, partial.size);
        const invRatio = oldGrid.size / partial.size;
        masterCamera = {
          ...masterCamera,
          zoom: Math.max(0.05, Math.min(8.0, (masterCamera.zoom || 1) * invRatio))
        };
        playerCamera = {
          ...playerCamera,
          zoom: Math.max(0.05, Math.min(8.0, (playerCamera.zoom || 1) * invRatio))
        };
        syncChannel.sendCamera(playerCamera);
      }

      return {
        game: {
          ...state.game,
          grid: newGrid,
          masterCamera,
          playerCamera,
          entities: updatedEntities,
          updatedAt: Date.now()
        }
      };
    });
  },

  addEntity: (entity) => {
    const normalizedEntity = normalizeEntity(entity);
    set((state) => {
      const past = [...state.past, createHistorySnapshot(state.game)];
      let grid = state.game.grid;
      let existingEntities = state.game.entities;
      let finalEntity = normalizedEntity;
      let masterCamera = state.game.masterCamera;
      let playerCamera = state.game.playerCamera;

      // Si es el primer mapa y el tablero no tenía mapas, ajustar grid.size al pixelsPerGrid del mapa
      if (finalEntity.type === 'map' && state.game.entities.filter((e) => e.type === 'map').length === 0) {
        if (finalEntity.mapData?.pixelsPerGrid) {
          const newSize = finalEntity.mapData.pixelsPerGrid;
          const oldGridSize = state.game.grid.size || 70;
          grid = {
            ...grid,
            size: newSize
          };
          // La escala del primer mapa queda exactamente en 1 (grid.size / pixelsPerGrid = 1)
          finalEntity = {
            ...finalEntity,
            scaleX: 1,
            scaleY: 1
          };
          // Reescalar en proporción el resto de entidades existentes y masterCamera en la proporción inversa
          if (oldGridSize > 0 && oldGridSize !== newSize) {
            existingEntities = rescaleEntitiesForGridChange(existingEntities, oldGridSize, newSize);
            const invRatio = oldGridSize / newSize;
            masterCamera = {
              ...masterCamera,
              zoom: Math.max(0.05, Math.min(8.0, (masterCamera.zoom || 1) * invRatio))
            };
          }

          // Ajustar la cámara de jugadores para mostrar el mapa entero en la tele
          const fittedCam = fitMapInViewport([finalEntity], state.game.playerViewport);
          if (fittedCam) {
            playerCamera = fittedCam;
            syncChannel.sendCamera(fittedCam);
          }
        }
      }

      const entities = [...existingEntities, finalEntity];

      return {
        game: {
          ...state.game,
          grid,
          masterCamera,
          playerCamera,
          entities,
          updatedAt: Date.now()
        },
        past,
        future: []
      };
    });
  },

  updateEntity: (id, partial, recordHistory = true) => {
    set((state) => {
      const past = recordHistory ? [...state.past, createHistorySnapshot(state.game)] : state.past;
      const entities = state.game.entities.map((ent) => {
        if (ent.id !== id) return ent;
        const updated = { ...ent, ...partial };
        if (updated.type === 'token') {
          if (partial.side !== undefined) {
            if (partial.side === 'jugador') {
              updated.vision = {
                active: true,
                brightRangeInSquares: 6,
                dimRangeInSquares: 2,
                hardness: 0.5,
                shape: updated.vision?.shape ?? 'circle',
                coneAngle: updated.vision?.coneAngle ?? 60,
                directionOffset: updated.vision?.directionOffset ?? 0,
                illuminates: true
              };
            } else if (partial.side === 'enemigo' || partial.side === 'neutral') {
              if (updated.vision) {
                updated.vision = {
                  ...updated.vision,
                  active: false
                };
              }
            }
          } else if (updated.side === 'jugador' && !updated.vision) {
            updated.vision = {
              active: true,
              brightRangeInSquares: 6,
              dimRangeInSquares: 2,
              hardness: 0.5,
              illuminates: true
            };
          }
        }
        return updated;
      });

      return {
        game: {
          ...state.game,
          entities,
          updatedAt: Date.now()
        },
        past,
        future: recordHistory ? [] : state.future
      };
    });
  },

  removeEntities: (ids) => {
    set((state) => {
      if (ids.length === 0) return state;
      const idSet = new Set(ids);
      const past = [...state.past, createHistorySnapshot(state.game)];
      const entities = state.game.entities.filter((ent) => !idSet.has(ent.id));

      const updatedGame = {
        ...state.game,
        entities,
        updatedAt: Date.now()
      };

      // Limpiar selección y estado de edición en la UI si corresponde
      try {
        const ui = useUIStore.getState();
        if (ui.selectedEntityIds.some((id) => idSet.has(id))) {
          ui.setSelectedEntityIds(ui.selectedEntityIds.filter((id) => !idSet.has(id)));
        }
        if (ui.editingTokenStatusesId && idSet.has(ui.editingTokenStatusesId)) {
          ui.setEditingTokenStatusesId(null);
        }
      } catch {
        // Ignorar si se ejecuta fuera de entorno React/Zustand
      }

      // Cancelar cualquier arrastre y forzar sincronización inmediata con la tele
      syncChannel.setDraggingActive(false);
      syncChannel.sendState(updatedGame, true);

      return {
        game: updatedGame,
        past,
        future: []
      };
    });
  },

  toggleEntityLock: (id) => {
    set((state) => {
      const entities = state.game.entities.map((ent) => (ent.id === id ? { ...ent, locked: !ent.locked } : ent));
      return {
        game: { ...state.game, entities, updatedAt: Date.now() }
      };
    });
  },

  toggleEntityVisibility: (id) => {
    set((state) => {
      const entities = state.game.entities.map((ent) =>
        ent.id === id ? { ...ent, visibleToPlayers: !ent.visibleToPlayers } : ent
      );
      return {
        game: { ...state.game, entities, updatedAt: Date.now() }
      };
    });
  },

  reorderEntity: (id, toIndex) => {
    set((state) => {
      const currentIndex = state.game.entities.findIndex((e) => e.id === id);
      if (currentIndex === -1 || toIndex < 0 || toIndex >= state.game.entities.length) {
        return state;
      }
      const newEntities = [...state.game.entities];
      const [item] = newEntities.splice(currentIndex, 1);
      newEntities.splice(toIndex, 0, item);

      // Reasignar zIndex acorde a la posición en la lista
      newEntities.forEach((ent, idx) => {
        ent.zIndex = idx;
      });

      return {
        game: { ...state.game, entities: newEntities, updatedAt: Date.now() },
        past: [...state.past, createHistorySnapshot(state.game)],
        future: []
      };
    });
  },

  flipEntitiesHorizontal: (ids) => {
    if (ids.length === 0) return;
    set((state) => {
      const idSet = new Set(ids);
      const past = [...state.past, createHistorySnapshot(state.game)];
      const entities = state.game.entities.map((ent) => {
        if (!idSet.has(ent.id) || ent.type === 'wall') return ent;
        const currentScaleX = ent.scaleX ?? 1;
        return { ...ent, scaleX: -currentScaleX };
      });
      const updatedGame = { ...state.game, entities, updatedAt: Date.now() };
      syncChannel.sendState(updatedGame, true);
      return {
        game: updatedGame,
        past,
        future: []
      };
    });
  },

  flipEntitiesVertical: (ids) => {
    if (ids.length === 0) return;
    set((state) => {
      const idSet = new Set(ids);
      const past = [...state.past, createHistorySnapshot(state.game)];
      const entities = state.game.entities.map((ent) => {
        if (!idSet.has(ent.id) || ent.type === 'wall') return ent;
        const currentScaleY = ent.scaleY ?? 1;
        return { ...ent, scaleY: -currentScaleY };
      });
      const updatedGame = { ...state.game, entities, updatedAt: Date.now() };
      syncChannel.sendState(updatedGame, true);
      return {
        game: updatedGame,
        past,
        future: []
      };
    });
  },

  setMasterCamera: (camera) => {
    set((state) => {
      const newMasterCamera = { ...state.game.masterCamera, ...camera };
      const newPlayerCamera = state.game.followMasterCamera ? { ...newMasterCamera } : state.game.playerCamera;

      return {
        game: {
          ...state.game,
          masterCamera: newMasterCamera,
          playerCamera: newPlayerCamera
        }
      };
    });
  },

  setPlayerCamera: (camera) => {
    set((state) => ({
      game: {
        ...state.game,
        playerCamera: { ...state.game.playerCamera, ...camera }
      }
    }));
  },

  sendMasterCameraToPlayers: () => {
    set((state) => ({
      game: {
        ...state.game,
        playerCamera: { ...state.game.masterCamera }
      }
    }));
  },

  setFollowMasterCamera: (follow) => {
    set((state) => ({
      game: {
        ...state.game,
        followMasterCamera: follow,
        playerCamera: follow ? { ...state.game.masterCamera } : state.game.playerCamera
      }
    }));
  },

  setCombatState: (partial) => {
    set((state) => ({
      game: {
        ...state.game,
        combat: { ...state.game.combat, ...partial },
        updatedAt: Date.now()
      }
    }));
  },

  setTurnCounter: (turn) => {
    set((state) => ({
      game: { ...state.game, turnCounter: turn, updatedAt: Date.now() }
    }));
  },

  nextTurn: () => {
    const expiredNotifications: string[] = [];
    set((state) => {
      const past = [...state.past, createHistorySnapshot(state.game)];
      const currentTurn = (state.game.turnCounter || 1) + 1;
      let anyChanged = false;

      const entities = state.game.entities.map((ent) => {
        if (ent.type !== 'token') {
          return ent;
        }

        let updatedEnt = ent;

        // 1. Recargar presupuesto de movimiento y borrar camino verde SOLO si tiene controlledBy
        if (ent.controlledBy && ent.controlledBy.trim()) {
          const budget = typeof ent.movementBudget === 'number' ? ent.movementBudget : 7;
          anyChanged = true;
          updatedEnt = {
            ...updatedEnt,
            movementBudget: budget,
            movementState: {
              remaining: budget,
              path: [],
              turnEnded: false
            }
          };
        } else if (ent.movementBudget !== undefined || ent.movementState !== undefined) {
          // Limpiar en tokens sin controlledBy
          const clean = { ...updatedEnt };
          delete clean.movementBudget;
          delete clean.movementState;
          updatedEnt = clean;
          anyChanged = true;
        }

        // 2. Decrementar estados con turnos restantes
        if (Array.isArray(ent.statuses) && ent.statuses.length > 0) {
          const survivingStatuses: TokenStatus[] = [];
          for (const st of ent.statuses) {
            if (st.turnsRemaining === null) {
              // Sin límite: no cambia
              survivingStatuses.push(st);
            } else {
              anyChanged = true;
              const remaining = st.turnsRemaining - 1;
              if (remaining <= 0) {
                expiredNotifications.push(`${st.type} terminó en ${ent.name || 'Token'}`);
              } else {
                survivingStatuses.push({
                  ...st,
                  turnsRemaining: remaining
                });
              }
            }
          }
          updatedEnt = {
            ...updatedEnt,
            statuses: survivingStatuses
          };
        }

        return updatedEnt;
      });

      return {
        game: {
          ...state.game,
          turnCounter: currentTurn,
          entities,
          updatedAt: Date.now()
        },
        past: anyChanged ? past : state.past,
        future: anyChanged ? [] : state.future
      };
    });

    return expiredNotifications;
  },

  setRemotePlayersFrozen: (frozen: boolean) => {
    set((state) => ({
      game: {
        ...state.game,
        remotePlayersFrozen: frozen,
        updatedAt: Date.now()
      }
    }));
  },

  setOnlineRoomOpen: (open: boolean) => {
    set((state) => ({
      game: {
        ...state.game,
        onlineRoomOpen: open,
        updatedAt: Date.now()
      }
    }));
  },

  resetTokenMovement: (tokenId: string) => {
    set((state) => {
      let changed = false;
      const entities = state.game.entities.map((ent) => {
        if (ent.id === tokenId && ent.type === 'token') {
          changed = true;
          const budget = typeof ent.movementBudget === 'number' ? ent.movementBudget : 7;
          return {
            ...ent,
            movementBudget: budget,
            movementState: {
              remaining: budget,
              path: []
            }
          };
        }
        return ent;
      });

      if (!changed) return state;

      return {
        game: {
          ...state.game,
          entities,
          updatedAt: Date.now()
        }
      };
    });
  },

  adjustTokenMovement: (tokenId: string, delta: number) => {
    set((state) => {
      let changed = false;
      const entities = state.game.entities.map((ent) => {
        if (ent.id === tokenId && ent.type === 'token') {
          changed = true;
          const budget = typeof ent.movementBudget === 'number' ? ent.movementBudget : 7;
          const currentRemaining = typeof ent.movementState?.remaining === 'number'
            ? ent.movementState.remaining
            : budget;
          const remaining = Math.max(0, currentRemaining + delta);
          return {
            ...ent,
            movementState: {
              remaining,
              path: ent.movementState?.path || []
            }
          };
        }
        return ent;
      });

      if (!changed) return state;

      return {
        game: {
          ...state.game,
          entities,
          updatedAt: Date.now()
        }
      };
    });
  },

  addTokenStatus: (tokenId, status) => {
    set((state) => {
      const past = [...state.past, createHistorySnapshot(state.game)];
      const newStatus: TokenStatus = {
        id: 'id' in status && status.id ? status.id : `status_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: status.type,
        turnsRemaining: status.turnsRemaining !== undefined ? status.turnsRemaining : 1,
        visibleToPlayers: status.visibleToPlayers !== false
      };
      const entities = state.game.entities.map((e) => {
        if (e.id !== tokenId || e.type !== 'token') return e;
        const current = Array.isArray(e.statuses) ? e.statuses : [];
        return {
          ...e,
          statuses: [...current, newStatus]
        };
      });
      return {
        game: { ...state.game, entities, updatedAt: Date.now() },
        past,
        future: []
      };
    });
  },

  removeTokenStatus: (tokenId, statusId) => {
    set((state) => {
      const past = [...state.past, createHistorySnapshot(state.game)];
      const entities = state.game.entities.map((e) => {
        if (e.id !== tokenId || e.type !== 'token') return e;
        const current = Array.isArray(e.statuses) ? e.statuses : [];
        return {
          ...e,
          statuses: current.filter((s) => s.id !== statusId)
        };
      });
      return {
        game: { ...state.game, entities, updatedAt: Date.now() },
        past,
        future: []
      };
    });
  },

  updateTokenStatus: (tokenId, statusId, updates) => {
    set((state) => {
      const past = [...state.past, createHistorySnapshot(state.game)];
      const entities = state.game.entities.map((e) => {
        if (e.id !== tokenId || e.type !== 'token') return e;
        const current = Array.isArray(e.statuses) ? e.statuses : [];
        return {
          ...e,
          statuses: current.map((s) => (s.id === statusId ? { ...s, ...updates } : s))
        };
      });
      return {
        game: { ...state.game, entities, updatedAt: Date.now() },
        past,
        future: []
      };
    });
  },

  duplicateEntity: (id) => {
    const state = get();
    const source = state.game.entities.find((e) => e.id === id);
    if (!source) return undefined;

    const gridSize = state.game.grid.size || 70;
    const newId = `${source.type}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const clone: Entity = JSON.parse(JSON.stringify(source));
    clone.id = newId;
    clone.name = `${source.name} (copia)`;
    clone.x += gridSize;
    clone.y += gridSize;

    state.addEntity(clone);
    return newId;
  },

  setAmbientConfig: (partial) => {
    set((state) => {
      const updatedGame: GameState = {
        ...state.game,
        ambient: { ...state.game.ambient, ...partial },
        updatedAt: Date.now()
      };
      syncChannel.sendState(updatedGame, true);
      return { game: updatedGame };
    });
  },

  setWeatherConfig: (partial) => {
    set((state) => ({
      game: {
        ...state.game,
        weather: { ...state.game.weather, ...partial },
        updatedAt: Date.now()
      }
    }));
  },

  setMusicState: (partial) => {
    set((state) => ({
      game: {
        ...state.game,
        music: { ...state.game.music, ...partial },
        updatedAt: Date.now()
      }
    }));
  },

  addMusicTrack: (track) => {
    set((state) => ({
      game: {
        ...state.game,
        music: {
          ...state.game.music,
          playlist: [...state.game.music.playlist, track]
        },
        updatedAt: Date.now()
      }
    }));
  },

  removeMusicTrack: (trackId) => {
    set((state) => ({
      game: {
        ...state.game,
        music: {
          ...state.game.music,
          playlist: state.game.music.playlist.filter((t) => t.id !== trackId),
          currentTrackId: state.game.music.currentTrackId === trackId ? null : state.game.music.currentTrackId
        },
        updatedAt: Date.now()
      }
    }));
  },

  updateMusicTrack: (trackId, partial) => {
    set((state) => ({
      game: {
        ...state.game,
        music: {
          ...state.game.music,
          playlist: state.game.music.playlist.map((t) => (t.id === trackId ? { ...t, ...partial } : t))
        },
        updatedAt: Date.now()
      }
    }));
  },

  setFogConfig: (partial) => {
    set((state) => ({
      game: {
        ...state.game,
        fog: { ...state.game.fog, ...partial },
        updatedAt: Date.now()
      }
    }));
  },

  resetFogExploration: () => {
    set((state) => {
      const past = [...state.past, createHistorySnapshot(state.game)];
      const updatedGame: GameState = {
        ...state.game,
        fog: {
          ...state.game.fog,
          explored: [],
          revealed: []
        },
        updatedAt: Date.now()
      };
      syncChannel.sendState(updatedGame, true);
      return {
        game: updatedGame,
        past,
        future: []
      };
    });
  },

  setFogExplored: (explored) => {
    set((state) => ({
      game: {
        ...state.game,
        fog: { ...state.game.fog, explored },
        updatedAt: Date.now()
      }
    }));
  },

  revealFogRect: (rect) => {
    set((state) => {
      const past = [...state.past, createHistorySnapshot(state.game)];
      const updatedGame: GameState = {
        ...state.game,
        fog: {
          ...state.game.fog,
          revealed: revealRect(state.game.fog.revealed || [], rect)
        },
        updatedAt: Date.now()
      };
      syncChannel.sendState(updatedGame, true);
      return {
        game: updatedGame,
        past,
        future: []
      };
    });
  },

  hideFogRect: (rect) => {
    set((state) => {
      const past = [...state.past, createHistorySnapshot(state.game)];
      const updatedGame: GameState = {
        ...state.game,
        fog: {
          ...state.game.fog,
          revealed: hideRect(state.game.fog.revealed || [], rect),
          explored: hideRect(state.game.fog.explored || [], rect)
        },
        updatedAt: Date.now()
      };
      syncChannel.sendState(updatedGame, true);
      return {
        game: updatedGame,
        past,
        future: []
      };
    });
  },

  setPlayerViewport: (viewport) => {
    set((state) => ({
      game: {
        ...state.game,
        playerViewport: viewport
      }
    }));
  },

  toggleDoor: (doorEntityId) => {
    set((state) => {
      const past = [...state.past, createHistorySnapshot(state.game)];
      const entities = state.game.entities.map((e) => {
        if (e.id === doorEntityId && e.door) {
          if (e.door.isLocked) return e; // Puerta bloqueada con candado no se abre
          return {
            ...e,
            door: {
              ...e.door,
              isOpen: !e.door.isOpen
            }
          };
        }
        return e;
      });

      return {
        game: {
          ...state.game,
          entities,
          updatedAt: Date.now()
        },
        past,
        future: []
      };
    });
  },

  setDoorLocked: (doorEntityId, locked) => {
    set((state) => {
      const past = [...state.past, createHistorySnapshot(state.game)];
      const entities = state.game.entities.map((e) => {
        if (e.id === doorEntityId && e.door) {
          return {
            ...e,
            door: {
              ...e.door,
              isLocked: locked
            }
          };
        }
        return e;
      });

      return {
        game: {
          ...state.game,
          entities,
          updatedAt: Date.now()
        },
        past,
        future: []
      };
    });
  },

  undo: () => {
    const { past, game, future } = get();
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    const restored = restoreHistorySnapshot(previous);

    const updatedGame: GameState = {
      ...game,
      entities: restored.entities,
      fog: restored.fog ? { ...restored.fog } : game.fog,
      updatedAt: Date.now()
    };

    set({
      game: updatedGame,
      past: newPast,
      future: [createHistorySnapshot(game), ...future]
    });

    syncChannel.sendState(updatedGame, true);
  },

  redo: () => {
    const { past, game, future } = get();
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);
    const restored = restoreHistorySnapshot(next);

    const updatedGame: GameState = {
      ...game,
      entities: restored.entities,
      fog: restored.fog ? { ...restored.fog } : game.fog,
      updatedAt: Date.now()
    };

    set({
      game: updatedGame,
      past: [...past, createHistorySnapshot(game)],
      future: newFuture
    });

    syncChannel.sendState(updatedGame, true);
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0
}));
