import { UVTTData } from '../../types/uvtt';
import { MapData, MapWall, MapPortal, MapLight } from '../../types/entity';

export interface ParsedUVTTResult {
  imageBlob: Blob;
  pixelsPerGrid: number;
  gridWidth: number;
  gridHeight: number;
  widthPx: number;
  heightPx: number;
  mapData: MapData;
}

export function base64ToBlob(base64: string, mimeType = 'image/png'): Blob {
  // Manejo de data URL si contiene cabecera data:image/...;base64,
  let cleanBase64 = base64;
  let detectedMime = mimeType;
  if (base64.startsWith('data:')) {
    const parts = base64.split(',');
    const header = parts[0];
    cleanBase64 = parts[1];
    const match = header.match(/:(.*?);/);
    if (match) detectedMime = match[1];
  }

  const byteCharacters = atob(cleanBase64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: detectedMime });
}

export function parseUVTT(jsonString: string): ParsedUVTTResult {
  const data: UVTTData = JSON.parse(jsonString);

  if (!data.resolution) {
    throw new Error('El archivo UVTT no contiene el bloque de resolución requerido.');
  }

  const { map_origin, map_size, pixels_per_grid } = data.resolution;
  const originX = map_origin?.x ?? 0;
  const originY = map_origin?.y ?? 0;
  const ppg = pixels_per_grid || 70;

  const gridWidth = map_size?.x ?? 10;
  const gridHeight = map_size?.y ?? 10;
  const widthPx = gridWidth * ppg;
  const heightPx = gridHeight * ppg;

  // Convertir paredes (line_of_sight y objects_line_of_sight) a píxeles locales del mapa
  const walls: MapWall[] = [];

  const processLineSegments = (segments?: Array<Array<{ x: number; y: number }>>) => {
    if (!segments || !Array.isArray(segments)) return;
    for (const poly of segments) {
      if (!Array.isArray(poly) || poly.length < 2) continue;
      for (let i = 0; i < poly.length - 1; i++) {
        const ptA = poly[i];
        const ptB = poly[i + 1];
        walls.push({
          p1: {
            x: (ptA.x - originX) * ppg,
            y: (ptA.y - originY) * ppg
          },
          p2: {
            x: (ptB.x - originX) * ppg,
            y: (ptB.y - originY) * ppg
          }
        });
      }
    }
  };

  processLineSegments(data.line_of_sight);
  processLineSegments(data.objects_line_of_sight);

  // Convertir portales a coordenadas locales en píxeles
  const portals: MapPortal[] = [];
  if (Array.isArray(data.portals)) {
    for (const portal of data.portals) {
      if (!portal.bounds || portal.bounds.length < 2) continue;
      portals.push({
        position: {
          x: (portal.position.x - originX) * ppg,
          y: (portal.position.y - originY) * ppg
        },
        bounds: [
          {
            x: (portal.bounds[0].x - originX) * ppg,
            y: (portal.bounds[0].y - originY) * ppg
          },
          {
            x: (portal.bounds[1].x - originX) * ppg,
            y: (portal.bounds[1].y - originY) * ppg
          }
        ],
        rotation: portal.rotation ?? 0,
        closed: portal.closed ?? true,
        freestanding: portal.freestanding
      });
    }
  }

  // Convertir luces a coordenadas locales en píxeles
  const lights: MapLight[] = [];
  if (Array.isArray(data.lights)) {
    for (const light of data.lights) {
      lights.push({
        position: {
          x: (light.position.x - originX) * ppg,
          y: (light.position.y - originY) * ppg
        },
        range: (light.range ?? 1) * ppg,
        color: light.color?.startsWith('#') ? light.color : (light.color ? `#${light.color}` : '#ffffff'),
        intensity: light.intensity ?? 1,
        shadows: light.shadows
      });
    }
  }

  const imageBlob = base64ToBlob(data.image, 'image/png');

  return {
    imageBlob,
    pixelsPerGrid: ppg,
    gridWidth,
    gridHeight,
    widthPx,
    heightPx,
    mapData: {
      pixelsPerGrid: ppg,
      gridWidth,
      gridHeight,
      walls,
      portals,
      lights
    }
  };
}
