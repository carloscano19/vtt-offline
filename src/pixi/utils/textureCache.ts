import { Texture } from 'pixi.js';
import { getAsset } from '../../db/dexie';
import { videoManager } from '../../modules/media/videoManager';
import { decodeGifBlob, AnimatedGifData, getFrameTextureForTime } from '../../modules/media/gifDecoder';

const cache = new Map<string, Texture>();
const objectUrlMap = new Map<string, string>();
const gifDataMap = new Map<string, AnimatedGifData>();

export async function getGifDataForAsset(assetId: string): Promise<AnimatedGifData | null> {
  if (gifDataMap.has(assetId)) {
    return gifDataMap.get(assetId)!;
  }
  const asset = await getAsset(assetId);
  if (!asset || !asset.blob) return null;
  const isGif = asset.type === 'gif' || asset.mimeType === 'image/gif';
  if (!isGif) return null;
  const data = await decodeGifBlob(assetId, asset.blob);
  if (data) {
    gifDataMap.set(assetId, data);
  }
  return data;
}

/**
 * Carga una textura PixiJS a partir de un assetId almacenado en Dexie.
 * Soporta imágenes normales, GIFs animados decodificados y vídeos HTML5 en bucle.
 */
export async function getTextureForAsset(assetId: string): Promise<Texture | null> {
  if (!assetId) return null;

  if (cache.has(assetId)) {
    return cache.get(assetId)!;
  }

  const asset = await getAsset(assetId);
  if (!asset || !asset.blob) {
    console.error(`[textureCache] No se encontró el asset en Dexie: ID "${assetId}"`);
    return null;
  }

  // 1. Soporte de Vídeo (MP4, WebM)
  if (asset.type === 'video' || asset.mimeType.startsWith('video/')) {
    const videoResult = await videoManager.getVideoTexture(assetId);
    if (videoResult) {
      cache.set(assetId, videoResult.texture);
      return videoResult.texture;
    }
  }

  // 2. Soporte de GIF animado con decodificador
  if (asset.type === 'gif' || asset.mimeType === 'image/gif') {
    const gifData = await decodeGifBlob(assetId, asset.blob);
    if (gifData && gifData.textures.length > 0) {
      gifDataMap.set(assetId, gifData);
      cache.set(assetId, gifData.textures[0]);
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

    // Crear textura a partir del elemento HTMLImage ya decodificado
    const texture = Texture.from(img);
    cache.set(assetId, texture);
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
