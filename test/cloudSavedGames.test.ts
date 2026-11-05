import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared in-memory tables for tests
const savedGamesTable = new Map<string, any>();
const gamesTable = new Map<string, any>();

vi.mock('../src/modules/supabase/supabaseClient', () => {
  return {
    isSupabaseConfigured: () => true,
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
      },
      from: (table: string) => {
        if (table === 'saved_games') {
          return {
            select: (fields: string) => ({
              order: () => {
                const rows = Array.from(savedGamesTable.values()).map((row) => {
                  const r: any = { ...row };
                  if (!fields.includes('data')) {
                    delete r.data;
                  }
                  return r;
                });
                return Promise.resolve({ data: rows, error: null });
              },
              eq: (_col: string, val: any) => ({
                maybeSingle: () => {
                  const found = savedGamesTable.get(val);
                  return Promise.resolve({ data: found ? { ...found } : null, error: null });
                }
              })
            }),
            upsert: (payload: any) => {
              const existing = savedGamesTable.get(payload.id) || {};
              savedGamesTable.set(payload.id, { ...existing, ...payload });
              return Promise.resolve({ data: payload, error: null });
            },
            update: (payload: any) => ({
              eq: (_col: string, val: any) => {
                const existing = savedGamesTable.get(val);
                if (existing) {
                  savedGamesTable.set(val, { ...existing, ...payload });
                }
                return Promise.resolve({ error: null });
              }
            }),
            delete: () => ({
              eq: (_col: string, val: any) => {
                savedGamesTable.delete(val);
                return Promise.resolve({ error: null });
              }
            })
          };
        }

        if (table === 'games') {
          return {
            select: () => ({
              eq: (_col: string, val: any) => ({
                maybeSingle: () => {
                  const found = gamesTable.get(val);
                  return Promise.resolve({ data: found ? { ...found } : null, error: null });
                }
              })
            }),
            upsert: (payload: any) => {
              gamesTable.set(payload.id, payload);
              return Promise.resolve({ error: null });
            },
            delete: () => ({
              eq: (_col: string, val: any) => {
                gamesTable.delete(val);
                return Promise.resolve({ error: null });
              }
            })
          };
        }

        return {};
      }
    }
  };
});

import {
  hashPin,
  listCloudSavedGames,
  saveGameToCloudSaved,
  loadGameFromCloudSaved,
  deleteCloudSavedGame,
  getStoredActiveCloudGameId,
  setStoredActiveCloudGameId,
  getLastUsedOwner,
  setLastUsedOwner
} from '../src/modules/persistence/cloudSavedGames';
import { cloudGameSync } from '../src/modules/persistence/cloudGameSync';
import { authManager } from '../src/modules/auth/authManager';
import { useGameStore } from '../src/stores/useGameStore';
import { db } from '../src/db/dexie';

describe('Cloud Saved Games with Owner and PIN (Partidas en la nube)', () => {
  beforeEach(async () => {
    savedGamesTable.clear();
    gamesTable.clear();

    await db.assets.clear();
    await db.savedGames.clear();
    await db.autoSave.clear();
    setStoredActiveCloudGameId(null);
    useGameStore.getState().resetGame();

    vi.spyOn(authManager, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(authManager, 'getUser').mockReturnValue({ id: 'user_master_123' } as any);
  });

  it('hashes PIN with SHA-256 and game id as salt (never plain text)', async () => {
    const pin = '1234';
    const idA = 'game_abc';
    const idB = 'game_xyz';

    const hashA = await hashPin(pin, idA);
    const hashB = await hashPin(pin, idB);

    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashB).toMatch(/^[0-9a-f]{64}$/);
    expect(hashA).not.toBe(hashB);

    const hashA2 = await hashPin(pin, idA);
    expect(hashA).toBe(hashA2);
  });

  it('remembers last used owner in localStorage or memory', () => {
    setLastUsedOwner('Juanma');
    expect(getLastUsedOwner()).toBe('Juanma');

    setLastUsedOwner('Carlos');
    expect(getLastUsedOwner()).toBe('Carlos');
  });

  it('saves game to cloud with owner and PIN, listing it without exposing data', async () => {
    const game = useGameStore.getState().game;
    const saveRes = await saveGameToCloudSaved({
      name: 'La Cripta Olvidada',
      owner: 'Juanma',
      pin: '4321',
      game
    });

    expect(saveRes.success).toBe(true);
    expect(saveRes.id).toBeTruthy();

    const storedRow = savedGamesTable.get(saveRes.id);
    expect(storedRow).toBeTruthy();
    expect(storedRow.name).toBe('La Cripta Olvidada');
    expect(storedRow.owner).toBe('Juanma');
    expect(storedRow.pin_hash).toBeTruthy();
    expect(storedRow.pin_hash).not.toBe('4321');

    const list = await listCloudSavedGames();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(saveRes.id);
    expect(list[0].name).toBe('La Cripta Olvidada');
    expect(list[0].owner).toBe('Juanma');
    expect(list[0].hasPin).toBe(true);
    expect((list[0] as any).data).toBeUndefined();
  });

  it('opens protected game only with correct PIN, rejecting wrong PIN', async () => {
    const originalGame = {
      ...useGameStore.getState().game,
      entities: [
        {
          id: 'token_secret',
          name: 'Jefe Secreto',
          type: 'token' as const,
          x: 100,
          y: 100,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          locked: false,
          visibleToPlayers: false
        }
      ]
    };

    const saveRes = await saveGameToCloudSaved({
      id: 'game_secret_1',
      name: 'Templo Oscuro',
      owner: 'Carlos',
      pin: '9876',
      game: originalGame
    });

    expect(saveRes.success).toBe(true);

    // 1. Attempt to load with wrong PIN
    const failRes = await loadGameFromCloudSaved('game_secret_1', '0000');
    expect(failRes.success).toBe(false);
    expect(failRes.error).toBe('PIN incorrecto');
    expect(failRes.game).toBeUndefined();

    // 2. Attempt to load without PIN
    const noPinRes = await loadGameFromCloudSaved('game_secret_1');
    expect(noPinRes.success).toBe(false);
    expect(noPinRes.error).toBe('Esta partida está protegida con PIN');

    // 3. Load with correct PIN
    const okRes = await loadGameFromCloudSaved('game_secret_1', '9876');
    expect(okRes.success).toBe(true);
    expect(okRes.game).toBeTruthy();
    expect(okRes.game?.entities.length).toBe(1);
    expect(okRes.game?.entities[0].name).toBe('Jefe Secreto');
    expect(okRes.game?.cloudSavedId).toBe('game_secret_1');
    expect(okRes.game?.cloudSavedName).toBe('Templo Oscuro');
  });

  it('requires PIN to delete a protected cloud game', async () => {
    const game = useGameStore.getState().game;
    await saveGameToCloudSaved({
      id: 'game_to_del',
      name: 'Partida Protegida',
      owner: 'Carlos',
      pin: '7777',
      game
    });

    expect(savedGamesTable.has('game_to_del')).toBe(true);

    const failDel = await deleteCloudSavedGame('game_to_del', '1111');
    expect(failDel.success).toBe(false);
    expect(failDel.error).toBe('PIN incorrecto');
    expect(savedGamesTable.has('game_to_del')).toBe(true);

    const okDel = await deleteCloudSavedGame('game_to_del', '7777');
    expect(okDel.success).toBe(true);
    expect(savedGamesTable.has('game_to_del')).toBe(false);
  });

  it('autosave updates the open cloud game row in saved_games and games (default)', async () => {
    const initialGame = {
      ...useGameStore.getState().game,
      cloudSavedId: 'game_live_session',
      cloudSavedName: 'Campaña Activa',
      cloudSavedOwner: 'Juanma'
    };
    savedGamesTable.set('game_live_session', {
      id: 'game_live_session',
      name: 'Campaña Activa',
      owner: 'Juanma',
      pin_hash: null,
      data: initialGame,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    setStoredActiveCloudGameId('game_live_session');
    useGameStore.getState().setGame(initialGame);

    const updatedGame = {
      ...useGameStore.getState().game,
      entities: [
        {
          id: 'token_hero_live',
          name: 'Guerrero',
          type: 'token' as const,
          x: 200,
          y: 200,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          locked: false,
          visibleToPlayers: true
        }
      ]
    };

    await cloudGameSync.saveGameToCloud(updatedGame);

    const defaultGame = gamesTable.get('default');
    expect(defaultGame).toBeTruthy();
    expect(defaultGame.state.entities.length).toBe(1);

    const savedRow = savedGamesTable.get('game_live_session');
    expect(savedRow).toBeTruthy();
    expect(savedRow.data.entities.length).toBe(1);
    expect(savedRow.data.entities[0].name).toBe('Guerrero');
  });

  it('prevents race conditions: flushAndFinalize cancels pending timers and saves active game', async () => {
    const gameA = {
      ...useGameStore.getState().game,
      name: 'Partida A',
      cloudSavedId: 'cgame_A'
    };
    savedGamesTable.set('cgame_A', {
      id: 'cgame_A',
      name: 'Partida A',
      owner: 'Carlos',
      data: gameA
    });
    setStoredActiveCloudGameId('cgame_A');
    useGameStore.getState().setGame(gameA);

    const modifiedGameA = {
      ...gameA,
      entities: [
        {
          id: 'token_A',
          name: 'Dragón A',
          type: 'token' as const,
          x: 50,
          y: 50,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          locked: false,
          visibleToPlayers: true
        }
      ]
    };
    cloudGameSync.scheduleAutoSave(modifiedGameA);

    await cloudGameSync.flushAndFinalizeActiveCloudGame();

    const rowA = savedGamesTable.get('cgame_A');
    expect(rowA.data.entities.length).toBe(1);
    expect(rowA.data.entities[0].name).toBe('Dragón A');

    expect((cloudGameSync as any).saveDebounceTimer).toBeNull();
    expect((cloudGameSync as any).pendingGameToSave).toBeNull();
  });

  it('closeBoard leaves the board completely empty in Dusk (60% intensity) and clears active cloud game', async () => {
    const activeGame = {
      ...useGameStore.getState().game,
      name: 'Partida Cargada',
      cloudSavedId: 'cgame_to_close',
      entities: [
        {
          id: 'token_temp',
          name: 'Goblin',
          type: 'token' as const,
          x: 70,
          y: 70,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          locked: false,
          visibleToPlayers: true
        }
      ]
    };
    savedGamesTable.set('cgame_to_close', { id: 'cgame_to_close', name: 'Partida Cargada', data: activeGame });
    setStoredActiveCloudGameId('cgame_to_close');
    useGameStore.getState().setGame(activeGame);

    await cloudGameSync.closeBoard();

    const currentState = useGameStore.getState().game;
    expect(currentState.entities.length).toBe(0);
    expect(currentState.ambient.preset).toBe('dusk');
    expect(currentState.ambient.intensity).toBe(60);
    expect(currentState.cloudSavedId).toBeNull();
    expect(getStoredActiveCloudGameId()).toBeNull();

    const defaultRow = gamesTable.get('default');
    expect(defaultRow.state.entities.length).toBe(0);
    expect(savedGamesTable.has('cgame_to_close')).toBe(true);
  });
});
