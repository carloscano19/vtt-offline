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

const coneTintGradientCache = new Map<string, Texture>();

/**
 * Genera o recupera de caché una textura continua de tinte para un cono direccional (256x256):
 * - Vértice en el centro (cx, cy).
 * - Dirección hacia +X (rotación 0).
 * - Apertura angular coneAngleDeg (10° a 180°).
 * - Borde radial: degradado suave C1 hacia radio exterior.
 * - Bordes laterales: ligero degradado suave (~4.5°) para no verse como línea de cuchillo.
 */
export function getConeTintGradientTexture(ratio: number, coneAngleDeg: number): Texture {
  const clampedRatio = Math.max(0, Math.min(0.96, Math.round(ratio * 50) / 50));
  const clampedAngle = Math.max(10, Math.min(180, Math.round(coneAngleDeg / 5) * 5));
  const cacheKey = `${clampedRatio}_${clampedAngle}`;

  if (coneTintGradientCache.has(cacheKey)) {
    return coneTintGradientCache.get(cacheKey)!;
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

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  const cx = size / 2;
  const cy = size / 2;
  const r1 = cx;
  const r0 = Math.max(0, r1 * clampedRatio);
  const halfAngle = (clampedAngle * Math.PI) / 360;
  const softAngle = Math.min(0.08, halfAngle * 0.2); // ~4.5 grados de desvanecimiento lateral

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > r1) continue;

      const angle = Math.abs(Math.atan2(dy, dx));
      if (angle > halfAngle) continue;

      // Factor radial
      let fRadial = 1.0;
      if (dist > r0) {
        const u = (dist - r0) / (r1 - r0);
        fRadial = 0.5 * (1 + Math.cos(u * Math.PI));
      }

      // Factor angular (desvanecimiento lateral suave)
      let fAngle = 1.0;
      if (angle > halfAngle - softAngle) {
        const v = (angle - (halfAngle - softAngle)) / softAngle;
        fAngle = 0.5 * (1 + Math.cos(v * Math.PI));
      }

      const alpha = Math.max(0, Math.min(1.0, fRadial * fAngle));
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = Texture.from(canvas);
  coneTintGradientCache.set(cacheKey, texture);
  return texture;
}
