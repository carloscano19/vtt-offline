import { describe, it, expect } from 'vitest';
import polygonClipping from 'polygon-clipping';
import { Point2D } from '../src/types/entity';
import { ExploredMultiPolygon } from '../src/types/game';
import { unionExplored, visionToMulti } from '../src/modules/vision/fogMemory';
import { computeFogRegions, multiPolygonArea } from '../src/modules/vision/fogRegions';

describe('computeFogRegions (Render Lógico de Niebla)', () => {
  it('con explored = visión actual, la región visible debe tener área > 0 y exploradoNoVisible área ≈ 0; tras mover el token, exploradoNoVisible debe incluir la zona anterior', () => {
    const bounds = { x: -1000, y: -1000, width: 2000, height: 2000 };

    // 1. Visión en posición 1 (token quieto)
    const visPoly1: Point2D[] = [
      { x: -50, y: -50 },
      { x: 50, y: -50 },
      { x: 50, y: 50 },
      { x: -50, y: 50 }
    ];

    // Con el token recién situado o quieto, explored es exactamente la visión actual
    const explored1 = visionToMulti([visPoly1]);
    const regions1 = computeFogRegions(explored1, [visPoly1], bounds);

    const visibleArea1 = multiPolygonArea(regions1.visible);
    const expNoVisArea1 = multiPolygonArea(regions1.exploradoNoVisible);

    // La región visible debe tener área > 0 y exploradoNoVisible área ≈ 0
    expect(visibleArea1).toBeGreaterThan(0);
    expect(expNoVisArea1).toBeLessThan(1e-3);

    // 2. Mover el token: nueva visión solapada parcialmente con la anterior
    const visPoly2: Point2D[] = [
      { x: 30, y: -50 },
      { x: 130, y: -50 },
      { x: 130, y: 50 },
      { x: 30, y: 50 }
    ];

    // El máster acumula la nueva visión a la memoria de exploración
    const explored2 = unionExplored(explored1, [visPoly2]);
    const regions2 = computeFogRegions(explored2, [visPoly2], bounds);

    const visibleArea2 = multiPolygonArea(regions2.visible);
    const expNoVisArea2 = multiPolygonArea(regions2.exploradoNoVisible);

    expect(visibleArea2).toBeGreaterThan(0);
    expect(expNoVisArea2).toBeGreaterThan(0);

    // Tras mover el token, exploradoNoVisible debe incluir la zona anterior no solapada
    // Zona anterior: [-50, 50] x [-50, 50] (área 10000). Zona no solapada: [-50, 30] x [-50, 50] (área 8000).
    const intersectionWithOld = polygonClipping.intersection(
      regions1.visible,
      regions2.exploradoNoVisible
    ) as ExploredMultiPolygon;

    const intersectionArea = multiPolygonArea(intersectionWithOld);
    expect(intersectionArea).toBeGreaterThan(7000); // 8000 menos márgenes de simplificación
  });
});
