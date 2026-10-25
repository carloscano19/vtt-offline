import { describe, it, expect } from 'vitest';
import polygonClipping from 'polygon-clipping';
import { Point2D } from '../src/types/entity';
import { ExploredMultiPolygon } from '../src/types/game';
import { unionExplored, visionToMulti } from '../src/modules/vision/fogMemory';
import { computeFogRegions, multiPolygonArea } from '../src/modules/vision/fogRegions';

describe('computeFogRegions (Render Lógico de Niebla)', () => {
  const bounds = { x: -1000, y: -1000, width: 2000, height: 2000 };

  it('con memoria activada: con explored = visión actual, la región visible tiene área > 0 y exploradoNoVisible área ≈ 0; tras mover el token, exploradoNoVisible incluye la zona anterior', () => {
    // 1. Visión en posición 1 (token quieto)
    const visPoly1: Point2D[] = [
      { x: -50, y: -50 },
      { x: 50, y: -50 },
      { x: 50, y: 50 },
      { x: -50, y: 50 }
    ];

    const explored1 = visionToMulti([visPoly1]);
    const regions1 = computeFogRegions(explored1, [visPoly1], bounds, [], true);

    const visibleArea1 = multiPolygonArea(regions1.visible);
    const expNoVisArea1 = multiPolygonArea(regions1.exploradoNoVisible);

    expect(visibleArea1).toBeGreaterThan(0);
    expect(expNoVisArea1).toBeLessThan(1e-3);

    // 2. Mover el token: nueva visión solapada parcialmente con la anterior
    const visPoly2: Point2D[] = [
      { x: 30, y: -50 },
      { x: 130, y: -50 },
      { x: 130, y: 50 },
      { x: 30, y: 50 }
    ];

    const explored2 = unionExplored(explored1, [visPoly2]);
    const regions2 = computeFogRegions(explored2, [visPoly2], bounds, [], true);

    const visibleArea2 = multiPolygonArea(regions2.visible);
    const expNoVisArea2 = multiPolygonArea(regions2.exploradoNoVisible);

    expect(visibleArea2).toBeGreaterThan(0);
    expect(expNoVisArea2).toBeGreaterThan(0);

    const intersectionWithOld = polygonClipping.intersection(
      regions1.visible,
      regions2.exploradoNoVisible
    ) as ExploredMultiPolygon;

    const intersectionArea = multiPolygonArea(intersectionWithOld);
    expect(intersectionArea).toBeGreaterThan(7000);
  });

  it('con memoria desactivada, tras mover el token la zona anterior no es visible ni explorada', () => {
    const visPoly1: Point2D[] = [
      { x: -50, y: -50 },
      { x: 50, y: -50 },
      { x: 50, y: 50 },
      { x: -50, y: 50 }
    ];

    const explored1 = visionToMulti([visPoly1]);

    // Mover token a pos 2 completamente fuera de pos 1
    const visPoly2: Point2D[] = [
      { x: 200, y: 200 },
      { x: 300, y: 200 },
      { x: 300, y: 300 },
      { x: 200, y: 300 }
    ];

    const explored2 = unionExplored(explored1, [visPoly2]);

    // Con rememberExplored = false
    const regions = computeFogRegions(explored2, [visPoly2], bounds, [], false);

    // exploradoNoVisible debe ser vacío (área 0)
    expect(multiPolygonArea(regions.exploradoNoVisible)).toBe(0);

    // La zona anterior no debe ser visible
    const intersectionWithOld = polygonClipping.intersection(
      regions.visible,
      explored1
    ) as ExploredMultiPolygon;
    expect(multiPolygonArea(intersectionWithOld)).toBe(0);

    // La zona anterior debe estar completamente cubierta por noExplorado (100% negro)
    const coveredByUnexplored = polygonClipping.intersection(
      regions.noExplorado,
      explored1
    ) as ExploredMultiPolygon;
    expect(multiPolygonArea(coveredByUnexplored)).toBeGreaterThan(9900);
  });

  it('zona revelada visible con memoria desactivada', () => {
    // Sin visión de tokens
    const revealedRect: ExploredMultiPolygon = [
      [
        [
          [100, 100],
          [200, 100],
          [200, 200],
          [100, 200],
          [100, 100]
        ]
      ]
    ];

    const regions = computeFogRegions([], [], bounds, revealedRect, false);

    // La zona revelada debe estar en visibleBright para el mapa (área 10000)
    const brightArea = multiPolygonArea(regions.visibleBright);
    expect(brightArea).toBeGreaterThanOrEqual(10000);

    // Pero tokenVisionTotal (visión real para mostrar tokens) debe ser vacía
    expect(multiPolygonArea(regions.tokenVisionTotal)).toBe(0);

    // La zona revelada no debe estar en noExplorado
    const inUnexplored = polygonClipping.intersection(
      regions.noExplorado,
      revealedRect
    ) as ExploredMultiPolygon;
    expect(multiPolygonArea(inUnexplored)).toBe(0);
  });

  it('zona tenue entre 4 y 6 casillas (bright 4, dim 2)', () => {
    const gridSize = 70;
    const brightRadius = 4 * gridSize; // 280px
    const totalRadius = (4 + 2) * gridSize; // 420px

    // Simular un token con brightPolygon de radio 280 y totalPolygon de radio 420
    const circleSteps = 32;
    const brightPoly: Point2D[] = [];
    const totalPoly: Point2D[] = [];

    for (let i = 0; i < circleSteps; i++) {
      const angle = (i / circleSteps) * Math.PI * 2;
      brightPoly.push({ x: Math.cos(angle) * brightRadius, y: Math.sin(angle) * brightRadius });
      totalPoly.push({ x: Math.cos(angle) * totalRadius, y: Math.sin(angle) * totalRadius });
    }

    const tokenVis = {
      tokenId: 'hero',
      brightPolygon: brightPoly,
      totalPolygon: totalPoly,
      polygon: totalPoly
    };

    const regions = computeFogRegions([], [tokenVis], bounds, [], false);

    const brightArea = multiPolygonArea(regions.visibleBright);
    const dimArea = multiPolygonArea(regions.visibleDim);

    // Área esperada de radio 280: pi * 280^2 ≈ 246,300
    expect(brightArea).toBeGreaterThan(200000);
    expect(brightArea).toBeLessThan(260000);

    // Área esperada del anillo entre 280 y 420: pi * (420^2 - 280^2) ≈ 307,876
    expect(dimArea).toBeGreaterThan(250000);
    expect(dimArea).toBeLessThan(350000);

    // visibleBright y visibleDim deben ser disjuntos
    const overlap = polygonClipping.intersection(
      regions.visibleBright,
      regions.visibleDim
    ) as ExploredMultiPolygon;
    expect(multiPolygonArea(overlap)).toBe(0);
  });
});
