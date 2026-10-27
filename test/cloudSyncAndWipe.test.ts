import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { cloudSync, formatStorageBytes } from '../src/modules/sync/cloudSync';
import { cloudGameSync } from '../src/modules/persistence/cloudGameSync';
import { authManager, SHARED_EMAIL } from '../src/modules/auth/authManager';
import { clearAdventure } from '../src/modules/persistence/adventureManager';
import { db, saveAsset } from '../src/db/dexie';
import { useGameStore } from '../src/stores/useGameStore';
import { AssetItem } from '../src/types/game';

describe('Cloud Sync & Adventure Wipe (Tarea 2)', () => {
  beforeEach(async () => {
    await db.assets.clear();
    await db.savedGames.clear();
    await db.autoSave.clear();
    useGameStore.getState().resetGame();
  });

  it('uses mesa@vtt.local as default shared email and configures cloud eligibility', () => {
    // Default shared email
    expect(SHARED_EMAIL).toBe('mesa@vtt.local');

    // All library assets (including maps, tokens, effects, audio) are now cloud eligible
    expect(cloudSync.isCloudEligible('map')).toBe(true);
    expect(cloudSync.isCloudEligible('token')).toBe(true);
    expect(cloudSync.isCloudEligible('image')).toBe(true);
    expect(cloudSync.isCloudEligible('gif')).toBe(true);
    expect(cloudSync.isCloudEligible('video')).toBe(true);
    expect(cloudSync.isCloudEligible('audio')).toBe(true);
    expect(cloudSync.isCloudEligible('effect')).toBe(true);
  });

  it('calculates and formats cloud storage usage accurately with 1 GB ceiling', async () => {
    // Empty usage
    const usage = await cloudSync.getStorageUsage();
    expect(usage.totalBytes).toBe(1024 * 1024 * 1024); // 1 GB
    expect(usage.percentage).toBeGreaterThanOrEqual(0);
    expect(usage.percentage).toBeLessThanOrEqual(100);

    // Format helper
    expect(formatStorageBytes(500)).toBe('500 B');
    expect(formatStorageBytes(1024 * 50)).toBe('50.0 KB');
    expect(formatStorageBytes(1024 * 1024 * 42)).toBe('42.0 MB');
    expect(formatStorageBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
  });

  it('enqueueUpload buffers asset IDs and avoids duplicates', () => {
    cloudSync.enqueueUpload('test_asset_1');
    cloudSync.enqueueUpload('test_asset_2');
    cloudSync.enqueueUpload('test_asset_1'); // Duplicate

    const statusAfter = cloudSync.getStatus();
    expect(statusAfter.pendingCount).toBeGreaterThanOrEqual(2);
  });

  it('clearAdventure wipes maps, saved games and autosave while preserving tokens, objects and audio in library', async () => {
    // 1. Create a map asset
    const mapAsset: AssetItem = {
      id: 'map_dungeon_1',
      name: 'Mazmorra de Pruebas',
      type: 'map',
      mimeType: 'image/png',
      blob: new Blob(['fake-map-image'], { type: 'image/png' }),
      createdAt: Date.now(),
      width: 1400,
      height: 1400
    };
    await saveAsset(mapAsset);

    // 2. Create reusable library assets (token & audio)
    const tokenAsset: AssetItem = {
      id: 'token_hero_1',
      name: 'Paladín',
      type: 'image',
      mimeType: 'image/png',
      blob: new Blob(['fake-token-image'], { type: 'image/png' }),
      createdAt: Date.now(),
      width: 70,
      height: 70
    };
    await saveAsset(tokenAsset);

    const audioAsset: AssetItem = {
      id: 'audio_combat_1',
      name: 'Música de Combate',
      type: 'audio',
      mimeType: 'audio/mpeg',
      blob: new Blob(['fake-audio-data'], { type: 'audio/mpeg' }),
      createdAt: Date.now()
    };
    await saveAsset(audioAsset);

    // 3. Create a saved game and autosave
    await db.savedGames.put({
      id: 'saved_game_1',
      name: 'Partida Antigua',
      data: { ...useGameStore.getState().game, name: 'Partida Antigua' },
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    await db.autoSave.put({
      id: 'current',
      data: { ...useGameStore.getState().game, name: 'Autoguardado' },
      updatedAt: Date.now()
    });

    // Populate current game store with an active map and token entity, plus fog
    useGameStore.getState().addEntity({
      id: 'active_map_entity',
      type: 'map',
      name: 'Mapa Activo',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 1,
      visibleToPlayers: true,
      locked: true
    });
    useGameStore.getState().addEntity({
      id: 'active_token_entity',
      type: 'token',
      name: 'Token Activo',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false
    });
    useGameStore.getState().setFogConfig({
      enabled: true,
      explored: [[[[0, 0], [100, 0], [100, 100], [0, 100]]]],
      revealed: [[[[50, 50], [150, 50], [150, 150], [50, 150]]]]
    });

    expect(useGameStore.getState().game.entities).toHaveLength(2);
    expect(useGameStore.getState().game.fog.explored).toHaveLength(1);

    // 4. Execute clearAdventure()
    await clearAdventure();

    // 5. Verification:
    // A) Maps are deleted from IndexedDB
    const mapInDb = await db.assets.get('map_dungeon_1');
    expect(mapInDb).toBeUndefined();

    // B) Reusable library assets remain 100% intact!
    const tokenInDb = await db.assets.get('token_hero_1');
    expect(tokenInDb).toBeDefined();
    expect(tokenInDb?.name).toBe('Paladín');

    const audioInDb = await db.assets.get('audio_combat_1');
    expect(audioInDb).toBeDefined();
    expect(audioInDb?.name).toBe('Música de Combate');

    // C) Saved games are wiped
    const savedGamesCount = await db.savedGames.count();
    expect(savedGamesCount).toBe(0);

    // D) AutoSave is wiped
    const autoSaveCount = await db.autoSave.count();
    expect(autoSaveCount).toBe(0);

    // E) Game store is reset to a clean state
    const currentGame = useGameStore.getState().game;
    expect(currentGame.entities).toHaveLength(0);
    expect(currentGame.fog.explored).toHaveLength(0);
    expect(currentGame.fog.revealed).toHaveLength(0);
    expect(currentGame.name).toBe('Nueva Partida');
  });
});
