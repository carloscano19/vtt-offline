import Dexie, { type Table } from 'dexie';
import { AssetItem, GameState } from '../types/game';

export interface StoredGame {
  id: string;
  name: string;
  data: GameState;
  createdAt: number;
  updatedAt: number;
}

export interface AutoSaveRecord {
  id: string; // 'current'
  data: GameState;
  updatedAt: number;
}

export class VTTOfflineDatabase extends Dexie {
  assets!: Table<AssetItem, string>;
  savedGames!: Table<StoredGame, string>;
  autoSave!: Table<AutoSaveRecord, string>;

  constructor() {
    super('VTTOfflineDB');

    this.version(1).stores({
      assets: 'id, name, type, createdAt',
      savedGames: 'id, name, updatedAt, createdAt',
      autoSave: 'id, updatedAt'
    });
  }
}

export const db = new VTTOfflineDatabase();

// Asset repository helpers
export async function saveAsset(asset: AssetItem): Promise<string> {
  await db.assets.put(asset);
  return asset.id;
}

export async function getAsset(id: string): Promise<AssetItem | undefined> {
  return await db.assets.get(id);
}

export async function getAllAssets(): Promise<AssetItem[]> {
  return await db.assets.orderBy('createdAt').reverse().toArray();
}

export async function searchAssets(query: string): Promise<AssetItem[]> {
  const q = query.trim().toLowerCase();
  if (!q) return getAllAssets();

  return await db.assets
    .filter((asset) => Boolean(asset.name.toLowerCase().includes(q) || (asset.tags && asset.tags.some((t) => t.toLowerCase().includes(q)))))
    .toArray();
}

export async function deleteAsset(id: string): Promise<void> {
  await db.assets.delete(id);
}

export async function updateAssetName(id: string, name: string): Promise<void> {
  await db.assets.update(id, { name });
}
