import { describe, it, expect } from 'vitest';
import polygonClipping from 'polygon-clipping';
import { Point2D } from '../src/types/entity';
import { ExploredMultiPolygon } from '../src/types/game';
import { unionExplored, visionToMulti } from '../src/modules/vision/fogMemory';
import { computeFogRegions, multiPolygonArea, isPointInMultiPolygon } from '../src/modules/vision/fogRegions';

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

  describe('Niebla de guerra sobre las luces (Cartulina con agujero)', () => {
    // Jugador en (0, 0) con radio de visión 150 y línea de visión ilimitada (hasta 800)
    const tokenVis = {
      tokenId: 'player',
      brightPolygon: [
        { x: -150, y: -150 },
        { x: 150, y: -150 },
        { x: 150, y: 150 },
        { x: -150, y: 150 }
      ],
      totalPolygon: [
        { x: -150, y: -150 },
        { x: 150, y: -150 },
        { x: 150, y: 150 },
        { x: -150, y: 150 }
      ],
      losPolygon: [
        { x: -800, y: -800 },
        { x: 800, y: -800 },
        { x: 800, y: 800 },
        { x: -800, y: 800 }
      ]
    };

    it('1. Una antorcha fuera del radio de visión pero con línea de visión no se ve; si entra en el radio de visión, sí', () => {
      // Antorcha lejana a (500, 0) fuera del radio de visión (150) pero dentro del LoS
      const farTorchLight = {
        lightId: 'torch-far',
        x: 500,
        y: 0,
        brightPolygon: [
          { x: 450, y: -50 },
          { x: 550, y: -50 },
          { x: 550, y: 50 },
          { x: 450, y: 50 }
        ],
        totalPolygon: [
          { x: 400, y: -100 },
          { x: 600, y: -100 },
          { x: 600, y: 100 },
          { x: 400, y: 100 }
        ]
      };

      // Por defecto (showFarLightsInLoS = false): la antorcha lejana NO amplía el agujero visible
      const regionsOutside = computeFogRegions([], [tokenVis], bounds, [], false, [farTorchLight], false);
      expect(isPointInMultiPolygon({ x: 500, y: 0 }, regionsOutside.visible)).toBe(false);

      // Si la antorcha está dentro del radio de visión (en (100, 0)): sí está dentro del agujero visible
      expect(isPointInMultiPolygon({ x: 100, y: 0 }, regionsOutside.visible)).toBe(true);

      const nearTorchLight = {
        lightId: 'torch-near',
        x: 100,
        y: 0,
        brightPolygon: [
          { x: 50, y: -50 },
          { x: 150, y: -50 },
          { x: 150, y: 50 },
          { x: 50, y: 50 }
        ],
        totalPolygon: [
          { x: 0, y: -100 },
          { x: 200, y: -100 },
          { x: 200, y: 100 },
          { x: 0, y: 100 }
        ]
      };
      const regionsInside = computeFogRegions([], [tokenVis], bounds, [], false, [nearTorchLight], false);
      expect(isPointInMultiPolygon({ x: 100, y: 0 }, regionsInside.visible)).toBe(true);
    });

    it('2. Un enemigo con luz propia fuera del radio de visión no se ve', () => {
      // Enemigo a (450, 450) con luz propia
      const enemyLight = {
        lightId: 'enemy-torch',
        x: 450,
        y: 450,
        brightPolygon: [
          { x: 400, y: 400 },
          { x: 500, y: 400 },
          { x: 500, y: 500 },
          { x: 400, y: 500 }
        ],
        totalPolygon: [
          { x: 350, y: 350 },
          { x: 550, y: 350 },
          { x: 550, y: 550 },
          { x: 350, y: 550 }
        ]
      };

      const regions = computeFogRegions([], [tokenVis], bounds, [], false, [enemyLight], false);

      // La posición del enemigo y su luz están fuera de la región visible de los jugadores
      expect(isPointInMultiPolygon({ x: 450, y: 450 }, regions.visible)).toBe(false);
      expect(isPointInMultiPolygon({ x: 400, y: 400 }, regions.visible)).toBe(false);
      // El área visible es estrictamente la del jugador (150*2 x 150*2 = 90,000)
      expect(multiPolygonArea(regions.visible)).toBeCloseTo(90000, -2);
    });

    it('3. Con el selector activado (showFarLightsInLoS = true), vuelve el comportamiento anterior', () => {
      const farTorchLight = {
        lightId: 'torch-far',
        x: 500,
        y: 0,
        brightPolygon: [
          { x: 450, y: -50 },
          { x: 550, y: -50 },
          { x: 550, y: 50 },
          { x: 450, y: 50 }
        ],
        totalPolygon: [
          { x: 400, y: -100 },
          { x: 600, y: -100 },
          { x: 600, y: 100 },
          { x: 400, y: 100 }
        ]
      };

      // Con showFarLightsInLoS = true, la luz en línea de visión sí amplía la región visible
      const regionsWithFar = computeFogRegions([], [tokenVis], bounds, [], false, [farTorchLight], true);
      expect(isPointInMultiPolygon({ x: 500, y: 0 }, regionsWithFar.visible)).toBe(true);
      expect(multiPolygonArea(regionsWithFar.visible)).toBeGreaterThan(120000);
    });
  });
});
