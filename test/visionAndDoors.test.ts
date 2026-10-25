import { describe, it, expect } from 'vitest';
import { computeVisibilityPolygon } from '../src/modules/vision/visibilityPolygon';
import { getAllWallSegments } from '../src/modules/walls/wallManager';
import { visionManager } from '../src/modules/vision/visionManager';
import { Entity } from '../src/types/entity';

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
});
