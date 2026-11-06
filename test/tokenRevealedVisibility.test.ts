import { describe, it, expect } from 'vitest';
import { Entity, Point2D } from '../src/types/entity';
import { ExploredMultiPolygon } from '../src/types/game';
import { computeFogRegions, isPointInMultiPolygon } from '../src/modules/vision/fogRegions';
import { TokensLayer } from '../src/pixi/layers/TokensLayer';

describe('Bloque 2: Tokens dentro de zonas visibles y reveladas', () => {
  const bounds = { x: -1000, y: -1000, width: 2000, height: 2000 };

  it('isPointInMultiPolygon detecta si un punto está dentro de un multipolígono con agujeros', () => {
    // Un cuadrado de 0 a 100 con un hueco interior de 40 a 60
    const multi: ExploredMultiPolygon = [
      [
        // Contorno exterior
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0]
        ],
        // Hueco interior
        [
          [40, 40],
          [60, 40],
          [60, 60],
          [40, 60],
          [40, 40]
        ]
      ]
    ];

    // Dentro del polígono pero fuera del hueco
    expect(isPointInMultiPolygon({ x: 20, y: 20 }, multi)).toBe(true);
    expect(isPointInMultiPolygon({ x: 80, y: 80 }, multi)).toBe(true);

    // Dentro del hueco -> false
    expect(isPointInMultiPolygon({ x: 50, y: 50 }, multi)).toBe(false);

    // Fuera del polígono exterior -> false
    expect(isPointInMultiPolygon({ x: 150, y: 150 }, multi)).toBe(false);
  });

  it('un enemigo dentro de una zona revelada por el máster es visible en la tele sin jugadores cerca', async () => {
    // Zona revelada por el máster en x: 200..400, y: 200..400
    const revealedRect: ExploredMultiPolygon = [
      [
        [
          [200, 200],
          [400, 200],
          [400, 400],
          [200, 400],
          [200, 200]
        ]
      ]
    ];

    // No hay jugadores cerca (visión de jugadores vacía)
    const regions = computeFogRegions([], [], bounds, revealedRect, false, []);

    // Enemigo dentro de la zona revelada
    const enemy: Entity = {
      id: 'goblin-1',
      type: 'token',
      name: 'Goblin',
      x: 300,
      y: 300,
      side: 'enemigo',
      width: 70,
      height: 70,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      locked: false,
      visibleToPlayers: true,
      zIndex: 1
    };

    expect(isPointInMultiPolygon({ x: enemy.x, y: enemy.y }, regions.visible)).toBe(true);

    // Simular TokensLayer en la tele (isMaster = false)
    const tvTokensLayer = new TokensLayer(false);
    await tvTokensLayer.syncEntities(
      [enemy],
      [],
      [],
      false, // isPlayerPreview
      true,  // fogEnabled
      70,
      1.0,
      regions.visible
    );

    const container = (tvTokensLayer as any).containerMap.get(enemy.id);
    expect(container).toBeDefined();
    // Fade target debe ser 1.0 (visible)
    const fade = (tvTokensLayer as any).fadeMap.get(enemy.id);
    expect(fade).toBeDefined();
    expect(fade.target).toBe(1.0);
  });

  it('al salir de la zona visible, el enemigo se funde suavemente hacia invisible a 0.6s', async () => {
    const revealedRect: ExploredMultiPolygon = [
      [
        [
          [200, 200],
          [400, 200],
          [400, 400],
          [200, 400],
          [200, 200]
        ]
      ]
    ];

    const regions = computeFogRegions([], [], bounds, revealedRect, false, []);

    const enemy: Entity = {
      id: 'goblin-1',
      type: 'token',
      name: 'Goblin',
      x: 300,
      y: 300,
      side: 'enemigo',
      width: 70,
      height: 70,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      locked: false,
      visibleToPlayers: true,
      zIndex: 1
    };

    const tvTokensLayer = new TokensLayer(false);
    await tvTokensLayer.syncEntities([enemy], [], [], false, true, 70, 1.0, regions.visible);

    const fade = (tvTokensLayer as any).fadeMap.get(enemy.id);
    expect(fade.current).toBe(1.0);
    expect(fade.target).toBe(1.0);

    // Mover al enemigo fuera de la zona visible (x: 600, y: 600)
    const movedEnemy = { ...enemy, x: 600, y: 600 };
    await tvTokensLayer.syncEntities([movedEnemy], [], [], false, true, 70, 1.0, regions.visible);

    // targetVisibility pasa a 0.0, pero current arranca en 1.0 para fundirse
    expect(fade.target).toBe(0.0);
    expect(fade.current).toBe(1.0);

    // Avanzar 0.3 segundos (la mitad de 0.6s)
    tvTokensLayer.tick(0.3);
    expect(fade.current).toBeCloseTo(0.5, 1);
    const container = (tvTokensLayer as any).containerMap.get(enemy.id);
    expect(container.alpha).toBeCloseTo(0.5, 1);
    expect(container.visible).toBe(true);

    // Avanzar otros 0.3 segundos (completa 0.6s)
    tvTokensLayer.tick(0.3);
    expect(fade.current).toBe(0.0);
    expect(container.visible).toBe(false);
  });
});
