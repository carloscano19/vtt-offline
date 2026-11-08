import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Entity } from '../src/types/entity';
import { getAllWallSegments } from '../src/modules/walls/wallManager';
import { crossTrapManager } from '../src/modules/traps/crossTrapManager';
import { useGameStore } from '../src/stores/useGameStore';
import { useUIStore } from '../src/stores/useUIStore';
import { diceManager } from '../src/modules/dice/diceManager';

describe('Puerta giratoria en X (trampa de cruce) - Bloque 5', () => {
  beforeEach(() => {
    // Reset stores
    useGameStore.setState({
      game: {
        id: 'test-game',
        name: 'Partida Test',
        entities: [],
        masterCamera: { x: 0, y: 0, zoom: 1 },
        tvCamera: { x: 0, y: 0, zoom: 1, isLocked: false },
        grid: { size: 70, snapToGrid: true, showGrid: true, color: '#ffffff', opacity: 0.2 },
        ambientLight: { enabled: false, color: '#ffffff', intensity: 1.0 },
        version: 1,
        turnCounter: 1
      } as any
    });
    useUIStore.setState({
      toasts: []
    });
  });

  it('genera 4 segmentos de pared perpendiculares en getAllWallSegments', () => {
    const crossTrap: Entity = {
      id: 'cross_1',
      type: 'effect',
      name: 'Cruz giratoria',
      x: 140,
      y: 140,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 25,
      effect: {
        preset: 'cross_revolving_door',
        category: 'traps',
        color: '#78350f',
        intensity: 100,
        speed: 1.0,
        emitsLight: false,
        baseLightRadius: 0,
        trapMaterial: 'wood',
        trapGridSize: 3, // 3x3 casillas => armLength = 1.5 * 70 = 105 px
        launchDistance: 2
      }
    };

    const segments = getAllWallSegments([crossTrap]);
    expect(segments.length).toBe(4);

    // Todos parten del centro (140, 140)
    for (const seg of segments) {
      expect(seg.p1).toEqual({ x: 140, y: 140 });
      expect(seg.source).toBe('door');
      expect(seg.entityId).toBe('cross_1');
    }

    // Los extremos de los 4 brazos a distancia 105 px a 0°, 90°, 180°, 270°
    const tips = segments.map((s) => s.p2);
    // Brazo 0 (0 rad -> +X): (140 + 105, 140) = (245, 140)
    expect(tips.some((t) => Math.abs(t.x - 245) < 0.1 && Math.abs(t.y - 140) < 0.1)).toBe(true);
    // Brazo 1 (PI/2 rad -> +Y): (140, 140 + 105) = (140, 245)
    expect(tips.some((t) => Math.abs(t.x - 140) < 0.1 && Math.abs(t.y - 245) < 0.1)).toBe(true);
    // Brazo 2 (PI rad -> -X): (140 - 105, 140) = (35, 140)
    expect(tips.some((t) => Math.abs(t.x - 35) < 0.1 && Math.abs(t.y - 140) < 0.1)).toBe(true);
    // Brazo 3 (3PI/2 rad -> -Y): (140, 140 - 105) = (140, 35)
    expect(tips.some((t) => Math.abs(t.x - 140) < 0.1 && Math.abs(t.y - 35) < 0.1)).toBe(true);
  });

  it('activa la trampa con 1d4, expulsa el token sin consumir su movimiento y permite deshacer', () => {
    // Cruz centrada en (140, 140), tamaño 3x3 (radio ~105)
    const crossTrap: Entity = {
      id: 'cross_trap_act',
      type: 'effect',
      name: 'Molinete',
      x: 140,
      y: 140,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      effect: {
        preset: 'cross_revolving_door',
        category: 'traps',
        color: '#78350f',
        intensity: 100,
        speed: 1.0,
        emitsLight: false,
        baseLightRadius: 0,
        trapMaterial: 'wood',
        trapGridSize: 3,
        launchDistance: 2
      }
    };

    // Token en el centro del cruce controlado por jugador remoto
    const heroToken: Entity = {
      id: 'hero_1',
      type: 'token',
      name: 'Héroe',
      x: 140,
      y: 140,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      controlledBy: 'jugador_remoto_1',
      movementBudget: 6,
      movementState: {
        remaining: 6,
        budget: 6
      }
    };

    useGameStore.setState({
      game: {
        ...useGameStore.getState().game,
        entities: [crossTrap, heroToken]
      }
    });

    // Mockeamos la tirada para que salga un 2 (Este)
    vi.spyOn(diceManager, 'executeMasterRoll').mockReturnValue({
      id: 'test_roll_1',
      rollerName: 'Trampa de Cruce',
      isSecret: false,
      formula: 'Trampa de Cruce: 1d4 = 2',
      dieType: 'd4',
      dicePool: [{ dieType: 'd4', count: 1 }],
      dice: [{ dieType: 'd4', sides: 4, value: 2, displayValue: '2' }],
      modifier: 0,
      total: 2,
      advantage: 'none',
      timestamp: Date.now()
    });

    // Disparar trampa
    crossTrapManager.trigger('cross_trap_act');

    const updatedHero = useGameStore.getState().game.entities.find((e) => e.id === 'hero_1')!;
    // El token debe haber sido expulsado hacia el Este (+X)
    expect(updatedHero.x).toBeGreaterThan(140 + 105);
    // Su presupuesto y movimiento restante NO DEBEN HABERSE TOCADO
    expect(updatedHero.movementState?.remaining).toBe(6);
    expect(updatedHero.movementBudget).toBe(6);

    // Debe existir un toast con acción para deshacer
    const toasts = useUIStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    const toast = toasts[0];
    expect(toast.message).toContain('d4 = 2');
    expect(toast.message).toContain('Este');
    expect(toast.action).toBeDefined();
    expect(toast.action?.label).toBe('Deshacer lanzamiento');

    // Deshacer lanzamiento
    crossTrapManager.undoLaunch('cross_trap_act');

    const restoredHero = useGameStore.getState().game.entities.find((e) => e.id === 'hero_1')!;
    expect(restoredHero.x).toBe(140);
    expect(restoredHero.y).toBe(140);
  });
});
