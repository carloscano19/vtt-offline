import { Entity, Point2D } from '../../types/entity';
import { localToWorld } from './coordinates';

export const TYPE_PRIORITY: Record<string, number> = {
  light: 350,
  effect: 320,
  token: 300,
  object: 200,
  door: 180,
  wall: 150,
  map: 100
};

export function getWallNodeWorldPos(wall: Entity, node: Point2D, allEntities: Entity[] = []): Point2D {
  if (wall.mapId) {
    const parentMap = allEntities.find((m) => m.id === wall.mapId);
    if (parentMap) {
      return localToWorld(
        node,
        { x: parentMap.x, y: parentMap.y },
        parentMap.rotation,
        parentMap.scaleX,
        parentMap.scaleY
      );
    }
  }
  return { x: wall.x + node.x, y: wall.y + node.y };
}

export function isEntityHit(
  ent: Entity,
  worldPos: Point2D,
  zoom: number,
  allEntities: Entity[] = [],
  getCustomBounds?: (ent: Entity) => { width: number; height: number } | null
): boolean {
  if (ent.type === 'light') {
    return Math.hypot(worldPos.x - ent.x, worldPos.y - ent.y) <= Math.max(20 / zoom, 25);
  }

  if (ent.type === 'wall' && ent.points && ent.points.length >= 2) {
    const pts = ent.points;
    const count = ent.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < count; i++) {
      const p1 = getWallNodeWorldPos(ent, pts[i], allEntities);
      const p2 = getWallNodeWorldPos(ent, pts[(i + 1) % pts.length], allEntities);
      const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
      if (l2 === 0) continue;
      let t = ((worldPos.x - p1.x) * (p2.x - p1.x) + (worldPos.y - p1.y) * (p2.y - p1.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      const projX = p1.x + t * (p2.x - p1.x);
      const projY = p1.y + t * (p2.y - p1.y);
      if (Math.hypot(worldPos.x - projX, worldPos.y - projY) <= 12 / zoom) {
        return true;
      }
    }
    return false;
  }

  if (ent.type === 'door' && ent.door) {
    const parentMap = ent.mapId ? allEntities.find((m) => m.id === ent.mapId) : undefined;
    const p1 = parentMap
      ? localToWorld(
          ent.door.p1,
          { x: parentMap.x, y: parentMap.y },
          parentMap.rotation,
          parentMap.scaleX,
          parentMap.scaleY
        )
      : ent.door.p1;
    const p2 = parentMap
      ? localToWorld(
          ent.door.p2,
          { x: parentMap.x, y: parentMap.y },
          parentMap.rotation,
          parentMap.scaleX,
          parentMap.scaleY
        )
      : ent.door.p2;

    const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
    if (l2 > 0) {
      let t = ((worldPos.x - p1.x) * (p2.x - p1.x) + (worldPos.y - p1.y) * (p2.y - p1.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      const projX = p1.x + t * (p2.x - p1.x);
      const projY = p1.y + t * (p2.y - p1.y);
      if (Math.hypot(worldPos.x - projX, worldPos.y - projY) <= Math.max(16 / zoom, 18)) {
        return true;
      }
    }
    if (ent.door.isOpen) {
      const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const baseAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const currentAngle = baseAngle + (ent.door.openAngle ?? Math.PI / 2);
      const leafEnd = {
        x: p1.x + Math.cos(currentAngle) * length,
        y: p1.y + Math.sin(currentAngle) * length
      };
      const leafL2 = (leafEnd.x - p1.x) ** 2 + (leafEnd.y - p1.y) ** 2;
      if (leafL2 > 0) {
        let t = ((worldPos.x - p1.x) * (leafEnd.x - p1.x) + (worldPos.y - p1.y) * (leafEnd.y - p1.y)) / leafL2;
        t = Math.max(0, Math.min(1, t));
        const projX = p1.x + t * (leafEnd.x - p1.x);
        const projY = p1.y + t * (leafEnd.y - p1.y);
        if (Math.hypot(worldPos.x - projX, worldPos.y - projY) <= Math.max(16 / zoom, 18)) {
          return true;
        }
      }
    }
    return false;
  }

  if (ent.type === 'map') {
    const mapW = (ent.mapData?.gridWidth ?? 10) * (ent.mapData?.pixelsPerGrid ?? 70) * ent.scaleX;
    const mapH = (ent.mapData?.gridHeight ?? 10) * (ent.mapData?.pixelsPerGrid ?? 70) * ent.scaleY;
    return worldPos.x >= ent.x && worldPos.x <= ent.x + mapW && worldPos.y >= ent.y && worldPos.y <= ent.y + mapH;
  }

  let baseRadius = ent.type === 'token' || ent.type === 'effect' ? 35 : 45;
  if (getCustomBounds) {
    const cb = getCustomBounds(ent);
    if (cb) {
      baseRadius = Math.max(cb.width, cb.height) / 2;
    }
  }
  const effectiveRadius = Math.max(25, baseRadius * Math.max(Math.abs(ent.scaleX), Math.abs(ent.scaleY)));
  const dist = Math.hypot(worldPos.x - ent.x, worldPos.y - ent.y);
  return dist <= effectiveRadius;
}

function sortByPriorityAndZ(list: Entity[]): Entity[] {
  return list.slice().sort((a, b) => {
    const pDiff = (TYPE_PRIORITY[b.type] ?? 0) - (TYPE_PRIORITY[a.type] ?? 0);
    if (pDiff !== 0) return pDiff;
    return (b.zIndex ?? 0) - (a.zIndex ?? 0);
  });
}

/**
 * Busca la entidad que debe seleccionarse al hacer clic en worldPos.
 *
 * Orden estricto de prioridad al hacer clic:
 * 1. Entidades no bloqueadas que no son mapa (tokens, objetos, efectos, puertas, luces).
 * 2. Entidades bloqueadas que no son mapa.
 * 3. Mapas no bloqueados.
 * 4. Los mapas bloqueados nunca se seleccionan al hacer clic en el tablero.
 */
export function findEntityAtPosition(
  entities: Entity[],
  worldPos: Point2D,
  zoom: number,
  getCustomBounds?: (ent: Entity) => { width: number; height: number } | null
): Entity | undefined {
  const matching = entities.filter((ent) => {
    // 4. Los mapas bloqueados nunca se seleccionan al hacer clic en el tablero
    if (ent.locked && ent.type === 'map') return false;
    return isEntityHit(ent, worldPos, zoom, entities, getCustomBounds);
  });

  if (matching.length === 0) return undefined;

  // 1. Entidades no bloqueadas que no son mapa (tokens, objetos, efectos, puertas, luces)
  const nonMapUnlocked = matching.filter((ent) => !ent.locked && ent.type !== 'map');
  if (nonMapUnlocked.length > 0) {
    return sortByPriorityAndZ(nonMapUnlocked)[0];
  }

  // 2. Entidades bloqueadas que no son mapa
  const nonMapLocked = matching.filter((ent) => ent.locked && ent.type !== 'map');
  if (nonMapLocked.length > 0) {
    return sortByPriorityAndZ(nonMapLocked)[0];
  }

  // 3. Mapas no bloqueados
  const unlockedMaps = matching.filter((ent) => !ent.locked && ent.type === 'map');
  if (unlockedMaps.length > 0) {
    return sortByPriorityAndZ(unlockedMaps)[0];
  }

  return undefined;
}
