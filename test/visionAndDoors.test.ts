import { describe, it, expect } from 'vitest';
import { computeVisibilityPolygon } from '../src/modules/vision/visibilityPolygon';
import { getAllWallSegments } from '../src/modules/walls/wallManager';
import { visionManager } from '../src/modules/vision/visionManager';
import { Entity } from '../src/types/entity';
import { useGameStore } from '../src/stores/useGameStore';
import { normalizeGameState, normalizeEntity } from '../src/modules/persistence/normalizer';

describe('Phase 2: Vision and Doors', () => {
  it('computes a visibility polygon clipped to range', () => {
    const origin = { x: 100, y: 100 };
    const rangePx = 300;
    const polygon = computeVisibilityPolygon(origin, rangePx, []);

    expect(polygon.length).toBeGreaterThan(10);
    // All points should be within radius plus small delta
    for (const pt of polygon) {
      const dist = Math.hypot(pt.x - origin.x, pt.y - origin.y);
      expect(dist).toBeLessThanOrEqual(rangePx + 1);
    }
  });

  it('stops vision rays at wall segments', () => {
    const origin = { x: 0, y: 0 };
    const rangePx = 500;
    // Wall segment in front at x = 100 from y = -200 to y = 200
    const segments = [
      {
        p1: { x: 100, y: -200 },
        p2: { x: 100, y: 200 },
        entityId: 'wall_1',
        source: 'drawn' as const
      }
    ];

    const polygon = computeVisibilityPolygon(origin, rangePx, segments);
    expect(polygon.length).toBeGreaterThan(0);

    // Any point directly to the right (x > 100, y between -150 and 150) should NOT exceed x = 100
    const rightPoints = polygon.filter((p) => Math.abs(p.y) < 50 && p.x > 0);
    expect(rightPoints.length).toBeGreaterThan(0);
    for (const p of rightPoints) {
      expect(p.x).toBeLessThanOrEqual(100.5);
    }
  });

  it('includes closed doors in wall segments and excludes open doors', () => {
    const entities: Entity[] = [
      {
        id: 'door_closed',
        type: 'door',
        name: 'Puerta Cerrada',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 40,
        visibleToPlayers: true,
        locked: false,
        door: {
          isOpen: false,
          isLocked: false,
          p1: { x: 100, y: 0 },
          p2: { x: 100, y: 100 }
        }
      },
      {
        id: 'door_open',
        type: 'door',
        name: 'Puerta Abierta',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 40,
        visibleToPlayers: true,
        locked: false,
        door: {
          isOpen: true,
          isLocked: false,
          p1: { x: 200, y: 0 },
          p2: { x: 200, y: 100 }
        }
      }
    ];

    const segments = getAllWallSegments(entities);
    const closedSeg = segments.find((s) => s.entityId === 'door_closed');
    const openSeg = segments.find((s) => s.entityId === 'door_open');

    expect(closedSeg).toBeDefined();
    expect(openSeg).toBeUndefined();
  });

  it('calculates vision only for player tokens with active vision and caches results', () => {
    const entities: Entity[] = [
      {
        id: 'token_player_1',
        type: 'token',
        name: 'Hero',
        x: 50,
        y: 50,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 10,
        visibleToPlayers: true,
        locked: false,
        side: 'jugador',
        vision: {
          active: true,
          rangeInSquares: 12,
          hardness: 0.5
        }
      },
      {
        id: 'token_player_no_vision',
        type: 'token',
        name: 'Blind Hero',
        x: 200,
        y: 200,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 10,
        visibleToPlayers: true,
        locked: false,
        side: 'jugador',
        vision: {
          active: false,
          rangeInSquares: 12,
          hardness: 0.5
        }
      },
      {
        id: 'token_enemy',
        type: 'token',
        name: 'Goblin',
        x: 400,
        y: 400,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 10,
        visibleToPlayers: false,
        locked: false,
        side: 'enemigo',
        vision: {
          active: true,
          rangeInSquares: 12,
          hardness: 0.5
        }
      }
    ];

    const visibilities = visionManager.getTokensVisibility(entities, 70);
    expect(visibilities.length).toBe(1);
    expect(visibilities[0].tokenId).toBe('token_player_1');
    expect(visibilities[0].rangePx).toBe(12 * 70);

    // Call again with same entities - should return cached result instantly
    const cachedVisibilities = visionManager.getTokensVisibility(entities, 70);
    expect(cachedVisibilities).toBe(visibilities);
  });

  it('normaliza partida antigua con tokens sin campo vision: token jugador recibe vision.active = true y genera polígono de visión', () => {
    // Partida guardada antes de la Fase 2 (sin campo vision en ningún token)
    const oldGameState = {
      id: 'game_pre_phase_2',
      name: 'Partida Antigua',
      turnCounter: 1,
      grid: { size: 70, color: '#ffffff', opacity: 0.25, visible: true, snapToGrid: true },
      entities: [
        {
          id: 'hero_pre_phase2',
          type: 'token' as const,
          name: 'Héroe Antiguo',
          x: 150,
          y: 150,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          zIndex: 10,
          visibleToPlayers: true,
          locked: false,
          side: 'jugador' as const
          // NO tiene campo vision
        },
        {
          id: 'goblin_pre_phase2',
          type: 'token' as const,
          name: 'Goblin Antiguo',
          x: 400,
          y: 400,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          zIndex: 10,
          visibleToPlayers: false,
          locked: false,
          side: 'enemigo' as const
          // NO tiene campo vision
        }
      ],
      masterCamera: { x: 0, y: 0, zoom: 1 },
      playerCamera: { x: 0, y: 0, zoom: 1 },
      followMasterCamera: false,
      fog: { enabled: true, explored: [] },
      combat: { active: false, order: [], currentTurnIndex: 0, round: 1 },
      music: { playlist: [], currentTrackId: null, isPlaying: false, volume: 0.8 },
      createdAt: 1000,
      updatedAt: 1000
    };

    // 1. Cargar partida en el store con setGame
    useGameStore.getState().setGame(oldGameState as any);
    const loadedGame = useGameStore.getState().game;

    // 2. Verificar normalización en las entidades
    const hero = loadedGame.entities.find((e) => e.id === 'hero_pre_phase2');
    const goblin = loadedGame.entities.find((e) => e.id === 'goblin_pre_phase2');

    expect(hero).toBeDefined();
    expect(hero?.vision).toBeDefined();
    expect(hero?.vision?.active).toBe(true);
    expect(hero?.vision?.rangeInSquares).toBe(12);
    expect(hero?.vision?.hardness).toBe(0.5);

    expect(goblin).toBeDefined();
    expect(goblin?.vision).toBeDefined();
    expect(goblin?.vision?.active).toBe(false);

    // 3. Comprobar que genera polígono de visión para el token jugador
    const visibilities = visionManager.getTokensVisibility(loadedGame.entities, loadedGame.grid.size);
    expect(visibilities.length).toBe(1);
    expect(visibilities[0].tokenId).toBe('hero_pre_phase2');
    expect(visibilities[0].polygon.length).toBeGreaterThan(10);
  });

  it('addEntity normaliza tokens sin campo vision y al cambiar bando a jugador se crea visión activada', () => {
    const rawToken: Entity = {
      id: 'token_new_raw',
      type: 'token',
      name: 'Nuevo Jugador',
      x: 50,
      y: 50,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      side: 'jugador'
      // sin vision
    };

    useGameStore.getState().addEntity(rawToken);
    let token = useGameStore.getState().game.entities.find((e) => e.id === 'token_new_raw');
    expect(token?.vision?.active).toBe(true);

    const rawEnemy: Entity = {
      id: 'token_enemy_raw',
      type: 'token',
      name: 'Monstruo',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: false,
      locked: false,
      side: 'enemigo'
    };
    useGameStore.getState().addEntity(rawEnemy);
    let enemyToken = useGameStore.getState().game.entities.find((e) => e.id === 'token_enemy_raw');
    expect(enemyToken?.vision?.active).toBe(false);

    // Al cambiar bando a jugador si no tiene vision definida, se crea activada
    useGameStore.getState().updateEntity('token_enemy_raw', { side: 'jugador', vision: undefined });
    enemyToken = useGameStore.getState().game.entities.find((e) => e.id === 'token_enemy_raw');
    expect(enemyToken?.vision?.active).toBe(true);
  });
});
