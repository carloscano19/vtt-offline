import { Texture } from 'pixi.js';
// @ts-ignore gifuct-js types
import { parseGIF, decompressFrames } from 'gifuct-js';

export interface AnimatedGifData {
  textures: Texture[];
  delays: number[];
  totalDurationMs: number;
  width: number;
  height: number;
}

const gifCache = new Map<string, AnimatedGifData>();

/**
 * Decodifica un GIF animado en un conjunto de texturas de Pixi sincronizadas con sus retardos.
 */
export async function decodeGifBlob(assetId: string, blob: Blob): Promise<AnimatedGifData | null> {
  if (gifCache.has(assetId)) {
    return gifCache.get(assetId)!;
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const gif = parseGIF(arrayBuffer);
    const frames = decompressFrames(gif, true);

    if (!frames || frames.length === 0) {
      return null;
    }

    const width = gif.lsd.width;
    const height = gif.lsd.height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const textures: Texture[] = [];
    const delays: number[] = [];
    let totalDurationMs = 0;

    let tempCanvas = document.createElement('canvas');
    let tempCtx = tempCanvas.getContext('2d');

    for (const frame of frames) {
      const frameDelay = frame.delay || 100; // ms
      delays.push(frameDelay);
      totalDurationMs += frameDelay;

      // Dimensiones del frame
      const fWidth = frame.dims.width;
      const fHeight = frame.dims.height;
      tempCanvas.width = fWidth;
      tempCanvas.height = fHeight;

      if (tempCtx) {
        const imgData = tempCtx.createImageData(fWidth, fHeight);
        imgData.data.set(frame.patch);
        tempCtx.putImageData(imgData, 0, 0);

        // Dibujar en el canvas acumulado
        ctx.drawImage(tempCanvas, frame.dims.left, frame.dims.top);

        // Crear canvas independiente para la textura de este frame
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = width;
        frameCanvas.height = height;
        const fCtx = frameCanvas.getContext('2d');
        if (fCtx) {
          fCtx.drawImage(canvas, 0, 0);
          textures.push(Texture.from(frameCanvas));
        }
      }

      // Manejo de disposal
      if (frame.disposalType === 2) {
        // Restaurar a fondo
        ctx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
      }
    }

    if (totalDurationMs <= 0) totalDurationMs = 1000;

    const gifData: AnimatedGifData = {
      textures,
      delays,
      totalDurationMs,
      width,
      height
    };

    gifCache.set(assetId, gifData);
    return gifData;
  } catch (err) {
    console.error(`[gifDecoder] Error al decodificar GIF ID="${assetId}":`, err);
    return null;
  }
}

/**
 * Obtiene la textura correspondiente al milisegundo actual de la animación sincronizada.
 */
export function getFrameTextureForTime(gifData: AnimatedGifData, timeMs: number): Texture {
  if (gifData.textures.length === 1) return gifData.textures[0];
  const t = timeMs % gifData.totalDurationMs;
  let accumulated = 0;
  for (let i = 0; i < gifData.delays.length; i++) {
    accumulated += gifData.delays[i];
    if (t < accumulated) {
      return gifData.textures[i];
    }
  }
  return gifData.textures[gifData.textures.length - 1];
}
