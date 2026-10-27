import { Entity, getDefaultSnapToGrid } from '../../types/entity';
import { GameState } from '../../types/game';
import { safeClip } from '../vision/safeClip';
import { parseColor, colorToHex } from '../../utils/color';
import { fitMapInViewport, isPlayerCameraOutOfBounds } from '../camera/cameraUtils';

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
    let rotAnim = rawAnim.rotation;
    if (rotAnim && typeof rotAnim === 'object') {
      let speed = typeof rotAnim.speed === 'number' && Number.isFinite(rotAnim.speed) ? rotAnim.speed : 0.2;
      if (!rotAnim.isVps) {
        // Migrar valores antiguos (donde speed era multiplicador y producía old_speed * 0.05 rad/s)
        // para conservar la misma velocidad real en vueltas/segundo: (old_speed * 0.05) / (2 * Math.PI)
        speed = (speed * 0.05) / (2 * Math.PI);
      }
      rotAnim = {
        enabled: Boolean(rotAnim.enabled),
        speed,
        direction: rotAnim.direction === 'ccw' ? 'ccw' : 'cw',
        isVps: true
      };
    }
    entity = {
      ...entity,
      animations: {
        ...rawAnim,
        rotation: rotAnim,
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

  // Normalizar color de luz si existe en la entidad (tokens, efectos o luces)
  if (entity.light) {
    const parsed = parseColor(entity.light.color, 0xffaa44);
    entity = {
      ...entity,
      light: {
        ...entity.light,
        color: colorToHex(parsed.rgb)
      }
    };
  }

  // Normalizar luces dentro de un mapa importado
  if (entity.type === 'map' && entity.mapData?.lights) {
    const normalizedLights = entity.mapData.lights.map((lgt) => {
      const parsed = parseColor(lgt.color, 0xffffff);
      return {
        ...lgt,
        color: colorToHex(parsed.rgb)
      };
    });
    entity = {
      ...entity,
      mapData: {
        ...entity.mapData,
        lights: normalizedLights
      }
    };
  }

  if (entity.type === 'light') {
    const parsed = parseColor(entity.light?.color, 0xffaa44);
    return {
      ...entity,
      visibleToPlayers: entity.visibleToPlayers ?? true,
      locked: entity.locked ?? false,
      light: {
        color: colorToHex(parsed.rgb),
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

    entity = {
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

  // Normalizar opacidad (0.0 a 1.0, por defecto 1.0 si es undefined o NaN)
  const rawOpacity = typeof entity.opacity === 'number' && Number.isFinite(entity.opacity) ? entity.opacity : 1.0;
  entity = {
    ...entity,
    opacity: Math.max(0, Math.min(1, rawOpacity)),
    snapToGrid: getDefaultSnapToGrid(entity)
  };

  return entity;
}

/**
 * Normaliza el estado completo de una partida al cargar o importar.
 * - Asegura que fog tenga enabled, rememberExplored, explored y revealed válidos.
 * - Asegura que ambient, weather y music tengan estructuras válidas.
 * - Normaliza todas las entidades (tokens sin vision reciben vision adecuada, luces reciben lightConfig).
 */
export function normalizeGameState(game: GameState): GameState {
  const currentGridSize = (game.grid?.size && game.grid.size > 0) ? game.grid.size : 70;
  const rawEntities = game.entities || [];
  const doorEntities = rawEntities.filter((e) => e.type === 'door' && e.door);

  const normalizedEntities = rawEntities.map((ent) => {
    let nEnt = normalizeEntity(ent);
    if (nEnt.type === 'map' && nEnt.mapData?.pixelsPerGrid && nEnt.mapData.pixelsPerGrid > 0) {
      const expectedScale = currentGridSize / nEnt.mapData.pixelsPerGrid;
      if (Math.abs(nEnt.scaleX - expectedScale) > 0.001 || Math.abs(nEnt.scaleY - expectedScale) > 0.001) {
        nEnt = {
          ...nEnt,
          scaleX: expectedScale,
          scaleY: expectedScale
        };
      }
    }

    // Si es un mapa con portales y hay entidades puerta con su mapId cuyos p1/p2 coinciden con los bounds del portal (tolerancia 1px),
    // elimina esos portales del mapa para evitar paredes duplicadas en getAllWallSegments
    if (nEnt.type === 'map' && nEnt.mapData?.portals && nEnt.mapData.portals.length > 0) {
      const doorsForMap = doorEntities.filter((d) => d.mapId === nEnt.id && d.door);
      if (doorsForMap.length > 0) {
        const remainingPortals = nEnt.mapData.portals.filter((portal) => {
          if (!portal.bounds || portal.bounds.length < 2) return false;
          const b0 = portal.bounds[0];
          const b1 = portal.bounds[1];
          const hasMatchingDoor = doorsForMap.some((d) => {
            const p1 = d.door!.p1;
            const p2 = d.door!.p2;
            const direct = Math.hypot(p1.x - b0.x, p1.y - b0.y) <= 1 && Math.hypot(p2.x - b1.x, p2.y - b1.y) <= 1;
            const invert = Math.hypot(p1.x - b1.x, p1.y - b1.y) <= 1 && Math.hypot(p2.x - b0.x, p2.y - b0.y) <= 1;
            return direct || invert;
          });
          return !hasMatchingDoor;
        });

        nEnt = {
          ...nEnt,
          mapData: {
            ...nEnt.mapData,
            portals: remainingPortals
          }
        };
      }
    }

    return nEnt;
  });

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
      ambient: game.ambient ? {
        ...game.ambient,
        color: colorToHex(parseColor(game.ambient.color, 0xffffff).rgb)
      } : {
        preset: 'noon',
        color: '#ffffff',
        intensity: 1.0
      },
      grid: game.grid ? {
        ...game.grid,
        color: colorToHex(parseColor(game.grid.color, 0xffffff).rgb),
        wallsBlockMovement: Boolean(game.grid.wallsBlockMovement ?? false)
      } : {
        size: 70,
        color: '#ffffff',
        opacity: 0.25,
        visible: true,
        snapToGrid: true,
        wallsBlockMovement: false
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
      entities: normalizedEntities,
      playerCamera: (() => {
        let cam = game.playerCamera || { x: 0, y: 0, zoom: 1 };
        if (isPlayerCameraOutOfBounds(cam, normalizedEntities)) {
          const fitted = fitMapInViewport(normalizedEntities, game.playerViewport || { width: 1920, height: 1080 });
          if (fitted) {
            cam = fitted;
          }
        }
        return cam;
      })()
    };
}
