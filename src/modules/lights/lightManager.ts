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

export class LightManager {
  private lastCacheKey: string = '';
  private cachedLights: LightVisibility[] = [];

  /**
   * Genera una clave de estado para invalidar la caché de polígonos de luz
   * SOLO cuando cambian posiciones, radios de luz o paredes/puertas/mapas.
   * El parpadeo visual (flicker) NO invalida la geometría.
   */
  private generateStateKey(entities: Entity[], gridSize: number): string {
    const lightEntities = entities.filter(
      (e) => (e.type === 'light' || (e.type === 'effect' && e.effect?.emitsLight)) && e.light && e.visibleToPlayers !== false
    );

    const lightPart = lightEntities
      .map((l) => {
        const c = l.light!;
        return `${l.id}:${Math.round(l.x)}:${Math.round(l.y)}:${l.scaleX}:${l.scaleY}:${c.brightRadiusInSquares}:${c.dimRadiusInSquares}:${c.color}:${c.intensity}:${c.edgeHardness}`;
      })
      .join('|');

    const wallPart = entities
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

    return `${gridSize}__${lightPart}__${wallPart}`;
  }

  /**
   * Obtiene los polígonos de iluminación de todas las entidades de tipo luz activas.
   */
  public getLightsVisibility(entities: Entity[], gridSize: number): LightVisibility[] {
    const effectiveGridSize = gridSize > 0 ? gridSize : 70;
    const stateKey = this.generateStateKey(entities, effectiveGridSize);
    if (stateKey === this.lastCacheKey && this.cachedLights.length > 0) {
      return this.cachedLights;
    }

    const lightEntities = entities.filter(
      (e) => (e.type === 'light' || (e.type === 'effect' && e.effect?.emitsLight)) && e.light && e.visibleToPlayers !== false
    );

    if (lightEntities.length === 0) {
      this.lastCacheKey = stateKey;
      this.cachedLights = [];
      return [];
    }

    const wallSegments = getAllWallSegments(entities);
    const visibilities: LightVisibility[] = [];

    for (const lightEnt of lightEntities) {
      const cfg = lightEnt.light!;
      const center: Point2D = { x: lightEnt.x, y: lightEnt.y };
      const scaleMultiplier = lightEnt.type === 'effect' ? Math.max(0.2, (Math.abs(lightEnt.scaleX || 1) + Math.abs(lightEnt.scaleY || 1)) / 2) : 1;
      const brightSquares = (cfg.brightRadiusInSquares ?? 4) * scaleMultiplier;
      const dimSquares = (cfg.dimRadiusInSquares ?? 2) * scaleMultiplier;
      const brightRangePx = Math.max(0, brightSquares * effectiveGridSize);
      const totalRangePx = Math.max(brightRangePx, (brightSquares + dimSquares) * effectiveGridSize);

      let brightPolygon: Point2D[] = [];
      let totalPolygon: Point2D[] = [];

      if (brightRangePx > 0) {
        brightPolygon = computeVisibilityPolygon(center, brightRangePx, wallSegments);
      }
      if (totalRangePx > 0) {
        totalPolygon = computeVisibilityPolygon(center, totalRangePx, wallSegments);
      } else {
        totalPolygon = brightPolygon;
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

    this.lastCacheKey = stateKey;
    this.cachedLights = visibilities;
    return visibilities;
  }
}

export const lightManager = new LightManager();
