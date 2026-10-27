import { Entity } from '../../types/entity';
import { GameState } from '../../types/game';
import { safeClip } from '../vision/safeClip';

/**
 * Normaliza una entidad individual.
 * Todo token sin campo vision recibe:
 * vision = { active: side === 'jugador', rangeInSquares: 12, hardness: 0.5 }
 */
export function normalizeEntity(entity: Entity): Entity {
  if (entity.type === 'token') {
    const side = entity.side || 'jugador';
    if (!entity.vision) {
      entity = {
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

      entity = {
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
  // Normalizar animaciones si existen
  const rawAnim: any = entity.animations || (entity as any).animation;
  if (rawAnim) {
    let sway = rawAnim.sway;
    if (sway) {
      let dir = sway.direction;
      if (typeof dir === 'string') {
        dir = dir.toLowerCase() === 'vertical' ? 90 : 0;
      } else if (typeof dir !== 'number' || !Number.isFinite(dir)) {
        dir = 0;
      }
      sway = {
        enabled: Boolean(sway.enabled),
        distanceInSquares: Math.max(0, Number(sway.distanceInSquares) || 1),
        speed: Math.max(0.1, Number(sway.speed) || 1),
        direction: dir
      };
    }
    entity = {
      ...entity,
      animations: {
        ...rawAnim,
        sway
      }
    };
    if ('animation' in entity) {
      delete (entity as any).animation;
    }
  }

  // Normalizar Chroma Key si existe en cualquier entidad
  if (entity.chromaKey) {
    const rawCk: any = entity.chromaKey;
    const enabled = rawCk.enabled ?? rawCk.active ?? false;
    let tol = rawCk.tolerance ?? 15;
    // Si la tolerancia viene en rango 0.0 - 1.0 (antiguo), convertir a 0 - 100
    if (typeof tol === 'number' && tol > 0 && tol <= 1) {
      tol = Math.round(tol * 100);
    }
    entity = {
      ...entity,
      chromaKey: {
        enabled,
        color: rawCk.color || '#00ff00',
        tolerance: Math.max(0, Math.min(100, tol))
      }
    };
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

  // Normalizar puertas (migración de puertas antiguas sin length ni centro)
  if (entity.type === 'door' && entity.door) {
    const door = entity.door;
    let length = door.length;
    let x = entity.x;
    let y = entity.y;
    let rot = entity.rotation ?? 0;

    if (length === undefined || length <= 0) {
      const p1 = door.p1 || { x: -35, y: 0 };
      const p2 = door.p2 || { x: 35, y: 0 };
      length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      rot = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      x = (p1.x + p2.x) / 2;
      y = (p1.y + p2.y) / 2;
    }

    return {
      ...entity,
      x,
      y,
      rotation: rot,
      scaleX: 1,
      scaleY: 1,
      door: {
        ...door,
        length: Math.max(1, length),
        isOpen: door.isOpen ?? false,
        isLocked: door.isLocked ?? false,
        openAngle: door.openAngle ?? Math.PI / 2
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
      explored: (() => {
        const exp = game.fog?.explored;
        if (!exp || !Array.isArray(exp)) return [];
        if (!safeClip.validate(exp)) {
          const sanitized = safeClip.sanitize(exp);
          if (safeClip.validate(sanitized)) {
            console.warn('[normalizer] game.fog.explored corrupto fue reparado.');
            return sanitized;
          }
          console.warn('[normalizer] game.fog.explored corrupto e irrecuperable. Se reinicia a vacío.');
          return [];
        }
        return exp;
      })(),
      revealed: (() => {
        const rev = game.fog?.revealed;
        if (!rev || !Array.isArray(rev)) return [];
        if (!safeClip.validate(rev)) {
          const sanitized = safeClip.sanitize(rev);
          if (safeClip.validate(sanitized)) {
            console.warn('[normalizer] game.fog.revealed corrupto fue reparado.');
            return sanitized;
          }
          console.warn('[normalizer] game.fog.revealed corrupto e irrecuperable. Se reinicia a vacío.');
          return [];
        }
        return rev;
      })()
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
