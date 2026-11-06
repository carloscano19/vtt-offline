import { describe, it, expect, beforeEach } from 'vitest';
import { validateStep, validateUndo } from '../src/modules/movement/movementValidator';
import { GameState } from '../src/types/game';
import { Entity } from '../src/types/entity';
import { useGameStore } from '../src/stores/useGameStore';
import { MovementPathLayer } from '../src/pixi/layers/MovementPathLayer';
import { normalizeEntity, normalizeGameState } from '../src/modules/persistence/normalizer';

function createMockGame(): GameState {
  const token: Entity = {
    id: 'token_player_1',
    name: 'Valeros',
    type: 'token',
    side: 'jugador',
    x: 105,
    y: 105,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visibleToPlayers: true,
    controlledBy: 'Carlos',
    movementBudget: 7,
    movementState: {
      remaining: 7,
      path: []
    }
  };

  // Pared horizontal situada entre y=140 y se extiende de x=0 a x=300
  const wall: Entity = {
    id: 'wall_1',
    type: 'wall',
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    points: [
      { x: 0, y: 140 },
      { x: 300, y: 140 }
    ],
    closed: false
  };

  return {
    id: 'game_test_1',
    name: 'Partida Test',
    turnCounter: 1,
    grid: {
      size: 70,
      color: '#ffffff',
      opacity: 0.25,
      visible: true,
      snapToGrid: true,
      wallsBlockMovement: true
    },
    entities: [token, wall],
    masterCamera: { x: 0, y: 0, zoom: 1 },
    playerCamera: { x: 0, y: 0, zoom: 1 },
    followMasterCamera: false,
    fog: {
      enabled: true,
      rememberExplored: false,
      explored: [],
      revealed: []
    },
    ambient: { preset: 'dusk', color: '#c84224', intensity: 60 },
    weather: {
      rain: { enabled: false, intensity: 50, direction: 90 },
      snow: { enabled: false, intensity: 50 },
      wind: { enabled: false, intensity: 50, direction: 0 }
    },
    combat: { active: false, order: [], currentTurnIndex: 0, round: 1 },
    music: { playlist: [], currentTrackId: null, isPlaying: false, volume: 0.8, loopTrack: false },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    remotePlayersFrozen: false
  };
}

describe('Bloque 3: Movimiento limitado por casillas, paredes, camino verde y pausa', () => {
  let game: GameState;

  beforeEach(() => {
    game = createMockGame();
  });

  it('permite mover 1 casilla orthogonal deduciendo 1 del presupuesto y registrando el camino', () => {
    // Mover hacia la derecha (dx = 1, dy = 0)
    const result = validateStep(game, 'token_player_1', 1, 0, 'Carlos');
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(6);
    expect(result.newPos).toEqual({ x: 175, y: 105 });
    expect(result.path?.length).toBe(2);
    expect(result.path?.[0]).toEqual({ x: 105, y: 105 });
    expect(result.path?.[1]).toEqual({ x: 175, y: 105 });
  });

  it('aplica la regla D&D 5e para diagonales: 1 paso diagonal consume exactamente 1 casilla', () => {
    // Mover diagonal arriba-derecha (dx = 1, dy = -1)
    const result = validateStep(game, 'token_player_1', 1, -1, 'Carlos');
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(6);
    expect(result.newPos).toEqual({ x: 175, y: 35 });
  });

  it('bloquea el paso si se cruza una pared o puerta cerrada', () => {
    // La pared horizontal está en y=140. Mover hacia abajo cruzaría de y=105 a y=175
    const result = validateStep(game, 'token_player_1', 0, 1, 'Carlos');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('Hay una pared');
  });

  it('permite el paso por una puerta abierta pero bloquea si está cerrada', () => {
    // Añadir una puerta cerrada
    const door: Entity = {
      id: 'door_1',
      type: 'door',
      x: 105,
      y: 70,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      door: {
        p1: { x: 70, y: 70 },
        p2: { x: 140, y: 70 },
        isOpen: false,
        isLocked: false
      }
    };
    game.entities.push(door);

    // Intentar cruzar la puerta hacia arriba (y: 105 -> 35 cruzando y=70)
    const blockedResult = validateStep(game, 'token_player_1', 0, -1, 'Carlos');
    expect(blockedResult.success).toBe(false);
    expect(blockedResult.reason).toBe('Hay una pared');

    // Abrir la puerta
    door.door!.isOpen = true;
    const openResult = validateStep(game, 'token_player_1', 0, -1, 'Carlos');
    expect(openResult.success).toBe(true);
    expect(openResult.newPos?.y).toBe(35);
  });

  it('agota el presupuesto de movimiento y rechaza pasos posteriores cuando remaining llega a 0', () => {
    const token = game.entities.find((e) => e.id === 'token_player_1')!;
    token.movementState = {
      remaining: 1,
      path: [{ x: 105, y: 105 }]
    };

    // Dar el último paso restante
    const step1 = validateStep(game, 'token_player_1', 1, 0, 'Carlos');
    expect(step1.success).toBe(true);
    expect(step1.remaining).toBe(0);

    // Actualizar estado del token simulando el guardado del máster
    token.movementState = {
      remaining: step1.remaining!,
      path: step1.path!
    };
    token.x = step1.newPos!.x;
    token.y = step1.newPos!.y;

    // Intentar dar otro paso con 0 casillas restantes
    const step2 = validateStep(game, 'token_player_1', 1, 0, 'Carlos');
    expect(step2.success).toBe(false);
    expect(step2.reason).toBe('Sin casillas de movimiento restantes');
  });

  it('permite deshacer con Retroceso (Backspace) restaurando la posición y sumando 1 casilla', () => {
    const token = game.entities.find((e) => e.id === 'token_player_1')!;
    token.x = 175;
    token.y = 105;
    token.movementState = {
      remaining: 5,
      path: [
        { x: 35, y: 105 },
        { x: 105, y: 105 },
        { x: 175, y: 105 }
      ]
    };

    const undoResult = validateUndo(game, 'token_player_1', 'Carlos');
    expect(undoResult.success).toBe(true);
    expect(undoResult.newPos).toEqual({ x: 105, y: 105 });
    expect(undoResult.remaining).toBe(6);
    expect(undoResult.path?.length).toBe(2);
    expect(undoResult.path?.[undoResult.path.length - 1]).toEqual({ x: 105, y: 105 });
  });

  it('rechaza deshacer si no hay pasos en el historial del turno actual', () => {
    const token = game.entities.find((e) => e.id === 'token_player_1')!;
    token.movementState = {
      remaining: 7,
      path: [{ x: 105, y: 105 }]
    };

    const undoResult = validateUndo(game, 'token_player_1', 'Carlos');
    expect(undoResult.success).toBe(false);
    expect(undoResult.reason).toBe('No hay pasos para deshacer');
  });

  it('rechaza movimiento si la partida está en pausa por el máster', () => {
    game.remotePlayersFrozen = true;
    const result = validateStep(game, 'token_player_1', 1, 0, 'Carlos');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('La partida está en pausa');

    const undo = validateUndo(game, 'token_player_1', 'Carlos');
    expect(undo.success).toBe(false);
    expect(undo.reason).toBe('La partida está en pausa');
  });

  it('nextTurn() recarga el presupuesto de casillas y borra los caminos verdes de todos los tokens', () => {
    useGameStore.setState({
      game: {
        ...game,
        turnCounter: 3,
        entities: [
          {
            ...game.entities[0],
            movementState: {
              remaining: 2,
              path: [{ x: 0, y: 0 }, { x: 70, y: 0 }]
            }
          }
        ]
      }
    });

    const expired = useGameStore.getState().nextTurn();
    const updatedGame = useGameStore.getState().game;

    expect(updatedGame.turnCounter).toBe(4);
    const updatedToken = updatedGame.entities.find((e) => e.id === 'token_player_1')!;
    expect(updatedToken.movementState?.remaining).toBe(7);
    expect(updatedToken.movementState?.path).toEqual([]);
  });

  it('sin sala abierta ni controlledBy, no se dibuja ninguna píldora ni camino verde', () => {
    const layer = new MovementPathLayer(true);

    const tokenWithoutControl: Entity = {
      id: 'token_npc_1',
      type: 'token',
      name: 'Goblin',
      x: 200,
      y: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visibleToPlayers: true
    };

    const tokenWithControl: Entity = {
      id: 'token_hero_1',
      type: 'token',
      name: 'Carlos Hero',
      x: 300,
      y: 300,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visibleToPlayers: true,
      controlledBy: 'Carlos',
      movementBudget: 7,
      movementState: {
        remaining: 5,
        path: [{ x: 300, y: 300 }, { x: 370, y: 300 }]
      }
    };

    const entities = [tokenWithoutControl, tokenWithControl];

    // Caso 1: Sin sala abierta (isRoomOpen = false)
    layer.update(entities, 70, 1.0, false);
    // Comprobar que en badgePool no hay badges visibles y el contenedor de badges no tiene elementos visibles
    const badgesContainer = (layer as any).badgesContainer;
    const visibleBadges = badgesContainer.children.filter((child: any) => child.visible === true);
    expect(visibleBadges.length).toBe(0);

    // Caso 2: Con sala abierta (isRoomOpen = true), solo el token con controlledBy muestra píldora
    layer.update(entities, 70, 1.0, true);
    const visibleBadgesWithRoom = badgesContainer.children.filter((child: any) => child.visible === true);
    expect(visibleBadgesWithRoom.length).toBe(1);

    // Caso 3: Si se quita controlledBy al token mientras hay sala abierta, tampoco se muestra
    const tokenNowWithoutControl = { ...tokenWithControl, controlledBy: undefined };
    layer.update([tokenWithoutControl, tokenNowWithoutControl], 70, 1.0, true);
    const visibleBadgesNoControl = badgesContainer.children.filter((child: any) => child.visible === true);
    expect(visibleBadgesNoControl.length).toBe(0);
  });

  it('el normalizador no asigna movementBudget ni movementState por defecto a tokens sin controlledBy y los limpia si existen', () => {
    // Token sin controlledBy pero con movementBudget/movementState heredados de partida antigua
    const rawLegacyToken: Entity = {
      id: 'token_legacy',
      type: 'token',
      name: 'Orco',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      movementBudget: 7,
      movementState: { remaining: 7, path: [] }
    };

    const normalizedLegacy = normalizeEntity(rawLegacyToken);
    expect(normalizedLegacy.controlledBy).toBeUndefined();
    expect(normalizedLegacy.movementBudget).toBeUndefined();
    expect(normalizedLegacy.movementState).toBeUndefined();

    // Token con controlledBy asignado: sí recibe presupuesto y estado normalizados
    const controlledToken: Entity = {
      id: 'token_player',
      type: 'token',
      name: 'Mago',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      controlledBy: 'Zeyr'
    };

    const normalizedControlled = normalizeEntity(controlledToken);
    expect(normalizedControlled.controlledBy).toBe('Zeyr');
    expect(normalizedControlled.movementBudget).toBe(7);
    expect(normalizedControlled.movementState?.remaining).toBe(7);
    expect(normalizedControlled.movementState?.path).toEqual([]);
  });
});
