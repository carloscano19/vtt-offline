import { Entity, Point2D } from '../../types/entity';
import { getAllWallSegments, WallSegment } from '../walls/wallManager';
import { computeVisibilityPolygon, TokenVisibility } from './visibilityPolygon';

export class VisionManager {
  private lastCacheKey: string = '';
  private cachedVisibilities: TokenVisibility[] = [];

  /**
   * Genera una clave de estado basada en posiciones y configuraciones relevantes.
   * Si no ha cambiado nada, reutiliza la visibilidad calculada sin coste por frame.
   */
  private generateStateKey(entities: Entity[], gridSize: number): string {
    const relevantTokens = entities.filter(
      (e) => e.type === 'token' && e.side === 'jugador' && e.vision?.active
    );

    const tokenPart = relevantTokens
      .map((t) => `${t.id}:${Math.round(t.x)}:${Math.round(t.y)}:${t.vision?.rangeInSquares}:${t.vision?.hardness}`)
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

    return `${gridSize}__${tokenPart}__${wallPart}`;
  }

  /**
   * Calcula o recupera de la caché los polígonos de visión de todos los tokens de jugador activos.
   */
  public getTokensVisibility(entities: Entity[], gridSize: number): TokenVisibility[] {
    const stateKey = this.generateStateKey(entities, gridSize);
    if (stateKey === this.lastCacheKey && this.cachedVisibilities.length > 0) {
      return this.cachedVisibilities;
    }

    const playerVisionTokens = entities.filter(
      (e) => e.type === 'token' && e.side === 'jugador' && e.vision?.active
    );

    if (playerVisionTokens.length === 0) {
      this.lastCacheKey = stateKey;
      this.cachedVisibilities = [];
      return [];
    }

    const wallSegments = getAllWallSegments(entities);
    const visibilities: TokenVisibility[] = [];

    for (const token of playerVisionTokens) {
      const rangeSquares = token.vision?.rangeInSquares ?? 12;
      const rangePx = rangeSquares > 0 ? rangeSquares * gridSize : 0;
      const hardness = token.vision?.hardness ?? 0.5;
      const center: Point2D = { x: token.x, y: token.y };

      const polygon = computeVisibilityPolygon(center, rangePx, wallSegments);
      visibilities.push({
        tokenId: token.id,
        center,
        polygon,
        rangePx,
        hardness
      });
    }

    this.lastCacheKey = stateKey;
    this.cachedVisibilities = visibilities;
    return visibilities;
  }
}

export const visionManager = new VisionManager();
