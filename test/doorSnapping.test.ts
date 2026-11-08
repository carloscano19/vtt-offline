import { describe, it, expect } from 'vitest';
import { snapDoorRotation, snapDoorMovement, snapDoorLength, findNearbyWallEndpoint } from '../src/pixi/utils/doorSnapping';
import { Entity } from '../src/types/entity';

describe('Puertas más fáciles de encajar (doorSnapping)', () => {
  const DEG_TO_RAD = Math.PI / 180;

  describe('snapDoorRotation', () => {
    it('imanta a 0°, 90°, 180°, 270° si está a ±5°', () => {
      // 3° -> 0°
      expect(snapDoorRotation(3 * DEG_TO_RAD, false)).toBeCloseTo(0, 5);
      // 357° (-3°) -> 0°
      expect(snapDoorRotation(357 * DEG_TO_RAD, false)).toBeCloseTo(0, 5);
      // 88° -> 90°
      expect(snapDoorRotation(88 * DEG_TO_RAD, false)).toBeCloseTo(90 * DEG_TO_RAD, 5);
      // 94° -> 90°
      expect(snapDoorRotation(94 * DEG_TO_RAD, false)).toBeCloseTo(90 * DEG_TO_RAD, 5);
      // 182° -> 180°
      expect(snapDoorRotation(182 * DEG_TO_RAD, false)).toBeCloseTo(180 * DEG_TO_RAD, 5);
      // 268° -> 270°
      expect(snapDoorRotation(268 * DEG_TO_RAD, false)).toBeCloseTo(270 * DEG_TO_RAD, 5);
    });

    it('no imanta si está fuera de ±5°', () => {
      // 12° se queda en 12°
      expect(snapDoorRotation(12 * DEG_TO_RAD, false)).toBeCloseTo(12 * DEG_TO_RAD, 5);
      // 45° se queda en 45°
      expect(snapDoorRotation(45 * DEG_TO_RAD, false)).toBeCloseTo(45 * DEG_TO_RAD, 5);
      // 80° se queda en 80°
      expect(snapDoorRotation(80 * DEG_TO_RAD, false)).toBeCloseTo(80 * DEG_TO_RAD, 5);
    });

    it('con Shift fuerza pasos de 15°', () => {
      // 7° -> 0°, 8° -> 15°
      expect(snapDoorRotation(7 * DEG_TO_RAD, true)).toBeCloseTo(0, 5);
      expect(snapDoorRotation(8 * DEG_TO_RAD, true)).toBeCloseTo(15 * DEG_TO_RAD, 5);
      // 38° -> 45° (3 * 15°)
      expect(snapDoorRotation(38 * DEG_TO_RAD, true)).toBeCloseTo(45 * DEG_TO_RAD, 5);
    });
  });

  describe('snapDoorMovement y snapDoorLength', () => {
    // Pared de prueba de (0, 0) a (100, 0)
    const wallEntity: Entity = {
      id: 'wall-1',
      type: 'wall',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 1,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    };

    // Puerta con largo 70 (halfL = 35) colocada con centro cerca de x=135, y=0
    // p1 = center - 35 = (98, 2) cerca del extremo (100, 0) de la pared
    const doorEntity: Entity = {
      id: 'door-1',
      type: 'door',
      x: 133,
      y: 2,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 2,
      door: {
        isOpen: false,
        isLocked: false,
        length: 70,
        p1: { x: 98, y: 2 },
        p2: { x: 168, y: 2 }
      }
    };

    it('findNearbyWallEndpoint detecta extremo de pared a menos del umbral', () => {
      const pt = findNearbyWallEndpoint({ x: 98, y: 2 }, [wallEntity], 'door-1', 10);
      expect(pt).toEqual({ x: 100, y: 0 });
    });

    it('snapDoorMovement imanta la bisagra si está a menos de 10 px en pantalla', () => {
      // Cámara con zoom 1 => maxDistWorld = 10
      // Al arrastrar a (133, 2), p1 está en (98, 2), a distancia ~2.82 px de (100, 0).
      // Debe ajustarse a x=135, y=0 para que p1 quede en (100, 0).
      const snapped = snapDoorMovement(doorEntity, 133, 2, [wallEntity, doorEntity], 1, false);
      expect(snapped.x).toBe(135);
      expect(snapped.y).toBe(0);
    });

    it('snapDoorMovement con Alt ignora el imán', () => {
      const snapped = snapDoorMovement(doorEntity, 133, 2, [wallEntity, doorEntity], 1, true);
      expect(snapped.x).toBe(133);
      expect(snapped.y).toBe(2);
    });

    it('snapDoorLength imanta los extremos a las paredes', () => {
      // Puerta centrada en el hueco (50, 0) con rotación 0
      // Pared 1 termina en (0, 0) y pared 2 empieza en (100, 0)
      const wallEntity2: Entity = {
        id: 'wall-2',
        type: 'wall',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 1,
        points: [{ x: 100, y: 0 }, { x: 200, y: 0 }]
      };

      const d: Entity = {
        ...doorEntity,
        x: 50,
        y: 0,
        rotation: 0
      };

      // Si el largo arrastrado es 97 (p1 = 1.5, p2 = 98.5), ambos extremos están a < 10 px de (0,0) y (100,0)
      const snappedLen = snapDoorLength(d, 97, [wallEntity, wallEntity2, d], 1, false);
      expect(snappedLen).toBeCloseTo(100, 1);

      // Con Alt, no imanta y devuelve la rawLength
      const altLen = snapDoorLength(d, 97, [wallEntity, wallEntity2, d], 1, true);
      expect(altLen).toBe(97);
    });
  });
});
