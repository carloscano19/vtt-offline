import { describe, it, expect } from 'vitest';
import { snapPointToGridOrMidpoint } from '../src/pixi/utils/coordinates';
import { lightManager } from '../src/modules/lights/lightManager';
import { Entity, recalculateDoorEndpoints } from '../src/types/entity';
import { normalizeEntity } from '../src/modules/persistence/normalizer';

describe('Doors new token model and normalizer migration', () => {
  it('migrates legacy doors without length and center using normalizer', () => {
    const legacyDoor: Entity = {
      id: 'legacy_door_1',
      type: 'door',
      name: 'Puerta Antigua',
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
        p1: { x: 100, y: 50 },
        p2: { x: 200, y: 50 },
        openAngle: Math.PI / 2
      }
    };

    const normalized = normalizeEntity(legacyDoor);

    // Debe calcular centro (150, 50), largo 100px, rotación 0 y forzar scaleX=1, scaleY=1
    expect(normalized.x).toBe(150);
    expect(normalized.y).toBe(50);
    expect(normalized.rotation).toBeCloseTo(0);
    expect(normalized.scaleX).toBe(1);
    expect(normalized.scaleY).toBe(1);
    expect(normalized.door?.length).toBe(100);
    expect(normalized.door?.p1).toEqual({ x: 100, y: 50 });
    expect(normalized.door?.p2).toEqual({ x: 200, y: 50 });
  });

  it('recalculates door endpoints correctly for horizontal, vertical and rotated doors', () => {
    // Horizontal: centro (100, 100), largo 70, rot 0
    const horiz = recalculateDoorEndpoints(100, 100, 0, 70, false);
    expect(horiz.p1.x).toBeCloseTo(65);
    expect(horiz.p1.y).toBeCloseTo(100);
    expect(horiz.p2.x).toBeCloseTo(135);
    expect(horiz.p2.y).toBeCloseTo(100);

    // Vertical (rotación 90° = Math.PI / 2)
    const vert = recalculateDoorEndpoints(100, 100, Math.PI / 2, 70, false);
    expect(vert.p1.x).toBeCloseTo(100);
    expect(vert.p1.y).toBeCloseTo(65);
    expect(vert.p2.x).toBeCloseTo(100);
    expect(vert.p2.y).toBeCloseTo(135);

    // Invertir bisagra: p1 y p2 deben intercambiarse
    const horizInv = recalculateDoorEndpoints(100, 100, 0, 70, true);
    expect(horizInv.p1.x).toBeCloseTo(135);
    expect(horizInv.p1.y).toBeCloseTo(100);
    expect(horizInv.p2.x).toBeCloseTo(65);
    expect(horizInv.p2.y).toBeCloseTo(100);
  });

  it('swaps door hinge and retains exact length and center', () => {
    const doorEntity: Entity = {
      id: 'door_test_1',
      type: 'door',
      name: 'Puerta Principal',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 40,
      visibleToPlayers: true,
      locked: false,
      door: {
        isOpen: false,
        isLocked: false,
        length: 70,
        isHingeInverted: false,
        p1: { x: 65, y: 100 },
        p2: { x: 135, y: 100 },
        openAngle: Math.PI / 2
      }
    };

    const isInv = !doorEntity.door!.isHingeInverted;
    const { p1, p2 } = recalculateDoorEndpoints(doorEntity.x, doorEntity.y, doorEntity.rotation, doorEntity.door!.length!, isInv);

    expect(p1.x).toBe(135);
    expect(p2.x).toBe(65);
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

  it('normalizes saved entities with 8-digit ARGB colors to standard #rrggbb', () => {
    const rawLight: Entity = {
      id: 'saved_light_argb',
      type: 'light',
      name: 'Luz Dungeondraft',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 45,
      light: {
        color: 'ffeccd8b',
        intensity: 80,
        brightRadiusInSquares: 4,
        dimRadiusInSquares: 2,
        edgeHardness: 0.5,
        flicker: false
      }
    };

    const normalized = normalizeEntity(rawLight);
    expect(normalized.light?.color).toBe('#eccd8b');
  });
});

