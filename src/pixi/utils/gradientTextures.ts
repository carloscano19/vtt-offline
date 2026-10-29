import { Texture } from 'pixi.js';

const dimGradientCache = new Map<number, Texture>();
const tintGradientCache = new Map<number, Texture>();

/**
 * Genera o recupera de caché una textura continua de degradado radial (256x256):
 * - Desde r = 0 hasta r = ratio: completamente transparente (alpha = 0).
 * - Desde r = ratio hasta r = 1: transición continua suave (curva coseno C1 sin escalones ni líneas) de 0 a 1.
 * - En r = 1 y fuera de r = 1 (esquinas del canvas): alpha = 1.0 (opaco total).
 * Esto permite que con blendMode 'min', fuera de r = 1 no afecte a la oscuridad base, y en el borde
 * exterior se una de forma continua e imperceptible con la niebla o la oscuridad exterior.
 */
export function getDimRadialGradientTexture(ratio: number): Texture {
  const clampedRatio = Math.max(0, Math.min(0.96, Math.round(ratio * 50) / 50));
  if (dimGradientCache.has(clampedRatio)) {
    return dimGradientCache.get(clampedRatio)!;
  }

  if (typeof document === 'undefined') {
    return Texture.WHITE;
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Texture.WHITE;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r1 = cx;
  const r0 = Math.max(0, r1 * clampedRatio);

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r1);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
  if (clampedRatio > 0.001) {
    grad.addColorStop(clampedRatio, 'rgba(255, 255, 255, 0.0)');
  }

  const steps = 32;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const t = clampedRatio + u * (1 - clampedRatio);
    // Curva coseno suave C1: derivada cero tanto en el radio claro como en el radio tenue exterior
    const smoothAlpha = 0.5 * (1 - Math.cos(u * Math.PI));
    grad.addColorStop(Math.min(1.0, t), `rgba(255, 255, 255, ${smoothAlpha.toFixed(4)})`);
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = Texture.from(canvas);
  dimGradientCache.set(clampedRatio, texture);
  return texture;
}

/**
 * Genera o recupera de caché una textura continua de tinte radial inverso (256x256):
 * - Desde r = 0 hasta r = ratio: completamente opaco (alpha = 1.0).
 * - Desde r = ratio hasta r = 1: transición continua suave (curva coseno C1) de 1 a 0.
 * - En r = 1 y fuera de r = 1: alpha = 0.0 (totalmente transparente).
 */
export function getTintRadialGradientTexture(ratio: number): Texture {
  const clampedRatio = Math.max(0, Math.min(0.96, Math.round(ratio * 50) / 50));
  if (tintGradientCache.has(clampedRatio)) {
    return tintGradientCache.get(clampedRatio)!;
  }

  if (typeof document === 'undefined') {
    return Texture.WHITE;
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Texture.WHITE;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r1 = cx;
  const r0 = Math.max(0, r1 * clampedRatio);

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r1);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  if (clampedRatio > 0.001) {
    grad.addColorStop(clampedRatio, 'rgba(255, 255, 255, 1.0)');
  }

  const steps = 32;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const t = clampedRatio + u * (1 - clampedRatio);
    const smoothAlpha = 0.5 * (1 + Math.cos(u * Math.PI));
    grad.addColorStop(Math.min(1.0, t), `rgba(255, 255, 255, ${smoothAlpha.toFixed(4)})`);
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r1, 0, Math.PI * 2);
  ctx.fill();

  const texture = Texture.from(canvas);
  tintGradientCache.set(clampedRatio, texture);
  return texture;
}
