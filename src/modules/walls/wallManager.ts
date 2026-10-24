import { Entity, Point2D } from '../../types/entity';
import { localToWorld } from '../../pixi/utils/coordinates';

export interface WallSegment {
  p1: Point2D;
  p2: Point2D;
  entityId: string;
  source: 'uvtt' | 'drawn';
}

/**
 * Devuelve en coordenadas globales del mundo todos los segmentos de paredes
 * existentes en la partida (tanto paredes embebidas en mapas UVTT como paredes invisibles dibujadas).
 * Función lista para ser consumida directamente por los algoritmos de visión y FoW en la Fase 2.
 */
export function getAllWallSegments(entities: Entity[]): WallSegment[] {
  const segments: WallSegment[] = [];
  const mapEntitiesById = new Map<string, Entity>();

  for (const ent of entities) {
    if (ent.type === 'map') {
      mapEntitiesById.set(ent.id, ent);
    }
  }

  for (const ent of entities) {
    // 1. Paredes de mapas UVTT
    if (ent.type === 'map' && ent.mapData?.walls) {
      const mapPos = { x: ent.x, y: ent.y };
      for (const wall of ent.mapData.walls) {
        const p1 = localToWorld(wall.p1, mapPos, ent.rotation, ent.scaleX, ent.scaleY);
        const p2 = localToWorld(wall.p2, mapPos, ent.rotation, ent.scaleX, ent.scaleY);
        segments.push({
          p1,
          p2,
          entityId: ent.id,
          source: 'uvtt'
        });
      }
    }

    // 2. Paredes invisibles dibujadas (tipo 'wall')
    if (ent.type === 'wall' && ent.points && ent.points.length >= 2) {
      const pts = ent.points;
      const count = ent.closed ? pts.length : pts.length - 1;

      // Si está anclada a un mapa, transformar desde coordenadas locales de ese mapa
      const parentMap = ent.mapId ? mapEntitiesById.get(ent.mapId) : undefined;

      const transformPoint = (p: Point2D): Point2D => {
        if (parentMap) {
          const mapPos = { x: parentMap.x, y: parentMap.y };
          return localToWorld(p, mapPos, parentMap.rotation, parentMap.scaleX, parentMap.scaleY);
        }
        return p;
      };

      for (let i = 0; i < count; i++) {
        const p1 = transformPoint(pts[i]);
        const p2 = transformPoint(pts[(i + 1) % pts.length]);
        segments.push({
          p1,
          p2,
          entityId: ent.id,
          source: 'drawn'
        });
      }
    }
  }

  return segments;
}
