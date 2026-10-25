import JSZip from 'jszip';
import { db, saveAsset } from '../../db/dexie';
import { GameState, AssetItem } from '../../types/game';
import { normalizeGameState } from './normalizer';

export async function exportVttSave(state: GameState): Promise<Blob> {
  const zip = new JSZip();

  // 1. Añadir el estado del juego
  zip.file('game.json', JSON.stringify(state, null, 2));

  // 2. Recopilar todos los assetIds utilizados por entidades
  const assetIds = new Set<string>();
  for (const ent of state.entities) {
    if (ent.assetId) {
      assetIds.add(ent.assetId);
    }
  }

  // 3. Buscar y añadir cada asset al ZIP
  const assetsFolder = zip.folder('assets');
  const assetMetadataList: Omit<AssetItem, 'blob'>[] = [];

  for (const assetId of assetIds) {
    const asset = await db.assets.get(assetId);
    if (asset && asset.blob) {
      assetsFolder?.file(asset.id, asset.blob);
      assetMetadataList.push({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        mimeType: asset.mimeType,
        tags: asset.tags,
        createdAt: asset.createdAt,
        width: asset.width,
        height: asset.height
      });
    }
  }

  zip.file('assets_metadata.json', JSON.stringify(assetMetadataList, null, 2));

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

export async function importVttSave(buffer: ArrayBuffer): Promise<GameState> {
  const zip = await JSZip.loadAsync(buffer);

  const gameFile = zip.file('game.json');
  if (!gameFile) {
    throw new Error('El archivo .vttsave no contiene un game.json válido.');
  }

  const gameJsonText = await gameFile.async('text');
  const state: GameState = JSON.parse(gameJsonText);

  // Leer metadatos de los assets si existen
  let metadataMap = new Map<string, Omit<AssetItem, 'blob'>>();
  const metaFile = zip.file('assets_metadata.json');
  if (metaFile) {
    const metaText = await metaFile.async('text');
    const metaList: Omit<AssetItem, 'blob'>[] = JSON.parse(metaText);
    for (const m of metaList) {
      metadataMap.set(m.id, m);
    }
  }

  // Importar cada asset a IndexedDB (Dexie)
  const assetsFolder = zip.folder('assets');
  if (assetsFolder) {
    const assetEntries = Object.entries(assetsFolder.files);
    for (const [relativePath, zipEntry] of assetEntries) {
      if (zipEntry.dir) continue;
      const assetId = relativePath.replace(/^assets\//, '');
      const blob = await zipEntry.async('blob');

      const meta = metadataMap.get(assetId);
      const assetItem: AssetItem = {
        id: assetId,
        name: meta?.name || `Asset ${assetId}`,
        type: meta?.type || 'image',
        mimeType: meta?.mimeType || blob.type || 'image/png',
        blob,
        tags: meta?.tags || [],
        createdAt: meta?.createdAt || Date.now(),
        width: meta?.width,
        height: meta?.height
      };

      await saveAsset(assetItem);
    }
  }

  return normalizeGameState(state);
}
