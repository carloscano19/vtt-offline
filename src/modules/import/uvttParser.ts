import { UVTTData } from '../../types/uvtt';
import { MapData, MapWall, MapPortal, MapLight } from '../../types/entity';
import { parseColor, colorToHex } from '../../utils/color';

export interface ParsedUVTTResult {
  imageBlob: Blob;
  mimeType: string;
  pixelsPerGrid: number;
  gridWidth: number;
  gridHeight: number;
  widthPx: number;
  heightPx: number;
  mapData: MapData;
}

/**
 * Detecta el tipo MIME real a partir de los bytes mágicos de la cabecera
 */
export function detectMimeType(bytes: Uint8Array): string {
  if (bytes.length >= 12) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image/png';
    }
    // WebP: RIFF (bytes 0-3) y WEBP (bytes 8-11) - Formato estándar de Dungeondraft
    if (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
      return 'image/webp';
    }
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
    // GIF: GIF87a o GIF89a
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'image/gif';
    }
  }
  return 'image/webp'; // Fallback prioritario para Universal VTT / Dungeondraft
}

export function base64ToBlob(base64: string, fallbackMime?: string): { blob: Blob; mimeType: string } {
  let cleanBase64 = base64;
  let headerMime: string | undefined;

  if (base64.startsWith('data:')) {
    const parts = base64.split(',');
    const header = parts[0];
    cleanBase64 = parts[1];
    const match = header.match(/:(.*?);/);
    if (match) headerMime = match[1];
  }

  const byteCharacters = atob(cleanBase64);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  // Detectar MIME por bytes mágicos (más fiable que cabeceras)
  const mimeType = headerMime || detectMimeType(byteArray) || fallbackMime || 'image/webp';
  const blob = new Blob([byteArray], { type: mimeType });

  return { blob, mimeType };
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
      const parsedColor = parseColor(light.color, 0xffffff);
      const normalizedColor = colorToHex(parsedColor.rgb);
      const rawIntensity = light.intensity ?? 1;
      const intensity = rawIntensity * parsedColor.alpha;
      lights.push({
        position: {
          x: (light.position.x - originX) * ppg,
          y: (light.position.y - originY) * ppg
        },
        range: (light.range ?? 1) * ppg,
        color: normalizedColor,
        intensity,
        shadows: light.shadows
      });
    }
  }

  const { blob: imageBlob, mimeType } = base64ToBlob(data.image, 'image/webp');

  return {
    imageBlob,
    mimeType,
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
