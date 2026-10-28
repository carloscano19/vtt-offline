import { Entity, Point2D } from '../../types/entity';
import { getAllWallSegments } from '../walls/wallManager';
import { computeVisibilityPolygon } from '../vision/visibilityPolygon';
import { parseColor, colorToHex } from '../../utils/color';

export interface LightVisibility {
  lightId: string;
  center: Point2D;
  color: string;
  intensity: number; // Normalizado 0.0 a 1.0
  brightPolygon: Point2D[];
  totalPolygon: Point2D[];
  brightRangePx: number;
  totalRangePx: number;
  edgeHardness: number;
  flicker: boolean;
}

interface CachedLightPoly {
  key: string;
  brightPolygon: Point2D[];
  totalPolygon: Point2D[];
}

export class LightManager {
  private lastCacheKey: string = '';
  private cachedLights: LightVisibility[] = [];
  private perLightCache: Map<string, CachedLightPoly> = new Map();

  /**
   * Genera la firma de estado de las paredes y mapas que bloquean la luz.
   */
  private generateWallPart(entities: Entity[]): string {
    return entities
      .filter((e) => e.type === 'wall' || e.type === 'door' || e.type === 'map')
      .map((e) => {
        if (e.type === 'door') {
          return `d:${e.id}:${e.door?.isOpen}:${e.door?.isLocked}:${Math.round(e.door?.p1.x || 0)}:${Math.round(e.door?.p1.y || 0)}`;
        }
        if (e.type === 'wall') {
          return `w:${e.id}:${Math.round(e.x)}:${Math.round(e.y)}:${e.points?.length}`;
        }
        if (e.type === 'map') {
          return `m:${e.id}:${Math.round(e.x)}:${Math.round(e.y)}:${e.scaleX}:${e.rotation}`;
        }
        return '';
      })
      .join(';');
  }

  /**
   * Genera una clave de estado para invalidar la caché de polígonos de luz
   * SOLO cuando cambian posiciones, radios de luz o paredes/puertas/mapas.
   * El parpadeo visual (flicker) NO invalida la geometría.
   */
  private generateStateKey(entities: Entity[], gridSize: number, wallPart: string): string {
    const lightEntities = entities.filter(
      (e) => (e.type === 'light' || (e.type === 'effect' && e.effect?.emitsLight)) && e.light && e.visibleToPlayers !== false
    );

    const lightPart = lightEntities
      .map((l) => {
        const c = l.light!;
        return `${l.id}:${Math.round(l.x)}:${Math.round(l.y)}:${l.scaleX}:${l.scaleY}:${c.brightRadiusInSquares}:${c.dimRadiusInSquares}:${c.color}:${c.intensity}:${c.edgeHardness}`;
      })
      .join('|');

    return `${gridSize}__${lightPart}__${wallPart}`;
  }

  /**
   * Obtiene los polígonos de iluminación de todas las entidades de tipo luz activas.
   * Reutiliza en caché individualmente los polígonos de las luces estáticas que no se mueven.
   */
  public getLightsVisibility(entities: Entity[], gridSize: number): LightVisibility[] {
    const effectiveGridSize = gridSize > 0 ? gridSize : 70;
    const wallPart = this.generateWallPart(entities);
    const stateKey = this.generateStateKey(entities, effectiveGridSize, wallPart);
    if (stateKey === this.lastCacheKey && this.cachedLights.length > 0) {
      return this.cachedLights;
    }

    const lightEntities = entities.filter(
      (e) => (e.type === 'light' || (e.type === 'effect' && e.effect?.emitsLight)) && e.light && e.visibleToPlayers !== false
    );

    if (lightEntities.length === 0) {
      this.lastCacheKey = stateKey;
      this.cachedLights = [];
      this.perLightCache.clear();
      return [];
    }

    let wallSegments: ReturnType<typeof getAllWallSegments> | null = null;
    const getSegments = () => {
      if (!wallSegments) wallSegments = getAllWallSegments(entities);
      return wallSegments;
    };

    const visibilities: LightVisibility[] = [];
    const activeIds = new Set<string>();

    for (const lightEnt of lightEntities) {
      activeIds.add(lightEnt.id);
      const cfg = lightEnt.light!;
      const center: Point2D = { x: lightEnt.x, y: lightEnt.y };
      const scaleMultiplier = lightEnt.type === 'effect' ? Math.max(0.2, (Math.abs(lightEnt.scaleX || 1) + Math.abs(lightEnt.scaleY || 1)) / 2) : 1;
      const brightSquares = (cfg.brightRadiusInSquares ?? 4) * scaleMultiplier;
      const dimSquares = (cfg.dimRadiusInSquares ?? 2) * scaleMultiplier;
      const brightRangePx = Math.max(0, brightSquares * effectiveGridSize);
      const totalRangePx = Math.max(brightRangePx, (brightSquares + dimSquares) * effectiveGridSize);

      const lightKey = `${Math.round(center.x)}:${Math.round(center.y)}:${brightRangePx}:${totalRangePx}__${wallPart}`;
      const cached = this.perLightCache.get(lightEnt.id);

      let brightPolygon: Point2D[];
      let totalPolygon: Point2D[];

      if (cached && cached.key === lightKey) {
        brightPolygon = cached.brightPolygon;
        totalPolygon = cached.totalPolygon;
      } else {
        const segments = getSegments();
        if (brightRangePx > 0) {
          brightPolygon = computeVisibilityPolygon(center, brightRangePx, segments);
        } else {
          brightPolygon = [];
        }

        if (totalRangePx > 0) {
          totalPolygon = computeVisibilityPolygon(center, totalRangePx, segments);
        } else {
          totalPolygon = brightPolygon;
        }

        this.perLightCache.set(lightEnt.id, {
          key: lightKey,
          brightPolygon,
          totalPolygon
        });
      }

      visibilities.push({
        lightId: lightEnt.id,
        center,
        color: colorToHex(parseColor(cfg.color, 0xffaa44).rgb),
        intensity: Math.max(0, Math.min(100, cfg.intensity ?? 100)) / 100,
        brightPolygon,
        totalPolygon,
        brightRangePx,
        totalRangePx,
        edgeHardness: cfg.edgeHardness ?? 0.5,
        flicker: !!cfg.flicker
      });
    }

    // Limpiar luces eliminadas de la caché si supera un límite
    if (this.perLightCache.size > activeIds.size * 2) {
      for (const id of this.perLightCache.keys()) {
        if (!activeIds.has(id)) this.perLightCache.delete(id);
      }
    }

    this.lastCacheKey = stateKey;
    this.cachedLights = visibilities;
    return visibilities;
  }
}

export const lightManager = new LightManager();
