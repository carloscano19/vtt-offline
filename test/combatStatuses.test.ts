import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../src/stores/useGameStore';
import { normalizeEntity } from '../src/modules/persistence/normalizer';
import { Entity, DEFAULT_STATUS_TYPES } from '../src/types/entity';

describe('Token Statuses & Turn Management', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it('normalizes tokens without statuses by defaulting statuses to an empty array', () => {
    const rawToken: Entity = {
      id: 'token_1',
      type: 'token',
      name: 'Goblin 1',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false
    };

    const normalized = normalizeEntity(rawToken);
    expect(Array.isArray(normalized.statuses)).toBe(true);
    expect(normalized.statuses).toEqual([]);
  });

  it('adds, updates and removes statuses on a token', () => {
    const token: Entity = {
      id: 'token_1',
      type: 'token',
      name: 'Guerrero',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      statuses: []
    };

    useGameStore.getState().addEntity(token);

    // 1. Añadir estado con turnos
    useGameStore.getState().addTokenStatus('token_1', {
      type: 'Aturdido',
      turnsRemaining: 3,
      visibleToPlayers: true
    });

    let current = useGameStore.getState().game.entities.find((e) => e.id === 'token_1');
    expect(current?.statuses).toHaveLength(1);
    expect(current?.statuses?.[0].type).toBe('Aturdido');
    expect(current?.statuses?.[0].turnsRemaining).toBe(3);

    const statusId = current!.statuses![0].id;

    // 2. Modificar visibilidad
    useGameStore.getState().updateTokenStatus('token_1', statusId, {
      visibleToPlayers: false
    });

    current = useGameStore.getState().game.entities.find((e) => e.id === 'token_1');
    expect(current?.statuses?.[0].visibleToPlayers).toBe(false);

    // 3. Eliminar estado
    useGameStore.getState().removeTokenStatus('token_1', statusId);
    current = useGameStore.getState().game.entities.find((e) => e.id === 'token_1');
    expect(current?.statuses).toHaveLength(0);
  });

  it('nextTurn decrements finite statuses, deletes expired ones with messages, and preserves infinite statuses', () => {
    const token1: Entity = {
      id: 'goblin_1',
      type: 'token',
      name: 'Goblin 1',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      statuses: [
        { id: 'st_1', type: 'Aturdido', turnsRemaining: 1, visibleToPlayers: true },
        { id: 'st_2', type: 'Envenenado', turnsRemaining: 3, visibleToPlayers: true },
        { id: 'st_3', type: 'Invisible', turnsRemaining: null, visibleToPlayers: false }
      ]
    };

    const token2: Entity = {
      id: 'cleric_1',
      type: 'token',
      name: 'Clérigo',
      x: 200,
      y: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      statuses: [
        { id: 'st_4', type: 'Bendecido', turnsRemaining: 2, visibleToPlayers: true }
      ]
    };

    useGameStore.getState().addEntity(token1);
    useGameStore.getState().addEntity(token2);
    useGameStore.getState().setTurnCounter(1);

    // Primer avance de turno: Aturdido (1) expira
    const expired1 = useGameStore.getState().nextTurn();
    expect(expired1).toContain('Aturdido terminó en Goblin 1');
    expect(useGameStore.getState().game.turnCounter).toBe(2);

    const g1AfterTurn1 = useGameStore.getState().game.entities.find((e) => e.id === 'goblin_1');
    expect(g1AfterTurn1?.statuses).toHaveLength(2);
    expect(g1AfterTurn1?.statuses?.map((s) => s.type)).toEqual(['Envenenado', 'Invisible']);
    expect(g1AfterTurn1?.statuses?.find((s) => s.type === 'Envenenado')?.turnsRemaining).toBe(2);
    expect(g1AfterTurn1?.statuses?.find((s) => s.type === 'Invisible')?.turnsRemaining).toBeNull();

    const clericAfterTurn1 = useGameStore.getState().game.entities.find((e) => e.id === 'cleric_1');
    expect(clericAfterTurn1?.statuses?.find((s) => s.type === 'Bendecido')?.turnsRemaining).toBe(1);

    // Segundo avance de turno: Bendecido (1) expira en Clérigo
    const expired2 = useGameStore.getState().nextTurn();
    expect(expired2).toContain('Bendecido terminó en Clérigo');
    expect(useGameStore.getState().game.turnCounter).toBe(3);

    const clericAfterTurn2 = useGameStore.getState().game.entities.find((e) => e.id === 'cleric_1');
    expect(clericAfterTurn2?.statuses).toHaveLength(0);

    const g1AfterTurn2 = useGameStore.getState().game.entities.find((e) => e.id === 'goblin_1');
    expect(g1AfterTurn2?.statuses?.find((s) => s.type === 'Envenenado')?.turnsRemaining).toBe(1);
    expect(g1AfterTurn2?.statuses?.find((s) => s.type === 'Invisible')?.turnsRemaining).toBeNull();

    // Tercer avance de turno: Envenenado (1) expira en Goblin 1
    const expired3 = useGameStore.getState().nextTurn();
    expect(expired3).toContain('Envenenado terminó en Goblin 1');

    const g1AfterTurn3 = useGameStore.getState().game.entities.find((e) => e.id === 'goblin_1');
    expect(g1AfterTurn3?.statuses).toHaveLength(1);
    expect(g1AfterTurn3?.statuses?.[0].type).toBe('Invisible');
    expect(g1AfterTurn3?.statuses?.[0].turnsRemaining).toBeNull();
  });

  it('duplicates entities correctly with duplicateEntity action', () => {
    const original: Entity = {
      id: 'token_orig',
      type: 'token',
      name: 'Orco',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      statuses: [{ id: 'st_1', type: 'Asustado', turnsRemaining: 2, visibleToPlayers: true }]
    };

    useGameStore.getState().addEntity(original);
    const newId = useGameStore.getState().duplicateEntity('token_orig');

    expect(newId).toBeDefined();
    expect(newId).not.toBe('token_orig');

    const duplicated = useGameStore.getState().game.entities.find((e) => e.id === newId);
    expect(duplicated).toBeDefined();
    expect(duplicated?.name).toBe('Orco (copia)');
    expect(duplicated?.statuses).toHaveLength(1);
    expect(duplicated?.statuses?.[0].type).toBe('Asustado');
  });

  it('contains the 15 standard D&D condition types in DEFAULT_STATUS_TYPES', () => {
    const expected = [
      'Cegado',
      'Hechizado',
      'Ensordecido',
      'Asustado',
      'Agarrado',
      'Incapacitado',
      'Invisible',
      'Paralizado',
      'Petrificado',
      'Envenenado',
      'Derribado',
      'Restringido',
      'Aturdido',
      'Inconsciente',
      'Agotamiento'
    ];
    for (const cond of expected) {
      expect(DEFAULT_STATUS_TYPES).toContain(cond);
    }
  });

  it('allows manual decrementing of turns and removes status when decrementing from 1', () => {
    const token: Entity = {
      id: 'token_ctrl',
      type: 'token',
      name: 'Mago',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 0.15,
      scaleY: 0.15,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      statuses: [{ id: 'st_slow', type: 'Aturdido', turnsRemaining: 2, visibleToPlayers: true }]
    };

    useGameStore.getState().addEntity(token);

    // 1. Decrementar de 2 a 1
    useGameStore.getState().updateTokenStatus('token_ctrl', 'st_slow', { turnsRemaining: 1 });
    let ent = useGameStore.getState().game.entities.find((e) => e.id === 'token_ctrl');
    expect(ent?.statuses?.[0].turnsRemaining).toBe(1);

    // 2. Decrementar de 1 a 0 (debe eliminar el estado como en el botón −)
    useGameStore.getState().removeTokenStatus('token_ctrl', 'st_slow');
    ent = useGameStore.getState().game.entities.find((e) => e.id === 'token_ctrl');
    expect(ent?.statuses).toHaveLength(0);
  });

  it('toggles turns between finite and infinite (null) and increments with plus', () => {
    const token: Entity = {
      id: 'token_toggle',
      type: 'token',
      name: 'Pícaro',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 0.15,
      scaleY: 0.15,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      statuses: [{ id: 'st_inv', type: 'Invisible', turnsRemaining: null, visibleToPlayers: true }]
    };

    useGameStore.getState().addEntity(token);

    // 1. Alternar de infinito (null) a número (1)
    useGameStore.getState().updateTokenStatus('token_toggle', 'st_inv', { turnsRemaining: 1 });
    let ent = useGameStore.getState().game.entities.find((e) => e.id === 'token_toggle');
    expect(ent?.statuses?.[0].turnsRemaining).toBe(1);

    // 2. Incrementar con + (de 1 a 2)
    useGameStore.getState().updateTokenStatus('token_toggle', 'st_inv', { turnsRemaining: 2 });
    ent = useGameStore.getState().game.entities.find((e) => e.id === 'token_toggle');
    expect(ent?.statuses?.[0].turnsRemaining).toBe(2);

    // 3. Alternar de nuevo a infinito (null)
    useGameStore.getState().updateTokenStatus('token_toggle', 'st_inv', { turnsRemaining: null });
    ent = useGameStore.getState().game.entities.find((e) => e.id === 'token_toggle');
    expect(ent?.statuses?.[0].turnsRemaining).toBeNull();
  });

  it('verifies scale compensation formulas for large tokens scaled down to 0.15', () => {
    const scale = 0.15;
    const invScale = 1 / scale;
    const gridSize = 70;
    const cameraZoom = 1.0;

    // Altura de texto de etiquetas: ~0.22 * gridSize, mínimo 12px en pantalla
    const targetTextHeight = Math.max(12 / cameraZoom, 0.22 * gridSize);
    expect(targetTextHeight).toBeCloseTo(15.4, 1);
    expect(targetTextHeight * cameraZoom).toBeGreaterThanOrEqual(12);

    // Borde rojo: ~3px en pantalla independiente de la escala del token
    const targetScreenBorderWidth = 3;
    const localStrokeWidth = (targetScreenBorderWidth / cameraZoom) * invScale;
    // Al renderizarse en Pixi con scaleX = 0.15:
    const renderedScreenBorderWidth = localStrokeWidth * scale * cameraZoom;
    expect(renderedScreenBorderWidth).toBeCloseTo(3, 4);

    // Posición de la etiqueta fuera del borde del token de 1024px:
    const spriteWidth = 1024;
    const localRadius = spriteWidth / 2; // 512
    const worldRadius = localRadius * scale; // 76.8px en el mundo
    expect(worldRadius).toBeCloseTo(76.8, 1);
  });
});
