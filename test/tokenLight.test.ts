import { describe, it, expect } from 'vitest';
import { Entity } from '../src/types/entity';
import { normalizeGameState } from '../src/modules/persistence/normalizer';
import { lightManager } from '../src/modules/lights/lightManager';
import { computeFogRegions, multiPolygonArea } from '../src/modules/vision/fogRegions';
import { LightPolygonData } from '../src/modules/vision/fogTypes';

describe('Bloque 1: Luz propia en tokens', () => {
  it('el normalizador establece enabled: false por defecto en tokens y true en luces', () => {
    const rawData = {
      entities: [
        {
          id: 'token-1',
          type: 'token',
          name: 'Orco',
          x: 100,
          y: 100,
          side: 'enemigo'
        },
        {
          id: 'token-2',
          type: 'token',
          name: 'Paladín',
          x: 200,
          y: 200,
          side: 'jugador',
          light: {
            color: '#ffffff',
            intensity: 100
          }
        },
        {
          id: 'light-1',
          type: 'light',
          name: 'Antorcha',
          x: 300,
          y: 300
        }
      ]
    };

    const normalized = normalizeGameState(rawData as any);
    const token1 = normalized.entities.find((e) => e.id === 'token-1')!;
    const token2 = normalized.entities.find((e) => e.id === 'token-2')!;
    const light1 = normalized.entities.find((e) => e.id === 'light-1')!;

    expect(token1.light?.enabled).toBe(false);
    expect(token2.light?.enabled).toBe(false);
    expect(light1.light?.enabled).toBe(true);
  });

  it('un token enemigo sin luz propia activada no genera emisión de luz en getLightsVisibility', () => {
    const entities: Entity[] = [
      {
        id: 'orc',
        type: 'token',
        name: 'Orco',
        x: 150,
        y: 150,
        side: 'enemigo',
        width: 70,
        height: 70,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        locked: false,
        visibleToPlayers: true,
        zIndex: 1,
        light: {
          enabled: false,
          color: '#ff0000',
          intensity: 100,
          brightRadiusInSquares: 4,
          dimRadiusInSquares: 2,
          edgeHardness: 0.5,
          flicker: false,
          shape: 'circle'
        }
      }
    ];

    const lights = lightManager.getLightsVisibility(entities, 70);
    expect(lights.length).toBe(0);
  });

  it('un token enemigo con luz propia activada genera luz que sigue su posición y rota con él', () => {
    const entities: Entity[] = [
      {
        id: 'orc-torch',
        type: 'token',
        name: 'Orco con linterna',
        x: 250,
        y: 350,
        side: 'enemigo',
        width: 70,
        height: 70,
        rotation: 45,
        scaleX: 1,
        scaleY: 1,
        locked: false,
        visibleToPlayers: true,
        zIndex: 1,
        light: {
          enabled: true,
          color: '#fbbf24',
          intensity: 80,
          brightRadiusInSquares: 3,
          dimRadiusInSquares: 2,
          edgeHardness: 0.5,
          flicker: false,
          shape: 'cone',
          coneAngle: 60,
          directionOffset: 15
        }
      }
    ];

    const lights = lightManager.getLightsVisibility(entities, 70);
    expect(lights.length).toBe(1);
    expect(lights[0].center.x).toBe(250);
    expect(lights[0].center.y).toBe(350);
    expect(lights[0].brightRangePx).toBe(3 * 70);
    expect(lights[0].totalRangePx).toBe((3 + 2) * 70);
    expect(lights[0].shape).toBe('cone');
    expect(lights[0].coneAngle).toBe(60);
    expect(lights[0].directionOffset).toBe(15);
    expect(lights[0].rotation).toBe(45);
  });

  it('la luz propia de un enemigo no descubre niebla si ningún jugador tiene línea de visión hacia ella', () => {
    const bounds = { x: -1000, y: -1000, width: 2000, height: 2000 };

    // Luz del enemigo a x: 500..600
    const enemyLightPoly: LightPolygonData = {
      lightId: 'enemy-light',
      x: 550,
      y: 550,
      color: '#ff8800',
      intensity: 1,
      edgeHardness: 0.5,
      brightRadius: 70,
      dimRadius: 70,
      totalRadius: 140,
      shape: 'circle',
      brightPolygon: [
        { x: 500, y: 500 },
        { x: 600, y: 500 },
        { x: 600, y: 600 },
        { x: 500, y: 600 }
      ],
      totalPolygon: [
        { x: 450, y: 450 },
        { x: 650, y: 450 },
        { x: 650, y: 650 },
        { x: 450, y: 650 }
      ]
    };

    // Jugador en (-200, -200) cuya línea de visión está bloqueada por un muro y solo llega hasta (-50, -50)
    const playerVision = {
      tokenId: 'player-1',
      brightPolygon: [
        { x: -250, y: -250 },
        { x: -50, y: -250 },
        { x: -50, y: -50 },
        { x: -250, y: -50 }
      ],
      totalPolygon: [
        { x: -250, y: -250 },
        { x: -50, y: -250 },
        { x: -50, y: -50 },
        { x: -250, y: -50 }
      ],
      // Línea de visión directa del jugador (losPolygon)
      losPolygon: [
        { x: -250, y: -250 },
        { x: -50, y: -250 },
        { x: -50, y: -50 },
        { x: -250, y: -50 }
      ]
    };

    const regions = computeFogRegions([], [playerVision], bounds, [], false, [enemyLightPoly]);

    // El área visible para los jugadores no debe cubrir la luz del enemigo
    const visibleArea = multiPolygonArea(regions.visible);
    // Área de la visión del jugador es 200 * 200 = 40,000
    expect(visibleArea).toBeCloseTo(40000, -2);
  });

  it('la luz propia de un enemigo en línea de visión de un jugador se vuelve visible para los jugadores', () => {
    const bounds = { x: -1000, y: -1000, width: 2000, height: 2000 };

    // Luz del enemigo a x: 500..600
    const enemyLightPoly: LightPolygonData = {
      lightId: 'enemy-light',
      x: 550,
      y: 550,
      color: '#ff8800',
      intensity: 1,
      edgeHardness: 0.5,
      brightRadius: 70,
      dimRadius: 70,
      totalRadius: 140,
      shape: 'circle',
      brightPolygon: [
        { x: 500, y: 500 },
        { x: 600, y: 500 },
        { x: 600, y: 600 },
        { x: 500, y: 600 }
      ],
      totalPolygon: [
        { x: 450, y: 450 },
        { x: 650, y: 450 },
        { x: 650, y: 650 },
        { x: 450, y: 650 }
      ]
    };

    // Jugador con visión corta (radio 100), pero con línea de visión despejada (losPolygon) que alcanza hasta x: 700
    const playerVision = {
      tokenId: 'player-1',
      brightPolygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ],
      totalPolygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ],
      // Línea de visión abierta que abarca la luz del enemigo
      losPolygon: [
        { x: 0, y: 0 },
        { x: 700, y: 0 },
        { x: 700, y: 700 },
        { x: 0, y: 700 }
      ]
    };

    const regions = computeFogRegions([], [playerVision], bounds, [], false, [enemyLightPoly]);

    // La región visible ahora debe incluir la visión corta del jugador (10,000) MÁS la luz del enemigo (total 200x200 = 40,000)
    const visibleArea = multiPolygonArea(regions.visible);
    expect(visibleArea).toBeGreaterThan(45000);
  });
});
