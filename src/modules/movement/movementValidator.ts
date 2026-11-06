import { GameState } from '../../types/game';
import { Point2D } from '../../types/entity';
import { isMovementBlockedByWall } from '../walls/wallManager';

export interface MovementStepResult {
  success: boolean;
  reason?: string;
  newPos?: Point2D;
  remaining?: number;
  path?: Point2D[];
}

/**
 * Valida y calcula el resultado de dar un paso con flechas / teclado.
 * Regla D&D 5e: cada paso orthogonal o diagonal cuenta 1 casilla.
 */
export function validateStep(
  game: GameState,
  tokenId: string,
  dx: number,
  dy: number,
  playerName?: string
): MovementStepResult {
  // 1. Comprobar si la partida está en pausa por el máster
  if (game.remotePlayersFrozen) {
    return { success: false, reason: 'La partida está en pausa' };
  }

  // 2. Comprobar existencia del token
  const token = game.entities.find((e) => e.id === tokenId);
  if (!token || token.type !== 'token') {
    return { success: false, reason: 'Token no encontrado' };
  }

  // 3. Comprobar permisos del jugador remoto
  if (
    playerName &&
    token.controlledBy &&
    token.controlledBy.trim().toLowerCase() !== playerName.trim().toLowerCase()
  ) {
    return { success: false, reason: 'No tienes permiso para mover este token' };
  }

  // 4. Comprobar presupuesto de movimiento
  const budget = typeof token.movementBudget === 'number' ? token.movementBudget : 7;
  const currentRemaining = typeof token.movementState?.remaining === 'number'
    ? token.movementState.remaining
    : budget;

  if (currentRemaining <= 0) {
    return { success: false, reason: 'Sin casillas de movimiento restantes' };
  }

  // 5. Calcular posición de destino (1 casilla en dirección dx, dy)
  const gridSize = game.grid?.size && game.grid.size > 0 ? game.grid.size : 70;
  const targetPos: Point2D = {
    x: Math.round(token.x + dx * gridSize),
    y: Math.round(token.y + dy * gridSize)
  };

  // 6. Validación de paredes y puertas cerradas (reutiliza wallManager)
  const from: Point2D = { x: token.x, y: token.y };
  const blocked = isMovementBlockedByWall(from, targetPos, game.entities);
  if (blocked) {
    return { success: false, reason: 'Hay una pared' };
  }

  // 7. Construir nuevo camino verde y deducir 1 casilla
  const currentPath: Point2D[] = token.movementState?.path && token.movementState.path.length > 0
    ? [...token.movementState.path]
    : [{ x: token.x, y: token.y }];

  currentPath.push(targetPos);
  const remaining = currentRemaining - 1;

  return {
    success: true,
    newPos: targetPos,
    remaining,
    path: currentPath
  };
}

/**
 * Deshace el último paso dado por el token en este turno (tecla Retroceso / Backspace).
 * Restaura la posición anterior, recupera 1 casilla del presupuesto y recorta el camino verde.
 */
export function validateUndo(
  game: GameState,
  tokenId: string,
  playerName?: string
): MovementStepResult {
  if (game.remotePlayersFrozen) {
    return { success: false, reason: 'La partida está en pausa' };
  }

  const token = game.entities.find((e) => e.id === tokenId);
  if (!token || token.type !== 'token') {
    return { success: false, reason: 'Token no encontrado' };
  }

  if (
    playerName &&
    token.controlledBy &&
    token.controlledBy.trim().toLowerCase() !== playerName.trim().toLowerCase()
  ) {
    return { success: false, reason: 'No tienes permiso para mover este token' };
  }

  const path = token.movementState?.path;
  if (!path || path.length <= 1) {
    return { success: false, reason: 'No hay pasos para deshacer' };
  }

  // Extraer la posición previa recortando el último paso
  const newPath = path.slice(0, -1);
  const prevPos = newPath[newPath.length - 1];
  const budget = typeof token.movementBudget === 'number' ? token.movementBudget : 7;
  const currentRemaining = typeof token.movementState?.remaining === 'number'
    ? token.movementState.remaining
    : budget;
  const remaining = Math.min(budget, currentRemaining + 1);

  return {
    success: true,
    newPos: prevPos,
    remaining,
    path: newPath
  };
}
