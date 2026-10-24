import { db, StoredGame } from '../../db/dexie';
import { GameState } from '../../types/game';

export async function saveGameToDb(state: GameState): Promise<StoredGame> {
  const now = Date.now();
  const record: StoredGame = {
    id: state.id,
    name: state.name || 'Partida sin nombre',
    data: {
      ...state,
      updatedAt: now
    },
    createdAt: state.createdAt || now,
    updatedAt: now
  };

  await db.savedGames.put(record);
  return record;
}

export async function loadGameFromDb(id: string): Promise<GameState | null> {
  const record = await db.savedGames.get(id);
  return record ? record.data : null;
}

export async function listSavedGames(): Promise<StoredGame[]> {
  return await db.savedGames.orderBy('updatedAt').reverse().toArray();
}

export async function deleteSavedGame(id: string): Promise<void> {
  await db.savedGames.delete(id);
}

export async function saveAutoSaveToDb(state: GameState): Promise<void> {
  await db.autoSave.put({
    id: 'current',
    data: state,
    updatedAt: Date.now()
  });
}

export async function loadAutoSaveFromDb(): Promise<GameState | null> {
  const record = await db.autoSave.get('current');
  return record ? record.data : null;
}
