import { describe, it, expect } from 'vitest';
import { snapPointToGridOrMidpoint } from '../src/pixi/utils/coordinates';
import { lightManager } from '../src/modules/lights/lightManager';
import { Entity } from '../src/types/entity';

describe('Doors snapping and hinge swapping', () => {
  it('snaps point to nearest grid intersection or midpoint (half-grid)', () => {
    const gridSize = 70; // Half-grid is 35

    // Exactly at intersection
    expect(snapPointToGridOrMidpoint({ x: 70, y: 140 }, gridSize)).toEqual({ x: 70, y: 140 });

    // Close to intersection (72, 138) -> snaps to (70, 140)
    expect(snapPointToGridOrMidpoint({ x: 72, y: 138 }, gridSize)).toEqual({ x: 70, y: 140 });

    // Close to midpoint (33, 102) -> snaps to (35, 105)
    expect(snapPointToGridOrMidpoint({ x: 33, y: 102 }, gridSize)).toEqual({ x: 35, y: 105 });

    // With map origin offset
    const origin = { x: 10, y: 20 };
    // Origin + 35 = 45, Origin + 70 = 80
    expect(snapPointToGridOrMidpoint({ x: 44, y: 82 }, gridSize, origin)).toEqual({ x: 45, y: 90 });
  });

  it('swaps door hinge by reversing p1 and p2', () => {
    const doorEntity: Entity = {
      id: 'door_test_1',
      type: 'door',
      name: 'Puerta Principal',
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
        p1: { x: 0, y: 0 },
        p2: { x: 70, y: 0 },
        openAngle: Math.PI / 2
      }
    };

    // Swap hinge
    const swapped = {
      ...doorEntity,
      door: {
        ...doorEntity.door!,
        p1: doorEntity.door!.p2,
        p2: doorEntity.door!.p1
      }
    };

    expect(swapped.door.p1).toEqual({ x: 70, y: 0 });
    expect(swapped.door.p2).toEqual({ x: 0, y: 0 });
  });
});

describe('Effects lighting and scale integration', () => {
  it('calculates dynamic light for effects with emitsLight = true', () => {
    const effectWithLight: Entity = {
      id: 'fx_torch_1',
      type: 'effect',
      name: 'Antorcha',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 25,
      visibleToPlayers: true,
      locked: false,
      effect: {
        preset: 'torch',
        color: '#ff9922',
        intensity: 80,
        speed: 1.0,
        emitsLight: true,
        baseLightRadius: 4
      },
      light: {
        color: '#ff9922',
        intensity: 80,
        brightRadiusInSquares: 4,
        dimRadiusInSquares: 2,
        edgeHardness: 0.5,
        flicker: true
      }
    };

    const effectWithoutLight: Entity = {
      id: 'fx_smoke_1',
      type: 'effect',
      name: 'Humo',
      x: 300,
      y: 300,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 25,
      visibleToPlayers: true,
      locked: false,
      effect: {
        preset: 'smoke_light',
        color: '#94a3b8',
        intensity: 50,
        speed: 1.0,
        emitsLight: false,
        baseLightRadius: 0
      }
    };

    const lights = lightManager.getLightsVisibility([effectWithLight, effectWithoutLight], 70);

    // Only the effect with emitsLight = true should produce lighting
    expect(lights.length).toBe(1);
    expect(lights[0].lightId).toBe('fx_torch_1');
    expect(lights[0].center).toEqual({ x: 100, y: 100 });
    expect(lights[0].brightRangePx).toBe(4 * 70); // 280 px
  });

  it('scales lighting radius when the effect scale is changed', () => {
    const scaledEffect: Entity = {
      id: 'fx_fire_large',
      type: 'effect',
      name: 'Incendio Grande',
      x: 200,
      y: 200,
      rotation: 0,
      scaleX: 2.0,
      scaleY: 2.0,
      zIndex: 25,
      visibleToPlayers: true,
      locked: false,
      effect: {
        preset: 'fire_large',
        color: '#ff3300',
        intensity: 90,
        speed: 1.0,
        emitsLight: true,
        baseLightRadius: 5
      },
      light: {
        color: '#ff3300',
        intensity: 90,
        brightRadiusInSquares: 5,
        dimRadiusInSquares: 2,
        edgeHardness: 0.5,
        flicker: true
      }
    };

    const lights = lightManager.getLightsVisibility([scaledEffect], 70);
    expect(lights.length).toBe(1);
    // Base 5 * scale 2 = 10 squares * 70px = 700px
    expect(lights[0].brightRangePx).toBe(10 * 70);
  });

  it('supports custom user effects with assetId emitting dynamic light', () => {
    const customUserEffect: Entity = {
      id: 'custom_fx_portal',
      type: 'effect',
      name: 'Vórtice Abisal',
      assetId: 'asset_user_video_123',
      x: 150,
      y: 150,
      rotation: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      zIndex: 25,
      visibleToPlayers: true,
      locked: false,
      effect: {
        preset: 'custom',
        category: 'arcane',
        color: '#8b5cf6',
        intensity: 95,
        speed: 1.0,
        emitsLight: true,
        baseLightRadius: 6
      },
      light: {
        color: '#8b5cf6',
        intensity: 95,
        brightRadiusInSquares: 6,
        dimRadiusInSquares: 2,
        edgeHardness: 0.5,
        flicker: false
      }
    };

    const lights = lightManager.getLightsVisibility([customUserEffect], 70);
    expect(lights.length).toBe(1);
    expect(lights[0].lightId).toBe('custom_fx_portal');
    // Base 6 * scale 1.5 = 9 squares * 70px = 630px
    expect(lights[0].brightRangePx).toBe(6 * 1.5 * 70);
  });
});

