/**
 * Módulo de utilidades matemáticas y procesamiento de Chroma Key.
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export function parseHexColor(hex: string): RgbColor {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (clean.length === 3) {
    const r = (num >> 8) & 0xf;
    const g = (num >> 4) & 0xf;
    const b = num & 0xf;
    return { r: (r << 4) | r, g: (g << 4) | g, b: (b << 4) | b };
  }
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff
  };
}

/**
 * Calcula la distancia Euclidiana en el espacio RGB normalizado (0.0 a 1.0).
 */
export function rgbDistance(c1: RgbColor, c2: RgbColor): number {
  const dr = (c1.r - c2.r) / 255;
  const dg = (c1.g - c2.g) / 255;
  const db = (c1.b - c2.b) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Comprueba si un píxel (r, g, b en rango 0-255) coincide con el color clave
 * dentro de la tolerancia especificada (0 a 100).
 */
export function isColorChromaKeyed(
  r: number,
  g: number,
  b: number,
  keyColorHex: string,
  tolerance: number
): boolean {
  if (tolerance <= 0) return false;
  const target = parseHexColor(keyColorHex);
  const dist = rgbDistance({ r, g, b }, target);
  // Tolerancia 0-100 mapeada a distancia máxima ~ 1.73 (sqrt(3))
  const maxDistance = (tolerance / 100) * 1.732;
  return dist <= maxDistance;
}

/**
 * Aplica chroma key a un ImageData de Canvas eliminando los píxeles coincidentes.
 */
export function applyChromaKeyToImageData(
  imageData: ImageData,
  keyColorHex: string,
  tolerance: number
): void {
  if (tolerance <= 0) return;
  const target = parseHexColor(keyColorHex);
  const maxDistance = (tolerance / 100) * 1.732;
  const data = imageData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dr = (r - target.r) / 255;
    const dg = (g - target.g) / 255;
    const db = (b - target.b) / 255;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist <= maxDistance) {
      data[i + 3] = 0; // Transparente
    } else if (dist < maxDistance + 0.1) {
      // Suavizado de bordes (feathering)
      const alphaFactor = (dist - maxDistance) / 0.1;
      data[i + 3] = Math.round(data[i + 3] * alphaFactor);
    }
  }
}
