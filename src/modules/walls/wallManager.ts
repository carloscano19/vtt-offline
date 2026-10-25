import { Entity, Point2D } from '../../types/entity';
import { localToWorld } from '../../pixi/utils/coordinates';

export interface WallSegment {
  p1: Point2D;
  p2: Point2D;
  entityId: string;
  source: 'uvtt' | 'drawn' | 'door';
}

/**
 * Devuelve en coordenadas globales del mundo todos los segmentos de paredes
 * existentes en la partida (paredes UVTT + paredes invisibles dibujadas + puertas cerradas).
 * Función consumida directamente por los algoritmos de visión y FoW en la Fase 2.
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

    // 2. Portales cerrados de mapas UVTT (que no hayan sido convertidos a entidades independientes)
    if (ent.type === 'map' && ent.mapData?.portals) {
      const mapPos = { x: ent.x, y: ent.y };
      for (const portal of ent.mapData.portals) {
        if (portal.closed && portal.bounds && portal.bounds.length >= 2) {
          const p1 = localToWorld(portal.bounds[0], mapPos, ent.rotation, ent.scaleX, ent.scaleY);
          const p2 = localToWorld(portal.bounds[1], mapPos, ent.rotation, ent.scaleX, ent.scaleY);
          segments.push({
            p1,
            p2,
            entityId: ent.id,
            source: 'door'
          });
        }
      }
    }

    // 3. Paredes invisibles dibujadas (tipo 'wall')
    if (ent.type === 'wall' && ent.points && ent.points.length >= 2) {
      const pts = ent.points;
      const count = ent.closed ? pts.length : pts.length - 1;
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

    // 4. Puertas (tipo 'door') - si están CERRADAS, bloquean visión como pared
    if (ent.type === 'door' && ent.door && !ent.door.isOpen) {
      const parentMap = ent.mapId ? mapEntitiesById.get(ent.mapId) : undefined;
      const transformPoint = (p: Point2D): Point2D => {
        if (parentMap) {
          const mapPos = { x: parentMap.x, y: parentMap.y };
          return localToWorld(p, mapPos, parentMap.rotation, parentMap.scaleX, parentMap.scaleY);
        }
        return p;
      };

      const p1 = transformPoint(ent.door.p1);
      const p2 = transformPoint(ent.door.p2);
      segments.push({
        p1,
        p2,
        entityId: ent.id,
        source: 'door'
      });
    }
  }

  return segments;
}
