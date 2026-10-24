import { create } from 'zustand';
import { GameState, GridConfig, CameraState, CombatState, MusicState } from '../types/game';
import { Entity } from '../types/entity';

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
      snapToGrid: true
    },
    entities: [],
    masterCamera: { x: 0, y: 0, zoom: 1 },
    playerCamera: { x: 0, y: 0, zoom: 1 },
    followMasterCamera: false,
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
      volume: 0.8
    },
    createdAt: now,
    updatedAt: now
  };
}

interface GameStoreState {
  game: GameState;
  past: Entity[][];
  future: Entity[][];

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

  // Cámaras
  setMasterCamera: (camera: Partial<CameraState>) => void;
  setPlayerCamera: (camera: Partial<CameraState>) => void;
  sendMasterCameraToPlayers: () => void;
  setFollowMasterCamera: (follow: boolean) => void;

  // Combate
  setCombatState: (partial: Partial<CombatState>) => void;
  setTurnCounter: (turn: number) => void;

  // Música
  setMusicState: (partial: Partial<MusicState>) => void;

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
    set({
      game,
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

      // Si cambia el tamaño de la cuadrícula, reescalar todos los mapas para seguir alineados
      if (partial.size && partial.size !== oldGrid.size) {
        const newSize = partial.size;
        updatedEntities = state.game.entities.map((entity) => {
          if (entity.type === 'map' && entity.mapData && entity.mapData.pixelsPerGrid > 0) {
            const newScale = newSize / entity.mapData.pixelsPerGrid;
            return {
              ...entity,
              scaleX: newScale,
              scaleY: newScale
            };
          }
          return entity;
        });
      }

      return {
        game: {
          ...state.game,
          grid: newGrid,
          entities: updatedEntities,
          updatedAt: Date.now()
        }
      };
    });
  },

  addEntity: (entity) => {
    set((state) => {
      const past = [...state.past, state.game.entities];
      const entities = [...state.game.entities, entity];

      // Si es el primer mapa y el tablero estaba vacío, ajustar grid.size al pixelsPerGrid del mapa
      let grid = state.game.grid;
      if (entity.type === 'map' && state.game.entities.filter((e) => e.type === 'map').length === 0) {
        if (entity.mapData?.pixelsPerGrid) {
          grid = {
            ...grid,
            size: entity.mapData.pixelsPerGrid
          };
        }
      }

      return {
        game: {
          ...state.game,
          grid,
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
      const past = recordHistory ? [...state.past, state.game.entities] : state.past;
      const entities = state.game.entities.map((ent) => (ent.id === id ? { ...ent, ...partial } : ent));

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
      const past = [...state.past, state.game.entities];
      const entities = state.game.entities.filter((ent) => !idSet.has(ent.id));

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
        past: [...state.past, state.game.entities],
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

  setMusicState: (partial) => {
    set((state) => ({
      game: {
        ...state.game,
        music: { ...state.game.music, ...partial },
        updatedAt: Date.now()
      }
    }));
  },

  undo: () => {
    const { past, game, future } = get();
    if (past.length === 0) return;

    const previousEntities = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    set({
      game: { ...game, entities: previousEntities, updatedAt: Date.now() },
      past: newPast,
      future: [game.entities, ...future]
    });
  },

  redo: () => {
    const { past, game, future } = get();
    if (future.length === 0) return;

    const nextEntities = future[0];
    const newFuture = future.slice(1);

    set({
      game: { ...game, entities: nextEntities, updatedAt: Date.now() },
      past: [...past, game.entities],
      future: newFuture
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0
}));
