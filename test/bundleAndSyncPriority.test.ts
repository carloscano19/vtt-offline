import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";

let activeConcurrency = 0;
let maxObservedConcurrency = 0;

vi.mock("../src/modules/supabase/supabaseClient", () => {
  return {
    isSupabaseConfigured: () => true,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
      },
      from: () => ({
        select: async () => ({ data: [], error: null }),
        upsert: async () => ({ error: null }),
        delete: async () => ({ eq: () => ({}) })
      }),
      storage: {
        from: () => ({
          download: async () => {
            activeConcurrency++;
            if (activeConcurrency > maxObservedConcurrency) {
              maxObservedConcurrency = activeConcurrency;
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
            activeConcurrency--;
            return { data: new Blob(["fake-image-bytes"]), error: null };
          }
        })
      }
    }
  };
});

import { exportVttSave, importVttSave } from "../src/modules/persistence/exporter";
import { cloudSync } from "../src/modules/sync/cloudSync";
import { useGameStore } from "../src/stores/useGameStore";
import { db } from "../src/db/dexie";
import { GameState } from "../src/types/game";

describe("Bloque 1 & 2: Bundle Splitting and Prioritized Sync", () => {
  beforeEach(async () => {
    await db.assets.clear();
    activeConcurrency = 0;
    maxObservedConcurrency = 0;
  });

  it("exportVttSave e importVttSave cargan JSZip dinámicamente y preservan el estado del juego", async () => {
    const mockState: GameState = {
      name: "Partida Test Dinámica",
      entities: [],
      grid: { size: 70, color: "#ffffff", opacity: 0.5, visible: true, snapToGrid: true },
      masterCamera: { x: 0, y: 0, zoom: 1 },
      playerCamera: { x: 0, y: 0, zoom: 1 },
      fog: { enabled: true, playerFogEnabled: true, defaultRevealed: false },
      music: { playlist: [], currentTrackId: null, isPlaying: false, volume: 80, loopTrack: false },
      ambient: { preset: "noon", color: "#ffffff", intensity: 0 },
      weather: { rain: { enabled: false, intensity: 0, direction: 90 }, snow: { enabled: false, intensity: 0, direction: 90 }, wind: { enabled: false, speed: 0, angle: 0 } },
      combat: { active: false, order: [], currentTurnIndex: 0, round: 1 },
      ruler: { active: false, mode: "straight", diagonalRule: "5e", startPos: null, currentPos: null, visibleToPlayers: false },
      turnCounter: 1
    };

    const blob = await exportVttSave(mockState);
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(0);

    const buffer = await blob.arrayBuffer();
    const loadedState = await importVttSave(buffer);
    expect(loadedState.name).toBe("Partida Test Dinámica");
  });

  it("cloudSync.downloadBatchWithConcurrency procesa lotes con concurrencia máxima de 4", async () => {
    const completedItems: string[] = [];

    const mockItems = Array.from({ length: 12 }, (_, i) => ({
      id: "asset_" + i,
      user_id: "user_test",
      name: "Token " + i,
      type: "token" as const,
      mime_type: "image/png",
      size: 100,
      storage_path: "tokens/token_" + i + ".png"
    }));

    const count = await cloudSync.downloadBatchWithConcurrency(mockItems, 4, (item) => {
      completedItems.push(item.id);
    });

    expect(count).toBe(12);
    expect(completedItems.length).toBe(12);
    expect(maxObservedConcurrency).toBe(4);
  });

  it("calcula los assets prioritarios a partir de la partida cargada en useGameStore", () => {
    useGameStore.setState({
      game: {
        name: "Aventura Prioritaria",
        entities: [
          { id: "e1", type: "map", assetId: "map_asset_1", x: 0, y: 0, width: 1000, height: 1000, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 0, locked: false, visible: true },
          { id: "e2", type: "token", assetId: "token_asset_2", x: 100, y: 100, width: 70, height: 70, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 1, locked: false, visible: true, name: "Guerrero" },
          { id: "e3", type: "effect", assetId: "effect_asset_3", x: 200, y: 200, width: 70, height: 70, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 2, locked: false, visible: true }
        ],
        grid: { size: 70, color: "#fff", opacity: 0.5, visible: true, snapToGrid: true },
        masterCamera: { x: 0, y: 0, zoom: 1 },
        playerCamera: { x: 0, y: 0, zoom: 1 },
        fog: { enabled: true, playerFogEnabled: true, defaultRevealed: false },
        music: {
          playlist: [
            { id: "track_1", name: "Combate Épico", assetId: "music_asset_epic" },
            { id: "track_2", name: "Taberna Inactiva", assetId: "music_asset_tavern" }
          ],
          currentTrackId: "track_1",
          isPlaying: true,
          volume: 80,
          loopTrack: true
        },
        ambient: { preset: "noon", color: "#ffffff", intensity: 0 },
        weather: { rain: { enabled: false, intensity: 0, direction: 90 }, snow: { enabled: false, intensity: 0, direction: 90 }, wind: { enabled: false, speed: 0, angle: 0 } },
        combat: { active: false, order: [], currentTurnIndex: 0, round: 1 },
        ruler: { active: false, mode: "straight", diagonalRule: "5e", startPos: null, currentPos: null, visibleToPlayers: false },
        turnCounter: 1
      }
    });

    const currentGame = useGameStore.getState().game;
    const priorityAssetIds = new Set<string>();

    for (const ent of currentGame.entities || []) {
      if (ent.assetId) priorityAssetIds.add(ent.assetId);
    }
    if (currentGame.music?.isPlaying && currentGame.music.currentTrackId) {
      const activeTrack = currentGame.music.playlist?.find((t) => t.id === currentGame.music.currentTrackId);
      if (activeTrack?.assetId) priorityAssetIds.add(activeTrack.assetId);
    }

    expect(priorityAssetIds.has("map_asset_1")).toBe(true);
    expect(priorityAssetIds.has("token_asset_2")).toBe(true);
    expect(priorityAssetIds.has("effect_asset_3")).toBe(true);
    expect(priorityAssetIds.has("music_asset_epic")).toBe(true);

    expect(priorityAssetIds.has("music_asset_tavern")).toBe(false);
    expect(priorityAssetIds.has("unrelated_asset")).toBe(false);
  });
});
