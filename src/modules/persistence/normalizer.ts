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
  if (entity.type === 'light') {
    return {
      ...entity,
      visibleToPlayers: entity.visibleToPlayers ?? true,
      locked: entity.locked ?? false,
      light: {
        color: entity.light?.color || '#ffaa44',
        intensity: entity.light?.intensity ?? 100,
        brightRadiusInSquares: entity.light?.brightRadiusInSquares ?? 4,
        dimRadiusInSquares: entity.light?.dimRadiusInSquares ?? 2,
        edgeHardness: entity.light?.edgeHardness ?? 0.5,
        flicker: entity.light?.flicker ?? false
      }
    };
  }
  return entity;
}

/**
 * Normaliza el estado completo de una partida al cargar o importar.
 * - Asegura que fog tenga enabled, rememberExplored, explored y revealed válidos.
 * - Asegura que ambient, weather y music tengan estructuras válidas.
 * - Normaliza todas las entidades (tokens sin vision reciben vision adecuada, luces reciben lightConfig).
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
    ambient: game.ambient ?? {
      preset: 'noon',
      color: '#ffffff',
      intensity: 1.0
    },
    weather: game.weather ?? {
      rain: { enabled: false, intensity: 50, direction: 90 },
      snow: { enabled: false, intensity: 50 },
      wind: { enabled: false, intensity: 50, direction: 0 }
    },
    music: {
      playlist: game.music?.playlist ?? [],
      currentTrackId: game.music?.currentTrackId ?? null,
      isPlaying: false, // Siempre pausado al iniciar
      volume: game.music?.volume ?? 0.8,
      loopTrack: game.music?.loopTrack ?? false
    },
    entities: (game.entities || []).map(normalizeEntity)
  };
}
