import { describe, it, expect } from 'vitest';
import { LightManager } from '../src/modules/lights/lightManager';
import { AmbientLayer } from '../src/pixi/layers/AmbientLayer';
import { computeVisibilityPolygon } from '../src/modules/vision/visibilityPolygon';
import type { Entity, Point2D } from '../src/types/entity';

function isPointInPolygon(point: Point2D, vs: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

describe('Light Bleed & Cache Key Tests', () => {
  it('1. Two rooms separated by a wall: Light A sprite mask only contains A polygon and no points in Room 2', () => {
    const wall: Entity = {
      id: 'wall_mid',
      type: 'wall',
      x: 0,
      y: 0,
      layer: 'walls',
      points: [
        { x: 0, y: -500 },
        { x: 0, y: 500 }
      ]
    };

    const lightA: Entity = {
      id: 'light_A',
      type: 'light',
      x: -50,
      y: 0,
      layer: 'effects',
      light: {
        enabled: true,
        brightRadiusInSquares: 2,
        dimRadiusInSquares: 2,
        color: '#ff9a3c',
        intensity: 0.8
      }
    };

    const lightB: Entity = {
      id: 'light_B',
      type: 'light',
      x: 50,
      y: 0,
      layer: 'effects',
      light: {
        enabled: true,
        brightRadiusInSquares: 2,
        dimRadiusInSquares: 2,
        color: '#ff9a3c',
        intensity: 0.8
      }
    };

    const entities: Entity[] = [wall, lightA, lightB];
    const lightManager = new LightManager();
    const visibilities = lightManager.getLightsVisibility(entities, 70);

    expect(visibilities.length).toBe(2);

    const visA = visibilities.find((v) => v.lightId === 'light_A')!;
    const visB = visibilities.find((v) => v.lightId === 'light_B')!;

    // Polígono de la luz A está contenido en el lado x <= 0
    expect(isPointInPolygon({ x: -20, y: 0 }, visA.totalPolygon)).toBe(true);
    expect(isPointInPolygon({ x: 50, y: 0 }, visA.totalPolygon)).toBe(false);

    // Polígono de la luz B está contenido en el lado x >= 0
    expect(isPointInPolygon({ x: 20, y: 0 }, visB.totalPolygon)).toBe(true);
    expect(isPointInPolygon({ x: -50, y: 0 }, visB.totalPolygon)).toBe(false);

    // En AmbientLayer cada sprite tiene su propia máscara recortada a su polígono
    const layer = new AmbientLayer(true);
    const bounds = { x: -500, y: -500, width: 1000, height: 1000 };
    layer.update({ preset: 'dusk', color: '#c84224', intensity: 60 }, visibilities, bounds, 0.016);

    const maskA = layer.getDimMask(0);
    const maskB = layer.getDimMask(1);
    expect(maskA).toBeDefined();
    expect(maskB).toBeDefined();

    // La máscara A no contiene ningún punto de la sala 2 (x > 0)
    const polyA = (maskA as any)._polygon as Point2D[];
    expect(polyA).toBeDefined();
    expect(isPointInPolygon({ x: 50, y: 0 }, polyA)).toBe(false);
    expect(isPointInPolygon({ x: 20, y: 0 }, polyA)).toBe(false);
    expect(isPointInPolygon({ x: -30, y: 0 }, polyA)).toBe(true);

    // La máscara B no contiene ningún punto de la sala 1 (x < 0)
    const polyB = (maskB as any)._polygon as Point2D[];
    expect(polyB).toBeDefined();
    expect(isPointInPolygon({ x: -50, y: 0 }, polyB)).toBe(false);
    expect(isPointInPolygon({ x: -20, y: 0 }, polyB)).toBe(false);
    expect(isPointInPolygon({ x: 30, y: 0 }, polyB)).toBe(true);
  });

  it('2. Closed door: illuminating player token does not bleed light across the closed door', () => {
    const wallTop: Entity = {
      id: 'w_top',
      type: 'wall',
      x: 0,
      y: 0,
      layer: 'walls',
      points: [
        { x: 0, y: -500 },
        { x: 0, y: -50 }
      ]
    };

    const wallBottom: Entity = {
      id: 'w_bot',
      type: 'wall',
      x: 0,
      y: 0,
      layer: 'walls',
      points: [
        { x: 0, y: 50 },
        { x: 0, y: 500 }
      ]
    };

    const door: Entity = {
      id: 'door_mid',
      type: 'door',
      x: 0,
      y: 0,
      layer: 'doors',
      door: {
        p1: { x: 0, y: -50 },
        p2: { x: 0, y: 50 },
        isOpen: false,
        isLocked: false
      }
    };

    const playerToken: Entity = {
      id: 'token_player',
      type: 'token',
      name: 'Hero',
      side: 'jugador',
      x: -40,
      y: 0,
      layer: 'tokens',
      vision: {
        active: true,
        illuminates: true,
        brightRangeInSquares: 2,
        dimRangeInSquares: 2,
        shape: 'circle'
      }
    };

    const segments = [
      { p1: { x: 0, y: -500 }, p2: { x: 0, y: -50 } },
      { p1: { x: 0, y: -50 }, p2: { x: 0, y: 50 } },
      { p1: { x: 0, y: 50 }, p2: { x: 0, y: 500 } }
    ];

    const tokenPoly = computeVisibilityPolygon({ x: -40, y: 0 }, 280, segments);
    expect(isPointInPolygon({ x: -30, y: 0 }, tokenPoly)).toBe(true);
    expect(isPointInPolygon({ x: 40, y: 0 }, tokenPoly)).toBe(false);

    // En AmbientLayer, actualizar con este token iluminando
    const tokenVis = {
      tokenId: playerToken.id,
      center: { x: -40, y: 0 },
      brightRangePx: 140,
      totalRangePx: 280,
      shape: 'circle',
      illuminates: true,
      totalPolygon: tokenPoly
    };

    const layer = new AmbientLayer(true);
    const bounds = { x: -500, y: -500, width: 1000, height: 1000 };
    layer.update({ preset: 'dusk', color: '#c84224', intensity: 60 }, [], bounds, 0.016, [tokenVis]);

    const mask = layer.getDimMask(0);
    expect(mask).toBeDefined();
    const maskPoly = (mask as any)._polygon as Point2D[];
    expect(isPointInPolygon({ x: 40, y: 0 }, maskPoly)).toBe(false);
    expect(isPointInPolygon({ x: -30, y: 0 }, maskPoly)).toBe(true);
  });

  it('3. Moving a wall vertex (with same number of points) changes cache key and recalculates light polygon', () => {
    const wall: Entity = {
      id: 'wall_test',
      type: 'wall',
      x: 0,
      y: 0,
      layer: 'walls',
      points: [
        { x: 0, y: -100 },
        { x: 0, y: 100 }
      ]
    };

    const light: Entity = {
      id: 'light_1',
      type: 'light',
      x: -50,
      y: 0,
      layer: 'effects',
      light: {
        enabled: true,
        brightRadiusInSquares: 2,
        dimRadiusInSquares: 2
      }
    };

    const lightManager = new LightManager();
    const vis1 = lightManager.getLightsVisibility([wall, light], 70);
    const poly1 = vis1[0].totalPolygon;

    // Modificar un vértice manteniendo el mismo número de puntos (2 puntos)
    const modifiedWall: Entity = {
      ...wall,
      points: [
        { x: 0, y: -100 },
        { x: 30, y: 100 } // vértice desplazado
      ]
    };

    const vis2 = lightManager.getLightsVisibility([modifiedWall, light], 70);
    const poly2 = vis2[0].totalPolygon;

    // Los polígonos deben ser diferentes porque la geometría ha cambiado
    expect(poly1).not.toEqual(poly2);
  });

  it('4. Changing door.p2 recalculates the light polygon', () => {
    const door: Entity = {
      id: 'door_test',
      type: 'door',
      x: 0,
      y: 0,
      layer: 'doors',
      door: {
        p1: { x: 0, y: -50 },
        p2: { x: 0, y: 50 },
        isOpen: false,
        isLocked: false
      }
    };

    const light: Entity = {
      id: 'light_door',
      type: 'light',
      x: -40,
      y: 0,
      layer: 'effects',
      light: {
        enabled: true,
        brightRadiusInSquares: 2,
        dimRadiusInSquares: 2
      }
    };

    const lightManager = new LightManager();
    const vis1 = lightManager.getLightsVisibility([door, light], 70);
    const poly1 = vis1[0].totalPolygon;

    // Cambiar p2 de la puerta
    const modifiedDoor: Entity = {
      ...door,
      door: {
        p1: { x: 0, y: -50 },
        p2: { x: 40, y: 60 },
        isOpen: false,
        isLocked: false
      }
    };

    const vis2 = lightManager.getLightsVisibility([modifiedDoor, light], 70);
    const poly2 = vis2[0].totalPolygon;

    expect(poly1).not.toEqual(poly2);
  });

  it('5. Light placed on a wall line: its polygon does not cross to the other side of the wall', () => {
    // Pared vertical en x = 0 desde y = -200 hasta y = 200
    const segments = [
      { p1: { x: 0, y: -200 }, p2: { x: 0, y: 200 } }
    ];

    // Luz colocada exactamente sobre la línea de la pared en (0, 0)
    // Con hint hacia el interior izquierdo x < 0
    const polyLeft = computeVisibilityPolygon({ x: 0, y: 0 }, 100, segments, { x: -50, y: 0 });

    // Todos los puntos calculados deben estar en el lado x <= 0.05
    for (const pt of polyLeft) {
      expect(pt.x).toBeLessThanOrEqual(0.05);
    }

    // Y debe haber puntos en el lado x < 0
    const hasLeftPoints = polyLeft.some((pt) => pt.x < -10);
    expect(hasLeftPoints).toBe(true);

    // Con hint hacia el interior derecho x > 0
    const polyRight = computeVisibilityPolygon({ x: 0, y: 0 }, 100, segments, { x: 50, y: 0 });

    // Todos los puntos calculados deben estar en el lado x >= -0.05
    for (const pt of polyRight) {
      expect(pt.x).toBeGreaterThanOrEqual(-0.05);
    }

    const hasRightPoints = polyRight.some((pt) => pt.x > 10);
    expect(hasRightPoints).toBe(true);
  });
});
