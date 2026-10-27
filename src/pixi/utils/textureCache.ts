import { Texture } from 'pixi.js';
import { getAsset } from '../../db/dexie';
import { videoManager } from '../../modules/media/videoManager';
import { decodeGifBlob, AnimatedGifData, getFrameTextureForTime } from '../../modules/media/gifDecoder';
import { EntityChromaKey } from '../../types/entity';
import { applyChromaKeyToImageData } from '../../modules/filters/chromaKey';

const cache = new Map<string, Texture>();
const objectUrlMap = new Map<string, string>();
const gifDataMap = new Map<string, AnimatedGifData>();

function getTextureCacheKey(assetId: string, chromaKey?: EntityChromaKey): string {
  if (chromaKey && chromaKey.enabled) {
    return `${assetId}_ck_${chromaKey.color}_${chromaKey.tolerance}`;
  }
  return assetId;
}

export async function getGifDataForAsset(
  assetId: string,
  chromaKey?: EntityChromaKey
): Promise<AnimatedGifData | null> {
  const cacheKey = getTextureCacheKey(assetId, chromaKey);
  if (gifDataMap.has(cacheKey)) {
    return gifDataMap.get(cacheKey)!;
  }
  const asset = await getAsset(assetId);
  if (!asset || !asset.blob) return null;
  const isGif = asset.type === 'gif' || asset.mimeType === 'image/gif';
  if (!isGif) return null;
  const data = await decodeGifBlob(assetId, asset.blob, chromaKey);
  if (data) {
    gifDataMap.set(cacheKey, data);
  }
  return data;
}

/**
 * Carga una textura PixiJS a partir de un assetId almacenado en Dexie.
 * Soporta imágenes normales (PNG/JPG con Chroma Key procesado en canvas), GIFs animados y vídeos HTML5.
 * Cachea por assetId + color + tolerancia.
 */
export async function getTextureForAsset(
  assetId: string,
  chromaKey?: EntityChromaKey
): Promise<Texture | null> {
  if (!assetId) return null;

  const cacheKey = getTextureCacheKey(assetId, chromaKey);
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const asset = await getAsset(assetId);
  if (!asset || !asset.blob) {
    console.error(`[textureCache] No se encontró el asset en Dexie: ID "${assetId}"`);
    return null;
  }

  // 1. Soporte de Vídeo (MP4, WebM)
  if (asset.type === 'video' || asset.mimeType.startsWith('video/')) {
    const videoResult = await videoManager.getVideoTexture(assetId, chromaKey);
    if (videoResult) {
      cache.set(cacheKey, videoResult.texture);
      return videoResult.texture;
    }
  }

  // 2. Soporte de GIF animado con decodificador
  if (asset.type === 'gif' || asset.mimeType === 'image/gif') {
    const gifData = await decodeGifBlob(assetId, asset.blob, chromaKey);
    if (gifData && gifData.textures.length > 0) {
      gifDataMap.set(cacheKey, gifData);
      cache.set(cacheKey, gifData.textures[0]);
      return gifData.textures[0];
    }
  }

  let objectUrl = objectUrlMap.get(assetId);
  if (!objectUrl) {
    objectUrl = URL.createObjectURL(asset.blob);
    objectUrlMap.set(assetId, objectUrl);
  }

  try {
    const img = new Image();
    img.src = objectUrl;

    // img.decode() decodifica de forma asíncrona la imagen en GPU/memoria
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
      });
    }

    // 3. Soporte de Chroma Key para imágenes estáticas (PNG, JPG, WebP)
    if (chromaKey && chromaKey.enabled) {
      const natW = img.naturalWidth || img.width;
      const natH = img.naturalHeight || img.height;
      const canvas = document.createElement('canvas');
      canvas.width = natW;
      canvas.height = natH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, natW, natH);
        applyChromaKeyToImageData(imgData, chromaKey.color, chromaKey.tolerance);
        ctx.putImageData(imgData, 0, 0);
        const texture = Texture.from(canvas);
        cache.set(cacheKey, texture);
        return texture;
      }
    }

    // Crear textura a partir del elemento HTMLImage normal
    const texture = Texture.from(img);
    cache.set(cacheKey, texture);
    return texture;
  } catch (err) {
    console.error(
      `[textureCache] Error crítico al cargar textura para asset: ID="${asset.id}", Nombre="${asset.name}", Tipo="${asset.type}", MIME="${asset.mimeType}":`,
      err
    );
    return null;
  }
}

/**
 * Registra o reemplaza directamente una textura en caché para un assetId
 */
export function setCachedTexture(assetId: string, texture: Texture) {
  cache.set(assetId, texture);
}

const textureInvalidatedListeners = new Set<(assetId: string) => void>();

export function onTextureInvalidated(listener: (assetId: string) => void): () => void {
  textureInvalidatedListeners.add(listener);
  return () => {
    textureInvalidatedListeners.delete(listener);
  };
}

/**
 * Invalida texturas en caché, URLs de objeto y decodificaciones cuando un asset
 * se descarga de la nube o se actualiza.
 */
export function invalidateCachedTexture(assetId: string) {
  for (const key of Array.from(cache.keys())) {
    if (key === assetId || key.startsWith(`${assetId}_ck_`)) {
      const tex = cache.get(key);
      if (tex && tex !== Texture.EMPTY) {
        try {
          tex.destroy(true);
        } catch {}
      }
      cache.delete(key);
    }
  }

  if (objectUrlMap.has(assetId)) {
    const url = objectUrlMap.get(assetId)!;
    try {
      URL.revokeObjectURL(url);
    } catch {}
    objectUrlMap.delete(assetId);
  }

  for (const key of Array.from(gifDataMap.keys())) {
    if (key === assetId || key.startsWith(`${assetId}_ck_`)) {
      gifDataMap.delete(key);
    }
  }

  videoManager.invalidateAsset(assetId);

  for (const listener of textureInvalidatedListeners) {
    try {
      listener(assetId);
    } catch (e) {
      console.warn('[textureCache] Error en listener de invalidación:', e);
    }
  }
}

/**
 * Limpia los ObjectURLs y la memoria de texturas cuando sea necesario
 */
export function clearTextureCache() {
  for (const url of objectUrlMap.values()) {
    URL.revokeObjectURL(url);
  }
  objectUrlMap.clear();
  cache.clear();
}
