import { Entity, Point2D } from '../../types/entity';
import { localToWorld } from '../../pixi/utils/coordinates';
import { doorAnimationManager } from '../doors/doorAnimationManager';

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

    // 2. Portales de mapas UVTT no convertidos a entidades puerta (incluso si closed=false o freestanding)
    if (ent.type === 'map' && ent.mapData?.portals) {
      const mapPos = { x: ent.x, y: ent.y };
      for (const portal of ent.mapData.portals) {
        if (portal.bounds && portal.bounds.length >= 2) {
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

    // 4. Puertas (tipo 'door') - si NO están completamente abiertas, bloquean visión como pared
    if (ent.type === 'door' && ent.door && !doorAnimationManager.isFullyOpen(ent.id, ent.door.isOpen)) {
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

    // 5. Puerta giratoria en X (tipo 'effect' con preset 'cross_revolving_door')
    // Los 4 brazos actúan como paredes perpendiculares que bloquean visión y movimiento
    if (ent.type === 'effect' && ent.effect?.preset === 'cross_revolving_door') {
      const parentMap = ent.mapId ? mapEntitiesById.get(ent.mapId) : undefined;
      const mapPos = parentMap ? { x: parentMap.x, y: parentMap.y } : { x: 0, y: 0 };
      const mapRot = parentMap ? parentMap.rotation : 0;
      const mapScaleX = parentMap ? parentMap.scaleX : 1;
      const mapScaleY = parentMap ? parentMap.scaleY : 1;

      const centerWorld = parentMap
        ? localToWorld({ x: ent.x, y: ent.y }, mapPos, mapRot, mapScaleX, mapScaleY)
        : { x: ent.x, y: ent.y };

      const baseRot = parentMap ? ent.rotation + mapRot : ent.rotation;
      const gridSize = parentMap?.mapData?.pixelsPerGrid ?? 70;
      const trapGridSize = ent.effect.trapGridSize ?? 3;
      const armLength = (trapGridSize / 2) * gridSize * (ent.scaleX || 1);

      // 4 brazos perpendiculares a 0, 90, 180, 270 grados
      for (let i = 0; i < 4; i++) {
        const armAngle = baseRot + (i * Math.PI) / 2;
        const armTipWorld: Point2D = {
          x: centerWorld.x + armLength * Math.cos(armAngle),
          y: centerWorld.y + armLength * Math.sin(armAngle)
        };
        segments.push({
          p1: centerWorld,
          p2: armTipWorld,
          entityId: ent.id,
          source: 'door'
        });
      }
    }
  }

  return segments;
}

/**
 * Comprueba si dos segmentos de línea [p1, p2] y [p3, p4] se cruzan.
 */
export function segmentsIntersect(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): boolean {
  const orientation = (p: Point2D, q: Point2D, r: Point2D): number => {
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(val) < 1e-9) return 0;
    return val > 0 ? 1 : 2;
  };

  const onSegment = (p: Point2D, q: Point2D, r: Point2D): boolean => {
    return (
      q.x <= Math.max(p.x, r.x) + 1e-9 &&
      q.x >= Math.min(p.x, r.x) - 1e-9 &&
      q.y <= Math.max(p.y, r.y) + 1e-9 &&
      q.y >= Math.min(p.y, r.y) - 1e-9
    );
  };

  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;

  return false;
}

/**
 * Comprueba si el movimiento en línea recta de `from` a `to` está bloqueado por
 * alguna pared o puerta cerrada en la partida.
 */
export function isMovementBlockedByWall(from: Point2D, to: Point2D, entities: Entity[]): boolean {
  const segments = getAllWallSegments(entities);
  for (const seg of segments) {
    if (segmentsIntersect(from, to, seg.p1, seg.p2)) {
      return true;
    }
  }
  return false;
}
