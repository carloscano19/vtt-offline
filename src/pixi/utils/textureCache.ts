import { Assets, Texture } from 'pixi.js';
import { getAsset } from '../../db/dexie';

const cache = new Map<string, Texture>();
const objectUrlMap = new Map<string, string>();

/**
 * Carga una textura PixiJS a partir de un assetId almacenado en Dexie.
 * La textura se cachea en memoria para evitar recargas constantes.
 */
export async function getTextureForAsset(assetId: string): Promise<Texture | null> {
  if (!assetId) return null;

  if (cache.has(assetId)) {
    return cache.get(assetId)!;
  }

  const asset = await getAsset(assetId);
  if (!asset || !asset.blob) {
    console.warn(`[textureCache] No se encontró el asset con id: ${assetId}`);
    return null;
  }

  let objectUrl = objectUrlMap.get(assetId);
  if (!objectUrl) {
    objectUrl = URL.createObjectURL(asset.blob);
    objectUrlMap.set(assetId, objectUrl);
  }

  try {
    const texture = await Assets.load(objectUrl);
    cache.set(assetId, texture);
    return texture;
  } catch (err) {
    console.error(`[textureCache] Error al cargar la textura para el asset ${assetId}:`, err);
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
