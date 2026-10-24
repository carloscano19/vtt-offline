import { Texture } from 'pixi.js';
import { getAsset } from '../../db/dexie';

const cache = new Map<string, Texture>();
const objectUrlMap = new Map<string, string>();

/**
 * Carga una textura PixiJS a partir de un assetId almacenado en Dexie.
 * Utiliza HTMLImageElement y decode() para máxima robustez ante URLs blob sin extensión (WebP, PNG, etc.).
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
