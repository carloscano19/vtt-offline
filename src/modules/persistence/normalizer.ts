import { Entity } from '../../types/entity';
import { GameState } from '../../types/game';

/**
 * Normaliza una entidad individual.
 * Todo token sin campo vision recibe:
 * vision = { active: side === 'jugador', rangeInSquares: 12, hardness: 0.5 }
 */
export function normalizeEntity(entity: Entity): Entity {
  if (entity.type === 'token') {
    const side = entity.side || 'jugador';
    if (!entity.vision) {
      return {
        ...entity,
        side,
        vision: {
          active: side === 'jugador',
          rangeInSquares: 12,
          hardness: 0.5
        }
      };
    }
  }
  return entity;
}

/**
 * Normaliza el estado completo de una partida al cargar o importar.
 * - Asegura que fog tenga enabled y explored válidos.
 * - Normaliza todas las entidades (tokens sin vision reciben vision adecuada).
 */
export function normalizeGameState(game: GameState): GameState {
  return {
    ...game,
    fog: {
      enabled: game.fog?.enabled ?? true,
      explored: game.fog?.explored ?? []
    },
    entities: (game.entities || []).map(normalizeEntity)
  };
}
