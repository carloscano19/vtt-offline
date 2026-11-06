import { describe, it, expect, beforeEach } from 'vitest';
import { doorAnimationManager } from '../src/modules/doors/doorAnimationManager';
import { getAllWallSegments } from '../src/modules/walls/wallManager';
import { normalizeEntity } from '../src/modules/persistence/normalizer';
import { Entity } from '../src/types/entity';

describe('Bloque 5: Puertas animadas', () => {
  beforeEach(() => {
    doorAnimationManager.reset();
  });

  it('doorAnimationManager abre fluidamente en 0.5s y solo está completamente abierta al terminar', () => {
    const doorId = 'test-door-1';

    // Inicialmente cerrada
    expect(doorAnimationManager.getProgress(doorId, false)).toBe(0.0);
    expect(doorAnimationManager.isFullyOpen(doorId, false)).toBe(false);

    // Comienza a abrirse: a los 0.25s (mitad del tiempo)
    const p1 = doorAnimationManager.update(doorId, true, 0.25);
    expect(p1).toBeCloseTo(0.5, 2);
    // Mientras se abre, no está completamente abierta (visión bloqueada)
    expect(doorAnimationManager.isFullyOpen(doorId, true)).toBe(false);

    // Completa la apertura a los 0.5s
    const p2 = doorAnimationManager.update(doorId, true, 0.25);
    expect(p2).toBe(1.0);
    expect(doorAnimationManager.isFullyOpen(doorId, true)).toBe(true);

    // Al comenzar a cerrarse, se bloquea la visión inmediatamente
    doorAnimationManager.update(doorId, false, 0.05);
    expect(doorAnimationManager.isFullyOpen(doorId, false)).toBe(false);
  });

  it('getAllWallSegments bloquea la visión mientras la puerta se abre y solo la libera al completarse', () => {
    const doorEntity: Entity = {
      id: 'door-wall-test',
      type: 'door',
      name: 'Puerta Cripta',
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      visibleToPlayers: true,
      locked: false,
      door: {
        isOpen: false,
        isLocked: false,
        p1: { x: 0, y: 0 },
        p2: { x: 70, y: 0 },
        length: 70,
        type: 'revolving'
      }
    };

    // 1. Cerrada: pared presente
    let segments = getAllWallSegments([doorEntity]);
    expect(segments.some((s) => s.entityId === doorEntity.id)).toBe(true);

    // 2. Abriendo (t = 0.2s): aún no completada, pared debe seguir presente
    doorEntity.door!.isOpen = true;
    doorAnimationManager.update(doorEntity.id, true, 0.2);
    segments = getAllWallSegments([doorEntity]);
    expect(segments.some((s) => s.entityId === doorEntity.id)).toBe(true);

    // 3. Completamente abierta (t = 0.5s): pared desaparece, visión atraviesa
    doorAnimationManager.update(doorEntity.id, true, 0.35);
    segments = getAllWallSegments([doorEntity]);
    expect(segments.some((s) => s.entityId === doorEntity.id)).toBe(false);

    // 4. Se cierra: inmediatamente la pared vuelve a bloquear
    doorEntity.door!.isOpen = false;
    segments = getAllWallSegments([doorEntity]);
    expect(segments.some((s) => s.entityId === doorEntity.id)).toBe(true);
  });

  it('Normalizador preserva y asigna valores por defecto a DoorType y SlidingMaterial', () => {
    const baseDoor: Entity = {
      id: 'd-norm',
      type: 'door',
      name: 'Puerta Deslizante',
      x: 50,
      y: 50,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      visibleToPlayers: true,
      locked: false,
      door: {
        isOpen: false,
        isLocked: false,
        p1: { x: 0, y: 0 },
        p2: { x: 70, y: 0 },
        type: 'sliding',
        slidingMaterial: 'bars'
      }
    };

    const norm = normalizeEntity(baseDoor);
    expect(norm.door?.type).toBe('sliding');
    expect(norm.door?.slidingMaterial).toBe('bars');

    const defaultDoor = normalizeEntity({
      ...baseDoor,
      door: {
        ...baseDoor.door!,
        type: undefined as any,
        slidingMaterial: undefined as any
      }
    });
    expect(defaultDoor.door?.type).toBe('normal');
    expect(defaultDoor.door?.slidingMaterial).toBe('wood');
  });
});
