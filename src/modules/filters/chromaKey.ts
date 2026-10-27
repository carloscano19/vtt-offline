/**
 * Módulo de utilidades matemáticas y procesamiento de Chroma Key.
 */

import { parseColor, rgbComponents } from '../../utils/color';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export function parseHexColor(hex: string): RgbColor {
  const { rgb } = parseColor(hex, 0x00ff00);
  return rgbComponents(rgb);
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
 * Incluye borde suave (feathering) para evitar bordes duros/dentados.
 */
export function applyChromaKeyToImageData(
  imageData: ImageData,
  keyColorHex: string,
  tolerance: number
): void {
  if (tolerance <= 0) return;
  const target = parseHexColor(keyColorHex);
  // Tolerancia 0-100 mapeada a distancia RGB
  const maxDistance = (tolerance / 100) * 1.732;
  // Borde suave: margen de feathering proporcional (al menos 0.08 o el 15% del umbral)
  const featherRange = Math.max(0.08, maxDistance * 0.15);

  const data = imageData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue; // Ya transparente

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dr = (r - target.r) / 255;
    const dg = (g - target.g) / 255;
    const db = (b - target.b) / 255;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist <= maxDistance) {
      // Coincidencia dentro de la tolerancia: 100% transparente
      data[i + 3] = 0;
    } else if (dist < maxDistance + featherRange) {
      // Borde suave (feathering gradual entre maxDistance y maxDistance + featherRange)
      const factor = (dist - maxDistance) / featherRange;
      data[i + 3] = Math.round(a * Math.min(1, Math.max(0, factor)));
    }
  }
}
