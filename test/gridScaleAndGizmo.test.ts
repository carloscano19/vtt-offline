import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, rescaleEntitiesForGridChange } from '../src/stores/useGameStore';
import { normalizeGameState } from '../src/modules/persistence/normalizer';
import { Entity } from '../src/types/entity';
import { GameState } from '../src/types/game';

describe('Grid scale bug fix and map scale alignment', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it('sets grid.size = 256 and map scale = 1 when importing a 256 ppg map on an empty board', () => {
    const store = useGameStore.getState();
    expect(store.game.grid.size).toBe(70);
    expect(store.game.entities.length).toBe(0);

    // Simular creación del mapa tal como venía del toolbar / biblioteca
    const ppg = 256;
    const initialGridSize = store.game.grid.size; // 70
    const buggyScale = initialGridSize / ppg; // 0.2734

    const mapEntity: Entity = {
      id: 'map_dungeondraft_1',
      type: 'map',
      name: 'Kulkatar Entrance',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: buggyScale,
      scaleY: buggyScale,
      zIndex: 0,
      visibleToPlayers: true,
      locked: false,
      mapData: {
        pixelsPerGrid: ppg,
        gridWidth: 20,
        gridHeight: 15,
        walls: [],
        portals: [],
        lights: []
      }
    };

    useGameStore.getState().addEntity(mapEntity);

    const updatedGame = useGameStore.getState().game;
    // 1. La cuadrícula de la app debe actualizarse al ppg del mapa (256)
    expect(updatedGame.grid.size).toBe(256);

    // 2. La escala del mapa debe corregirse exactamente a 1 (256 / 256)
    const addedMap = updatedGame.entities.find((e) => e.id === 'map_dungeondraft_1');
    expect(addedMap).toBeDefined();
    expect(addedMap?.scaleX).toBe(1);
    expect(addedMap?.scaleY).toBe(1);

    // 3. Un token importado a continuación (lado mayor = 512px)
    // Se escala con currentGridSize (256) / maxDim (512) = 0.5
    // En el lienzo ocupará 512 * 0.5 = 256px, exactamente 1 casilla del mapa
    const currentGrid = updatedGame.grid.size;
    const tokenAssetMaxDim = 512;
    const tokenScale = currentGrid / tokenAssetMaxDim;
    expect(tokenScale).toBe(0.5);

    const tokenEntity: Entity = {
      id: 'token_hero_1',
      type: 'token',
      name: 'Paladín',
      x: 128,
      y: 128,
      rotation: 0,
      scaleX: tokenScale,
      scaleY: tokenScale,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false
    };

    useGameStore.getState().addEntity(tokenEntity);
    const addedToken = useGameStore.getState().game.entities.find((e) => e.id === 'token_hero_1');
    expect(addedToken?.scaleX).toBe(0.5);
    // El tamaño renderizado es maxDim * scaleX = 512 * 0.5 = 256px = 1 casilla
    expect(tokenAssetMaxDim * (addedToken?.scaleX || 1)).toBe(256);
  });

  it('rescales existing entities proportionally when the first map changes grid.size', () => {
    // Si ya había un token en el tablero antes de importar el mapa (diseñado para grid 70)
    const tokenEntity: Entity = {
      id: 'token_existing_1',
      type: 'token',
      name: 'Guerrero',
      x: 35,
      y: 35,
      rotation: 0,
      scaleX: 1, // 70px de tamaño
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false
    };
    useGameStore.getState().addEntity(tokenEntity);

    // Ahora se añade el mapa con ppg 256
    const mapEntity: Entity = {
      id: 'map_1',
      type: 'map',
      name: 'Mazmorra',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 0.2734,
      scaleY: 0.2734,
      zIndex: 0,
      visibleToPlayers: true,
      locked: false,
      mapData: {
        pixelsPerGrid: 256,
        gridWidth: 10,
        gridHeight: 10,
        walls: [],
        portals: [],
        lights: []
      }
    };
    useGameStore.getState().addEntity(mapEntity);

    const entities = useGameStore.getState().game.entities;
    const updatedToken = entities.find((e) => e.id === 'token_existing_1');
    // El token debe haber sido reescalado en proporción 256 / 70
    expect(updatedToken?.scaleX).toBeCloseTo(256 / 70);
    expect(updatedToken?.scaleY).toBeCloseTo(256 / 70);
  });

  it('normalizer repairs maps whose scale does not match grid.size / pixelsPerGrid', () => {
    const rawGameState: GameState = {
      id: 'game_repair_test',
      name: 'Partida con escala desfasada',
      turnCounter: 1,
      grid: {
        size: 256,
        color: '#ffffff',
        opacity: 0.25,
        visible: true,
        snapToGrid: true
      },
      masterCamera: { x: 0, y: 0, zoom: 1 },
      playerCamera: { x: 0, y: 0, zoom: 1 },
      fog: { enabled: true, revealed: [], explored: [], rememberExplored: false },
      entities: [
        {
          id: 'corrupted_map',
          type: 'map',
          name: 'Mapa Descalibrado',
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 0.2734375, // Escala errónea guardada (70/256)
          scaleY: 0.2734375,
          zIndex: 0,
          visibleToPlayers: true,
          locked: false,
          mapData: {
            pixelsPerGrid: 256,
            gridWidth: 20,
            gridHeight: 20,
            walls: [],
            portals: [],
            lights: []
          }
        }
      ],
      combat: { active: false, currentTurn: 0, round: 1, initiativeOrder: [] },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const normalized = normalizeGameState(rawGameState);
    const repairedMap = normalized.entities.find((e) => e.id === 'corrupted_map');
    // Debe haber reparado la escala a 256 / 256 = 1.0
    expect(repairedMap?.scaleX).toBe(1);
    expect(repairedMap?.scaleY).toBe(1);
  });

  it('rescaleEntitiesForGridChange rescales tokens, effects, doors and walls correctly', () => {
    const entities: Entity[] = [
      {
        id: 'tok',
        type: 'token',
        name: 'T',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 10,
        visibleToPlayers: true,
        locked: false
      },
      {
        id: 'fx',
        type: 'effect',
        name: 'Fuego',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 2,
        scaleY: 2,
        zIndex: 10,
        visibleToPlayers: true,
        locked: false
      },
      {
        id: 'unanchored_door',
        type: 'door',
        name: 'Puerta Suelta',
        x: 100,
        y: 100,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 40,
        visibleToPlayers: true,
        locked: false,
        door: {
          isOpen: false,
          isLocked: false,
          length: 70,
          p1: { x: 65, y: 100 },
          p2: { x: 135, y: 100 }
        }
      }
    ];

    const rescaled = rescaleEntitiesForGridChange(entities, 70, 140);
    const tok = rescaled.find((e) => e.id === 'tok');
    const fx = rescaled.find((e) => e.id === 'fx');
    const door = rescaled.find((e) => e.id === 'unanchored_door');

    expect(tok?.scaleX).toBe(2);
    expect(fx?.scaleX).toBe(4);
    expect(door?.door?.length).toBe(140);
  });
});
