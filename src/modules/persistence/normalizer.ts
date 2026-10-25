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
          brightRangeInSquares: 4,
          dimRangeInSquares: 2,
          hardness: 0.5
        }
      };
    } else {
      // Migrar tokens antiguos con rangeInSquares único
      const hasBright = entity.vision.brightRangeInSquares !== undefined;
      const oldRange = entity.vision.rangeInSquares;
      const brightRangeInSquares = hasBright
        ? entity.vision.brightRangeInSquares
        : oldRange !== undefined
        ? oldRange
        : 4;
      const dimRangeInSquares = entity.vision.dimRangeInSquares !== undefined
        ? entity.vision.dimRangeInSquares
        : hasBright
        ? 2
        : 0;

      return {
        ...entity,
        side,
        vision: {
          ...entity.vision,
          brightRangeInSquares,
          dimRangeInSquares
        }
      };
    }
  }
  return entity;
}

/**
 * Normaliza el estado completo de una partida al cargar o importar.
 * - Asegura que fog tenga enabled, rememberExplored, explored y revealed válidos.
 * - Normaliza todas las entidades (tokens sin vision reciben vision adecuada).
 */
export function normalizeGameState(game: GameState): GameState {
  return {
    ...game,
    fog: {
      enabled: game.fog?.enabled ?? true,
      rememberExplored: game.fog?.rememberExplored ?? false,
      explored: game.fog?.explored ?? [],
      revealed: game.fog?.revealed ?? []
    },
    entities: (game.entities || []).map(normalizeEntity)
  };
}
