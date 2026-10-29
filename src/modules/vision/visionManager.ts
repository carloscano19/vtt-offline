import { Entity, Point2D } from '../../types/entity';
import { getAllWallSegments, WallSegment } from '../walls/wallManager';
import { computeVisibilityPolygon, clipPolygonToCone, TokenVisibility } from './visibilityPolygon';

interface CachedTokenPoly {
  key: string;
  brightPolygon: Point2D[];
  totalPolygon: Point2D[];
  losPolygon: Point2D[];
}

export class VisionManager {
  private lastCacheKey: string = '';
  private cachedVisibilities: TokenVisibility[] = [];
  private perTokenCache: Map<string, CachedTokenPoly> = new Map();

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
   * Genera una clave de estado basada en posiciones y configuraciones relevantes.
   * Si no ha cambiado nada, reutiliza la visibilidad calculada sin coste por frame.
   */
  private generateStateKey(entities: Entity[], gridSize: number, wallPart: string): string {
    const relevantTokens = entities.filter(
      (e) => e.type === 'token' && e.side === 'jugador' && e.vision?.active && e.visibleToPlayers !== false
    );

    const tokenPart = relevantTokens
      .map((t) => {
        const b = t.vision?.brightRangeInSquares ?? t.vision?.rangeInSquares ?? 4;
        const d = t.vision?.dimRangeInSquares ?? 2;
        const shape = t.vision?.shape ?? 'circle';
        const coneAngle = t.vision?.coneAngle ?? 60;
        const dirOffset = t.vision?.directionOffset ?? 0;
        const rot = Math.round((t.rotation || 0) * 100) / 100;
        return `${t.id}:${Math.round(t.x)}:${Math.round(t.y)}:${b}:${d}:${t.vision?.hardness}:${shape}:${coneAngle}:${dirOffset}:${rot}`;
      })
      .join('|');

    return `${gridSize}__${tokenPart}__${wallPart}`;
  }

  /**
   * Calcula o recupera de la caché los polígonos de visión de todos los tokens de jugador activos.
   */
  public getTokensVisibility(entities: Entity[], gridSize: number): TokenVisibility[] {
    const wallPart = this.generateWallPart(entities);
    const stateKey = this.generateStateKey(entities, gridSize, wallPart);
    if (stateKey === this.lastCacheKey && this.cachedVisibilities.length > 0) {
      return this.cachedVisibilities;
    }

    const playerVisionTokens = entities.filter(
      (e) => e.type === 'token' && e.side === 'jugador' && e.vision?.active && e.visibleToPlayers !== false
    );

    if (playerVisionTokens.length === 0) {
      this.lastCacheKey = stateKey;
      this.cachedVisibilities = [];
      this.perTokenCache.clear();
      return [];
    }

    let wallSegments: ReturnType<typeof getAllWallSegments> | null = null;
    const getSegments = () => {
      if (!wallSegments) wallSegments = getAllWallSegments(entities);
      return wallSegments;
    };

    const visibilities: TokenVisibility[] = [];
    const activeIds = new Set<string>();

    for (const token of playerVisionTokens) {
      activeIds.add(token.id);
      const brightSquares = token.vision?.brightRangeInSquares ?? token.vision?.rangeInSquares ?? 4;
      const dimSquares = token.vision?.dimRangeInSquares ?? (token.vision?.rangeInSquares !== undefined ? 0 : 2);
      const hardness = token.vision?.hardness ?? 0.5;
      const center: Point2D = { x: token.x, y: token.y };

      const shape = token.vision?.shape ?? 'circle';
      const coneAngle = token.vision?.coneAngle ?? 60;
      const directionOffset = token.vision?.directionOffset ?? 0;
      const rotation = token.rotation ?? 0;

      const brightRangePx = brightSquares === 0 ? 0 : brightSquares * gridSize;
      const totalRangePx = brightSquares === 0 ? 0 : (dimSquares > 0 ? (brightSquares + dimSquares) * gridSize : brightRangePx);

      const tokenKey = `${Math.round(center.x)}:${Math.round(center.y)}:${brightRangePx}:${totalRangePx}:${shape}:${coneAngle}:${directionOffset}:${Math.round(rotation * 100) / 100}__${wallPart}`;
      const cached = this.perTokenCache.get(token.id);

      let brightPolygon: Point2D[];
      let totalPolygon: Point2D[];
      let losPolygon: Point2D[];

      if (cached && cached.key === tokenKey) {
        brightPolygon = cached.brightPolygon;
        totalPolygon = cached.totalPolygon;
        losPolygon = cached.losPolygon;
      } else {
        const segments = getSegments();
        if (brightSquares === 0) {
          brightPolygon = computeVisibilityPolygon(center, 0, segments);
          totalPolygon = brightPolygon;
          losPolygon = totalPolygon;
        } else {
          brightPolygon = computeVisibilityPolygon(center, brightRangePx, segments);
          totalPolygon = dimSquares > 0 ? computeVisibilityPolygon(center, totalRangePx, segments) : brightPolygon;
          losPolygon = computeVisibilityPolygon(center, 0, segments);
        }

        if (shape === 'cone') {
          brightPolygon = clipPolygonToCone(brightPolygon, center, brightRangePx, rotation, coneAngle, directionOffset);
          totalPolygon = clipPolygonToCone(totalPolygon, center, totalRangePx, rotation, coneAngle, directionOffset);
          losPolygon = clipPolygonToCone(losPolygon, center, 5000, rotation, coneAngle, directionOffset);
        }

        this.perTokenCache.set(token.id, {
          key: tokenKey,
          brightPolygon,
          totalPolygon,
          losPolygon
        });
      }

      visibilities.push({
        tokenId: token.id,
        center,
        brightPolygon,
        totalPolygon,
        polygon: totalPolygon,
        losPolygon,
        brightRangePx,
        totalRangePx,
        rangePx: totalRangePx,
        hardness,
        shape,
        coneAngle,
        directionOffset,
        rotation
      });
    }

    if (this.perTokenCache.size > activeIds.size * 2) {
      for (const id of this.perTokenCache.keys()) {
        if (!activeIds.has(id)) this.perTokenCache.delete(id);
      }
    }

    this.lastCacheKey = stateKey;
    this.cachedVisibilities = visibilities;
    return visibilities;
  }
}

export const visionManager = new VisionManager();
