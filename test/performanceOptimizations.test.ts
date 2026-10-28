import { describe, it, expect, vi } from 'vitest';
import { LightManager } from '../src/modules/lights/lightManager';
import { VisionManager } from '../src/modules/vision/visionManager';
import { AmbientLayer } from '../src/pixi/layers/AmbientLayer';
import { Entity } from '../src/types/entity';

describe('Optimizaciones de rendimiento: Iluminación, Visión y Capa Ambiental', () => {
  it('LightManager reutiliza la caché de polígonos para luces estáticas y solo recalcula las modificadas', () => {
    const lm = new LightManager();

    const walls: Entity[] = [
      {
        id: 'wall_1',
        type: 'wall',
        name: 'Pared',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 1,
        visibleToPlayers: true,
        locked: false,
        points: [
          { x: 0, y: 0 },
          { x: 1000, y: 0 }
        ]
      }
    ];

    const torch1: Entity = {
      id: 'torch_1',
      type: 'effect',
      name: 'Brasero 1',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      effect: { preset: 'brazier', intensity: 80, speed: 1, emitsLight: true },
      light: { brightRadiusInSquares: 3, dimRadiusInSquares: 2, color: '#ff7700', intensity: 80, flicker: true }
    };

    const torch2: Entity = {
      id: 'torch_2',
      type: 'effect',
      name: 'Brasero 2',
      x: 300,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      effect: { preset: 'brazier', intensity: 80, speed: 1, emitsLight: true },
      light: { brightRadiusInSquares: 3, dimRadiusInSquares: 2, color: '#ff7700', intensity: 80, flicker: true }
    };

    const entities: Entity[] = [...walls, torch1, torch2];

    // Primer cálculo: ambas luces se calculan
    const lights1 = lm.getLightsVisibility(entities, 70);
    expect(lights1).toHaveLength(2);
    const l1_bright = lights1[0].brightPolygon;
    const l2_bright = lights1[1].brightPolygon;

    // Si se llama de nuevo sin cambios, devuelve la misma caché
    const lights2 = lm.getLightsVisibility(entities, 70);
    expect(lights2[0].brightPolygon).toBe(l1_bright);
    expect(lights2[1].brightPolygon).toBe(l2_bright);

    // Mover torch1: torch2 es estática y debe conservar sus polígonos cacheados
    const torch1_moved = { ...torch1, x: 150 };
    const entitiesMoved: Entity[] = [...walls, torch1_moved, torch2];

    const lights3 = lm.getLightsVisibility(entitiesMoved, 70);
    expect(lights3).toHaveLength(2);
    // torch2 debe haber reutilizado sus polígonos
    expect(lights3[1].brightPolygon).toBe(l2_bright);
    // torch1 debe tener un polígono nuevo por haberse movido
    expect(lights3[0].brightPolygon).not.toBe(l1_bright);
  });

  it('VisionManager reutiliza la caché de polígonos de visión para tokens estáticos', () => {
    const vm = new VisionManager();

    const token1: Entity = {
      id: 'token_1',
      type: 'token',
      name: 'Jugador 1',
      side: 'jugador',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      vision: { active: true, brightRangeInSquares: 4, dimRangeInSquares: 2 }
    };

    const token2: Entity = {
      id: 'token_2',
      type: 'token',
      name: 'Jugador 2',
      side: 'jugador',
      x: 300,
      y: 300,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      vision: { active: true, brightRangeInSquares: 4, dimRangeInSquares: 2 }
    };

    const entities = [token1, token2];
    const vis1 = vm.getTokensVisibility(entities, 70);
    expect(vis1).toHaveLength(2);
    const t2_poly = vis1[1].brightPolygon;

    // Mover token1: token2 debe reutilizar su polígono cacheado
    const token1_moved = { ...token1, x: 120 };
    const vis2 = vm.getTokensVisibility([token1_moved, token2], 70);
    expect(vis2[1].brightPolygon).toBe(t2_poly);
  });

  it('AmbientLayer no limpia darknessGfx ni dimMaskGfx en los fotogramas del ticker si no cambia la geometría', () => {
    const layer = new AmbientLayer(true);

    const lights = [
      {
        lightId: 'torch_1',
        center: { x: 200, y: 200 },
        color: '#ff7700',
        intensity: 0.8,
        brightPolygon: [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { x: 300, y: 300 },
          { x: 100, y: 300 }
        ],
        totalPolygon: [
          { x: 50, y: 50 },
          { x: 350, y: 50 },
          { x: 350, y: 350 },
          { x: 50, y: 350 }
        ],
        brightRangePx: 100,
        totalRangePx: 200,
        edgeHardness: 0.5,
        flicker: true
      }
    ];

    const bounds = { x: 0, y: 0, width: 1000, height: 1000 };
    const ambient = { preset: 'night' as const, color: '#091124', intensity: 0.15 };

    // Primer frame: genera geometría
    layer.update(ambient, lights, bounds, 0.016);

    // Espiar dimMaskGfx.clear y darknessGfx.clear
    const dimMaskGfx = (layer as any).dimMaskGfx;
    const darknessGfx = (layer as any).darknessGfx;
    const dimClearSpy = vi.spyOn(dimMaskGfx, 'clear');
    const darkClearSpy = vi.spyOn(darknessGfx, 'clear');

    // Simular 60 frames de animación continua de ticker (con flicker activo)
    for (let i = 0; i < 60; i++) {
      layer.update(ambient, lights, bounds, 0.016);
    }

    // Ningún frame debió haber llamado a clear() en la máscara o la oscuridad
    expect(dimClearSpy).not.toHaveBeenCalled();
    expect(darkClearSpy).not.toHaveBeenCalled();
  });
});
