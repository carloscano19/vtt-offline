import { Entity } from '../../types/entity';
import { CameraState, PlayerViewport } from '../../types/game';

export interface MapBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * Calcula los límites envolventes (bounding box) de todos los mapas en el tablero.
 */
export function getMapBoundingBox(entities: Entity[]): MapBoundingBox | null {
  const maps = entities.filter((e) => e.type === 'map');
  if (maps.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const m of maps) {
    const mW = (m.mapData?.gridWidth ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * (m.scaleX || 1);
    const mH = (m.mapData?.gridHeight ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * (m.scaleY || 1);
    minX = Math.min(minX, m.x);
    minY = Math.min(minY, m.y);
    maxX = Math.max(maxX, m.x + mW);
    maxY = Math.max(maxY, m.y + mH);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;

  const width = maxX - minX;
  const height = maxY - minY;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2
  };
}

/**
 * Calcula la posición y el zoom de cámara ideales para mostrar todo el mapa dentro de una ventana/viewport.
 */
export function fitMapInViewport(
  entities: Entity[],
  viewport?: PlayerViewport | { width: number; height: number },
  paddingFactor: number = 0.95
): CameraState | null {
  const bbox = getMapBoundingBox(entities);
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;

  const vpW = Math.max(200, viewport?.width || 1920);
  const vpH = Math.max(200, viewport?.height || 1080);

  const zoomX = (vpW * paddingFactor) / bbox.width;
  const zoomY = (vpH * paddingFactor) / bbox.height;
  const fitZoom = Math.max(0.05, Math.min(4.0, Math.min(zoomX, zoomY)));

  return {
    x: bbox.centerX,
    y: bbox.centerY,
    zoom: fitZoom
  };
}

/**
 * Comprueba si la cámara de la tele se encuentra absurdamente descalibrada (demasiado lejos o zoom extremo)
 * respecto al mapa principal.
 */
export function isPlayerCameraOutOfBounds(
  camera: CameraState,
  entities: Entity[]
): boolean {
  const bbox = getMapBoundingBox(entities);
  if (!bbox) return false;

  // Zoom absurdo: menor que 0.06 o mayor que 3.5
  if (!camera.zoom || camera.zoom < 0.06 || camera.zoom > 3.5) {
    return true;
  }

  // Distancia del centro de cámara al centro del mapa mayor a 2 veces la dimensión mayor del mapa
  const maxDim = Math.max(bbox.width, bbox.height);
  const dist = Math.hypot(camera.x - bbox.centerX, camera.y - bbox.centerY);
  if (dist > maxDim * 2) {
    return true;
  }

  return false;
}
