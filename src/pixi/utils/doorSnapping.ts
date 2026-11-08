import { Entity, Point2D, recalculateDoorEndpoints } from '../../types/entity';
import { localToWorld } from './coordinates';
import { getAllWallSegments } from '../../modules/walls/wallManager';

const RIGHT_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI];
const FIVE_DEGREES_RAD = (5 * Math.PI) / 180;
const FIFTEEN_DEGREES_RAD = (15 * Math.PI) / 180;

/**
 * Imanta la rotación de la puerta:
 * - Con Shift: pasos de 15°.
 * - Sin Shift: si está a ±5° de 0°, 90°, 180° o 270°, se imanta al ángulo recto más cercano.
 */
export function snapDoorRotation(rawAngleRad: number, isShift: boolean): number {
  if (isShift) {
    return Math.round(rawAngleRad / FIFTEEN_DEGREES_RAD) * FIFTEEN_DEGREES_RAD;
  }

  const TWO_PI = Math.PI * 2;
  const norm = ((rawAngleRad % TWO_PI) + TWO_PI) % TWO_PI;

  for (const target of RIGHT_ANGLES) {
    if (Math.abs(norm - target) <= FIVE_DEGREES_RAD) {
      const diff = (target % TWO_PI) - norm;
      return rawAngleRad + diff;
    }
  }

  return rawAngleRad;
}

/**
 * Encuentra el extremo de pared más cercano a un punto objetivo dentro del umbral en el mundo.
 * Excluye la puerta que se está manipulando.
 */
export function findNearbyWallEndpoint(
  targetPt: Point2D,
  allEntities: Entity[],
  excludeDoorId?: string,
  maxDistWorld: number = 10
): Point2D | null {
  const wallSegments = getAllWallSegments(allEntities);
  let closest: Point2D | null = null;
  let minDist = maxDistWorld;

  for (const seg of wallSegments) {
    if (excludeDoorId && seg.entityId === excludeDoorId) continue;

    const d1 = Math.hypot(targetPt.x - seg.p1.x, targetPt.y - seg.p1.y);
    if (d1 <= minDist) {
      minDist = d1;
      closest = seg.p1;
    }

    const d2 = Math.hypot(targetPt.x - seg.p2.x, targetPt.y - seg.p2.y);
    if (d2 <= minDist) {
      minDist = d2;
      closest = seg.p2;
    }
  }

  return closest;
}

/**
 * Imanta el desplazamiento de la puerta para que su bisagra (p1) o punta (p2)
 * encajen en el extremo de pared más cercano a menos de 10 px en pantalla.
 * Con Alt (!isAlt false), desactiva el imán.
 */
export function snapDoorMovement(
  doorEntity: Entity,
  candidateLocalX: number,
  candidateLocalY: number,
  allEntities: Entity[],
  cameraZoom: number,
  isAlt: boolean
): { x: number; y: number } {
  if (isAlt || !doorEntity.door) {
    return { x: candidateLocalX, y: candidateLocalY };
  }

  const maxDistWorld = 10 / Math.max(0.01, cameraZoom);
  const parentMap = doorEntity.mapId ? allEntities.find((m) => m.id === doorEntity.mapId) : undefined;
  const mapPos = parentMap ? { x: parentMap.x, y: parentMap.y } : { x: 0, y: 0 };
  const mapRot = parentMap ? parentMap.rotation : 0;
  const mapScaleX = parentMap ? parentMap.scaleX : 1;
  const mapScaleY = parentMap ? parentMap.scaleY : 1;

  const length = doorEntity.door.length ?? 70;
  const isInv = doorEntity.door.isHingeInverted ?? false;
  const { p1: localP1, p2: localP2 } = recalculateDoorEndpoints(
    candidateLocalX,
    candidateLocalY,
    doorEntity.rotation,
    length,
    isInv
  );

  const p1World = parentMap
    ? localToWorld(localP1, mapPos, mapRot, mapScaleX, mapScaleY)
    : localP1;
  const p2World = parentMap
    ? localToWorld(localP2, mapPos, mapRot, mapScaleX, mapScaleY)
    : localP2;

  const snapW1 = findNearbyWallEndpoint(p1World, allEntities, doorEntity.id, maxDistWorld);
  const snapW2 = findNearbyWallEndpoint(p2World, allEntities, doorEntity.id, maxDistWorld);

  let targetSnapWorld: Point2D | null = null;
  let fromPointWorld: Point2D | null = null;

  if (snapW1 && snapW2) {
    const d1 = Math.hypot(p1World.x - snapW1.x, p1World.y - snapW1.y);
    const d2 = Math.hypot(p2World.x - snapW2.x, p2World.y - snapW2.y);
    if (d1 <= d2) {
      targetSnapWorld = snapW1;
      fromPointWorld = p1World;
    } else {
      targetSnapWorld = snapW2;
      fromPointWorld = p2World;
    }
  } else if (snapW1) {
    targetSnapWorld = snapW1;
    fromPointWorld = p1World;
  } else if (snapW2) {
    targetSnapWorld = snapW2;
    fromPointWorld = p2World;
  }

  if (targetSnapWorld && fromPointWorld) {
    const offsetWorld = {
      x: targetSnapWorld.x - fromPointWorld.x,
      y: targetSnapWorld.y - fromPointWorld.y
    };

    if (parentMap) {
      const cosM = Math.cos(mapRot);
      const sinM = Math.sin(mapRot);
      const localOffsetX = (offsetWorld.x * cosM + offsetWorld.y * sinM) / mapScaleX;
      const localOffsetY = (-offsetWorld.x * sinM + offsetWorld.y * cosM) / mapScaleY;
      return {
        x: candidateLocalX + localOffsetX,
        y: candidateLocalY + localOffsetY
      };
    }

    return {
      x: candidateLocalX + offsetWorld.x,
      y: candidateLocalY + offsetWorld.y
    };
  }

  return { x: candidateLocalX, y: candidateLocalY };
}

/**
 * Imanta el estiramiento del largo de la puerta para que sus extremos (p1 / p2)
 * encajen en el extremo de pared más cercano a menos de 10 px en pantalla.
 * Con Alt, desactiva el imán.
 */
export function snapDoorLength(
  doorEntity: Entity,
  rawLength: number,
  allEntities: Entity[],
  cameraZoom: number,
  isAlt: boolean
): number {
  if (isAlt || !doorEntity.door) {
    return Math.max(10, rawLength);
  }

  const maxDistWorld = 10 / Math.max(0.01, cameraZoom);
  const parentMap = doorEntity.mapId ? allEntities.find((m) => m.id === doorEntity.mapId) : undefined;
  const mapPos = parentMap ? { x: parentMap.x, y: parentMap.y } : { x: 0, y: 0 };
  const mapRot = parentMap ? parentMap.rotation : 0;
  const mapScaleX = parentMap ? parentMap.scaleX : 1;
  const mapScaleY = parentMap ? parentMap.scaleY : 1;

  const centerWorld = parentMap
    ? localToWorld({ x: doorEntity.x, y: doorEntity.y }, mapPos, mapRot, mapScaleX, mapScaleY)
    : { x: doorEntity.x, y: doorEntity.y };

  const isInv = doorEntity.door.isHingeInverted ?? false;
  const { p1: localP1, p2: localP2 } = recalculateDoorEndpoints(
    doorEntity.x,
    doorEntity.y,
    doorEntity.rotation,
    rawLength,
    isInv
  );

  const p1World = parentMap
    ? localToWorld(localP1, mapPos, mapRot, mapScaleX, mapScaleY)
    : localP1;
  const p2World = parentMap
    ? localToWorld(localP2, mapPos, mapRot, mapScaleX, mapScaleY)
    : localP2;

  const snapW1 = findNearbyWallEndpoint(p1World, allEntities, doorEntity.id, maxDistWorld);
  const snapW2 = findNearbyWallEndpoint(p2World, allEntities, doorEntity.id, maxDistWorld);

  if (snapW1 && snapW2) {
    return Math.max(10, Math.hypot(snapW2.x - snapW1.x, snapW2.y - snapW1.y));
  } else if (snapW2) {
    return Math.max(10, 2 * Math.hypot(snapW2.x - centerWorld.x, snapW2.y - centerWorld.y));
  } else if (snapW1) {
    return Math.max(10, 2 * Math.hypot(snapW1.x - centerWorld.x, snapW1.y - centerWorld.y));
  }

  return Math.max(10, rawLength);
}
