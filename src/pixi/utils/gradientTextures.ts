import { Texture } from 'pixi.js';

const dimGradientCache = new Map<number, Texture>();
const tintGradientCache = new Map<number, Texture>();

/**
 * Genera o recupera de caché una textura continua de degradado radial (256x256):
 * - Desde r = 0 hasta r = ratio: completamente transparente (alpha = 0).
 * - Desde r = ratio hasta r = 1: transición continua suave (curva coseno C1 sin escalones ni líneas) de 0 a 1.
 * - En r = 1 (borde exterior): alcanza alpha 1 con derivada cero.
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
  const r0 = Math.max(0, cx * clampedRatio);
  const r1 = cx;

  const grad = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Curva coseno suave: derivada cero tanto en el radio claro como en el tenue exterior
    const smoothAlpha = 0.5 * (1 - Math.cos(t * Math.PI));
    grad.addColorStop(t, `rgba(255, 255, 255, ${smoothAlpha.toFixed(4)})`);
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r1, 0, Math.PI * 2);
  ctx.fill();

  const texture = Texture.from(canvas);
  dimGradientCache.set(clampedRatio, texture);
  return texture;
}

/**
 * Genera o recupera de caché una textura continua de tinte radial inverso (256x256):
 * - Desde r = 0 hasta r = ratio: completamente opaco (alpha = 1.0).
 * - Desde r = ratio hasta r = 1: transición continua suave (curva coseno C1) de 1 a 0.
 * - En r = 1 (borde exterior): se desvanece suavemente a 0 sin cortes.
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
  const r0 = Math.max(0, cx * clampedRatio);
  const r1 = cx;

  // 1. Zona central clara sólida si ratio > 0
  if (r0 > 0.5) {
    ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.beginPath();
    ctx.arc(cx, cy, r0 + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Zona tenue degradada de 1 a 0
  const grad = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const smoothAlpha = 0.5 * (1 + Math.cos(t * Math.PI));
    grad.addColorStop(t, `rgba(255, 255, 255, ${smoothAlpha.toFixed(4)})`);
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r1, 0, Math.PI * 2);
  ctx.fill();

  const texture = Texture.from(canvas);
  tintGradientCache.set(clampedRatio, texture);
  return texture;
}
