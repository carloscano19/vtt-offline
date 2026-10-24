import { Point2D } from '../../types/entity';
import { CameraState } from '../../types/game';

/**
 * Convierte coordenadas de pantalla (píxeles de ventana) a coordenadas del mundo (lienzo infinito)
 */
export function screenToWorld(screenPos: Point2D, camera: CameraState, canvasWidth: number, canvasHeight: number): Point2D {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  // En Pixi el mundo está centrado y desplazado por camera.x, camera.y y escalado por camera.zoom
  const worldX = (screenPos.x - centerX) / camera.zoom + camera.x;
  const worldY = (screenPos.y - centerY) / camera.zoom + camera.y;

  return { x: worldX, y: worldY };
}

/**
 * Convierte coordenadas del mundo a coordenadas de pantalla
 */
export function worldToScreen(worldPos: Point2D, camera: CameraState, canvasWidth: number, canvasHeight: number): Point2D {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  const screenX = (worldPos.x - camera.x) * camera.zoom + centerX;
  const screenY = (worldPos.y - camera.y) * camera.zoom + centerY;

  return { x: screenX, y: screenY };
}

/**
 * Ajusta un punto a la intersección de cuadrícula más cercana
 */
export function snapPointToGrid(pos: Point2D, gridSize: number): Point2D {
  if (gridSize <= 0) return pos;
  return {
    x: Math.round(pos.x / gridSize) * gridSize,
    y: Math.round(pos.y / gridSize) * gridSize
  };
}

/**
 * Transforma un punto local de una entidad (ej: pared de mapa) a coordenadas globales del mundo
 */
export function localToWorld(
  localPoint: Point2D,
  entityPos: Point2D,
  rotation: number,
  scaleX: number,
  scaleY: number
): Point2D {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const scaledX = localPoint.x * scaleX;
  const scaledY = localPoint.y * scaleY;

  const rotatedX = scaledX * cos - scaledY * sin;
  const rotatedY = scaledX * sin + scaledY * cos;

  return {
    x: entityPos.x + rotatedX,
    y: entityPos.y + rotatedY
  };
}

/**
 * Transforma un punto de coordenadas globales del mundo a coordenadas locales de una entidad/mapa
 */
export function worldToLocal(
  worldPoint: Point2D,
  entityPos: Point2D,
  rotation: number,
  scaleX: number,
  scaleY: number
): Point2D {
  const dx = worldPoint.x - entityPos.x;
  const dy = worldPoint.y - entityPos.y;

  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);

  const unrotatedX = dx * cos - dy * sin;
  const unrotatedY = dx * sin + dy * cos;

  return {
    x: scaleX !== 0 ? unrotatedX / scaleX : unrotatedX,
    y: scaleY !== 0 ? unrotatedY / scaleY : unrotatedY
  };
}
