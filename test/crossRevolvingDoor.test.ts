import { describe, it, expect, beforeEach } from 'vitest';
import { Entity } from '../src/types/entity';
import { getAllWallSegments } from '../src/modules/walls/wallManager';
import { crossTrapManager, getCrossTrapAngle, getGenericRotationAngle } from '../src/modules/traps/crossTrapManager';
import { useGameStore } from '../src/stores/useGameStore';

describe('Puerta giratoria en X (rotación continua y sincronización compartida)', () => {
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
      visibleToPlayers: true,
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
        crossSpeed: 6,
        crossDirection: 'cw',
        crossPaused: true // En pausa a 0 rad
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

  it('gira de forma continua calculando el ángulo a partir de una hora de inicio compartida (sincronizada para máster, tele y remoto)', () => {
    const startTime = 1000000;
    const crossTrap: Entity = {
      id: 'cross_sync',
      type: 'effect',
      name: 'Cruz sincronizada',
      x: 200,
      y: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 25,
      visibleToPlayers: true,
      effect: {
        preset: 'cross_revolving_door',
        category: 'traps',
        color: '#78350f',
        intensity: 100,
        speed: 1.0,
        emitsLight: false,
        baseLightRadius: 0,
        crossSpeed: 6, // 6 segundos por vuelta
        crossDirection: 'cw',
        crossPaused: false,
        crossStartTime: startTime
      }
    };

    // Al inicio (t = startTime): ángulo = 0 rad
    const angleAtStart = getCrossTrapAngle(crossTrap, startTime);
    expect(angleAtStart).toBeCloseTo(0, 4);

    // A los 1.5 segundos (1/4 de vuelta = 90° = PI/2 rad en sentido horario)
    const angleAtQuarter = getCrossTrapAngle(crossTrap, startTime + 1500);
    expect(angleAtQuarter).toBeCloseTo(Math.PI / 2, 4);

    // A los 3.0 segundos (1/2 vuelta = 180° = PI rad)
    const angleAtHalf = getCrossTrapAngle(crossTrap, startTime + 3000);
    expect(angleAtHalf).toBeCloseTo(Math.PI, 4);

    // A los 6.0 segundos (vuelta completa = 360° = 2*PI rad)
    const angleAtFull = getCrossTrapAngle(crossTrap, startTime + 6000);
    expect(angleAtFull).toBeCloseTo(Math.PI * 2, 4);

    // En sentido antihorario (CCW): a 1.5s debe ser -PI/2
    const ccwCross: Entity = {
      ...crossTrap,
      effect: { ...crossTrap.effect!, crossDirection: 'ccw' }
    };
    const angleCCW = getCrossTrapAngle(ccwCross, startTime + 1500);
    expect(angleCCW).toBeCloseTo(-Math.PI / 2, 4);
  });

  it('pausar congela la cruz en su posición actual y reanudar continúa girando', () => {
    const startTime = 2000000;
    const crossTrap: Entity = {
      id: 'cross_pause_test',
      type: 'effect',
      name: 'Cruz Pausa',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 25,
      visibleToPlayers: true,
      effect: {
        preset: 'cross_revolving_door',
        category: 'traps',
        color: '#78350f',
        intensity: 100,
        speed: 1.0,
        emitsLight: false,
        baseLightRadius: 0,
        crossSpeed: 6,
        crossDirection: 'cw',
        crossPaused: false,
        crossStartTime: startTime
      }
    };

    useGameStore.setState({
      game: {
        ...useGameStore.getState().game,
        entities: [crossTrap]
      }
    });

    // 1. Pausar a los 1.5 segundos (debe quedar congelada a 90° = PI/2)
    const pauseTime = startTime + 1500;
    const expectedFrozenAngle = getCrossTrapAngle(crossTrap, pauseTime);
    expect(expectedFrozenAngle).toBeCloseTo(Math.PI / 2, 3);

    // Simulamos togglePause
    crossTrapManager.togglePause('cross_pause_test');

    const pausedEntity = useGameStore.getState().game.entities.find((e) => e.id === 'cross_pause_test')!;
    expect(pausedEntity.effect?.crossPaused).toBe(true);

    // Tras pausar, el ángulo en cualquier momento futuro debe seguir siendo el mismo (congelado)
    const angleDuringPause1 = getCrossTrapAngle(pausedEntity, pauseTime + 10000);
    const angleDuringPause2 = getCrossTrapAngle(pausedEntity, pauseTime + 50000);
    expect(angleDuringPause1).toBeCloseTo(pausedEntity.rotation, 4);
    expect(angleDuringPause2).toBeCloseTo(pausedEntity.rotation, 4);

    // 2. Reanudar la rotación
    crossTrapManager.togglePause('cross_pause_test');
    const resumedEntity = useGameStore.getState().game.entities.find((e) => e.id === 'cross_pause_test')!;
    expect(resumedEntity.effect?.crossPaused).toBe(false);
    expect(resumedEntity.effect?.crossStartTime).toBeDefined();

    // Inmediatamente al reanudar, su ángulo es su rotación congelada
    const angleAtResume = getCrossTrapAngle(resumedEntity, resumedEntity.effect!.crossStartTime!);
    expect(angleAtResume).toBeCloseTo(pausedEntity.rotation, 3);
  });

  it('los brazos como paredes giran con la cruz en getAllWallSegments y quedan fijos en pausa', () => {
    const startTime = 3000000;
    const crossTrap: Entity = {
      id: 'cross_walls',
      type: 'effect',
      name: 'Cruz Paredes',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 25,
      visibleToPlayers: true,
      effect: {
        preset: 'cross_revolving_door',
        category: 'traps',
        color: '#78350f',
        intensity: 100,
        speed: 1.0,
        emitsLight: false,
        baseLightRadius: 0,
        trapGridSize: 2, // armLength = 1.0 * 70 = 70 px
        crossSpeed: 6,
        crossDirection: 'cw',
        crossPaused: false,
        crossStartTime: startTime
      }
    };

    // A los 1.5 s la cruz ha rotado 90° (+Y)
    const segmentsAt1_5s = getAllWallSegments([crossTrap], startTime + 1500);
    expect(segmentsAt1_5s.length).toBe(4);

    // El brazo 0 que estaba en (100+70, 100) ahora está rotado 90° hacia (100, 100+70) = (100, 170)
    const tips = segmentsAt1_5s.map((s) => s.p2);
    expect(tips.some((t) => Math.abs(t.x - 100) < 0.1 && Math.abs(t.y - 170) < 0.1)).toBe(true);

    // En pausa: brazos congelados en rotación fija
    const pausedCross: Entity = {
      ...crossTrap,
      rotation: Math.PI / 4, // 45° fijo
      effect: { ...crossTrap.effect!, crossPaused: true }
    };
    const segmentsPaused1 = getAllWallSegments([pausedCross], startTime + 5000);
    const segmentsPaused2 = getAllWallSegments([pausedCross], startTime + 15000);

    expect(segmentsPaused1[0].p2).toEqual(segmentsPaused2[0].p2);
  });

  it('la "Rotación continua" genérica funciona en todas las trampas procedurales', () => {
    const startTime = 4000000;
    const sawBlade: Entity = {
      id: 'saw_trap',
      type: 'effect',
      name: 'Sierra con rotación continua',
      x: 150,
      y: 150,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 25,
      visibleToPlayers: true,
      effect: {
        preset: 'saw_blade',
        category: 'traps',
        color: '#e2e8f0',
        intensity: 100,
        speed: 1.0,
        emitsLight: false,
        baseLightRadius: 0
      },
      animations: {
        rotation: {
          enabled: true,
          speed: 0.5, // 0.5 vueltas por segundo (1 vuelta cada 2s)
          direction: 'cw',
          startTime
        }
      }
    };

    // A los 1.0 segundos (media vuelta = 180° = PI rad)
    const rotAfter1s = getGenericRotationAngle(sawBlade, startTime + 1000);
    expect(rotAfter1s).toBeCloseTo(Math.PI, 3);

    // A los 2.0 segundos (vuelta completa = 360° = 2*PI rad)
    const rotAfter2s = getGenericRotationAngle(sawBlade, startTime + 2000);
    expect(rotAfter2s).toBeCloseTo(Math.PI * 2, 3);
  });
});

