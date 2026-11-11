import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseUVTT } from '../src/modules/import/uvttParser';
import { db, saveAsset } from '../src/db/dexie';
import { cloudSync } from '../src/modules/sync/cloudSync';
import { authManager } from '../src/modules/auth/authManager';
import { useUIStore } from '../src/stores/useUIStore';
import { GameState, AssetItem } from '../src/types/game';

// Almacenamiento en memoria para simular Supabase
const libraryAssetsTable = new Map<string, any>();
const storageFiles = new Map<string, Blob>();

vi.mock('../src/modules/supabase/supabaseClient', () => {
  return {
    isSupabaseConfigured: () => true,
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
      },
      from: (table: string) => {
        if (table === 'library_assets') {
          return {
            select: (_fields: string) => ({
              in: (_col: string, ids: string[]) => {
                const found = ids.map((id) => libraryAssetsTable.get(id)).filter(Boolean);
                return Promise.resolve({ data: found, error: null });
              }
            }),
            upsert: (payload: any) => {
              libraryAssetsTable.set(payload.id, { ...payload });
              return Promise.resolve({ data: payload, error: null });
            }
          };
        }
        return {
          select: () => ({ in: () => Promise.resolve({ data: [], error: null }) })
        };
      },
      storage: {
        from: (bucket: string) => {
          if (bucket === 'vtt-assets') {
            return {
              download: (path: string) => {
                const blob = storageFiles.get(path);
                if (!blob) {
                  return Promise.resolve({ data: null, error: new Error('File not found in storage') });
                }
                return Promise.resolve({ data: blob, error: null });
              },
              upload: (path: string, blob: Blob) => {
                if (blob && blob.size > 50 * 1024 * 1024) {
                  return Promise.resolve({ data: null, error: new Error('Payload too large: file exceeds 50 MB limit') });
                }
                storageFiles.set(path, blob);
                return Promise.resolve({ data: { path }, error: null });
              }
            };
          }
          return {
            download: () => Promise.resolve({ data: null, error: new Error('Bucket not found') }),
            upload: () => Promise.resolve({ data: null, error: null })
          };
        }
      }
    }
  };
});

describe('Cloud Map & Asset Sync Tests', () => {
  beforeEach(async () => {
    await db.assets.clear();
    libraryAssetsTable.clear();
    storageFiles.clear();
    cloudSync.clearMissingNotices();
    useUIStore.setState({ toasts: [] });

    // Simular usuario autenticado y conexión activa
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true, writable: true });
    vi.spyOn(authManager, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(authManager, 'getUser').mockReturnValue({ id: 'user_test', email: 'test@vtt.local' } as any);
  });

  it('1. Importar un .dd2vtt encola su asset para subirlo', async () => {
    const dummyUVTT = JSON.stringify({
      format: 0.2,
      resolution: {
        map_origin: { x: 0, y: 0 },
        map_size: { x: 10, y: 10 },
        pixels_per_grid: 70
      },
      image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      line_of_sight: [],
      portals: [],
      lights: []
    });

    const parsed = await parseUVTT(dummyUVTT);
    const assetId = `map_uvtt_${Date.now()}`;
    const asset: AssetItem = {
      id: assetId,
      name: 'Mazmorra UVTT',
      type: 'map',
      mimeType: parsed.mimeType,
      blob: parsed.imageBlob,
      createdAt: Date.now(),
      width: parsed.widthPx,
      height: parsed.heightPx
    };

    // Al importar, se guarda en Dexie y se encola la subida a la nube
    await saveAsset(asset);
    cloudSync.enqueueUpload(asset.id);

    const status = cloudSync.getStatus();
    expect(status.pendingCount).toBeGreaterThan(0);
    expect((cloudSync as any).uploadQueue).toContain(assetId);
  });

  it('2. Abrir una partida de la nube con un asset que solo está en library_assets lo descarga', async () => {
    const cloudAssetId = 'asset_cloud_only_1';
    const fakeBlob = new Blob(['fake image content'], { type: 'image/png' });
    const storagePath = `shared/map/${cloudAssetId}.png`;

    // Está en library_assets y en Storage, pero NO en Dexie local
    libraryAssetsTable.set(cloudAssetId, {
      id: cloudAssetId,
      user_id: 'user_test',
      name: 'Mapa del Templo',
      type: 'map',
      mime_type: 'image/png',
      size: fakeBlob.size,
      storage_path: storagePath,
      tags: [],
      created_at: new Date().toISOString()
    });
    storageFiles.set(storagePath, fakeBlob);

    // Asegurarse de que no existe en Dexie
    const localBefore = await db.assets.get(cloudAssetId);
    expect(localBefore).toBeUndefined();

    // Partida que referencia dicho asset
    const game: GameState = {
      id: 'game_1',
      name: 'Aventura Templo',
      version: 1,
      turnCounter: 0,
      updatedAt: Date.now(),
      entities: [
        {
          id: 'map_entity_1',
          type: 'map',
          name: 'Templo Antiguo',
          assetId: cloudAssetId,
          x: 0,
          y: 0,
          layer: 'map'
        }
      ],
      masterCamera: { x: 0, y: 0, zoom: 1 },
      playerCamera: { x: 0, y: 0, zoom: 1 },
      fog: { enabled: true, rememberExplored: false, explored: [], revealed: [] },
      ambient: { preset: 'dusk', color: '#c84224', intensity: 60 }
    } as any;

    const result = await cloudSync.ensureGameAssets(game);
    expect(result.downloaded).toBe(1);
    expect(result.missing).toHaveLength(0);

    // Comprobar que ahora sí existe en Dexie
    const localAfter = await db.assets.get(cloudAssetId);
    expect(localAfter).toBeDefined();
    expect(localAfter?.name).toBe('Mapa del Templo');
    expect(localAfter?.blob).toBeDefined();
  });

  it('3. Si un asset no está en ningún sitio, aparece el aviso', async () => {
    const missingAssetId = 'asset_completely_missing_404';

    // Partida con un mapa cuyo asset no está en Dexie ni en library_assets
    const game: GameState = {
      id: 'game_2',
      name: 'Aventura Perdida',
      version: 1,
      turnCounter: 0,
      updatedAt: Date.now(),
      entities: [
        {
          id: 'map_ent_2',
          type: 'map',
          name: 'Cueva Oscura',
          assetId: missingAssetId,
          x: 0,
          y: 0,
          layer: 'map'
        }
      ],
      masterCamera: { x: 0, y: 0, zoom: 1 },
      playerCamera: { x: 0, y: 0, zoom: 1 },
      fog: { enabled: true, rememberExplored: false, explored: [], revealed: [] },
      ambient: { preset: 'dusk', color: '#c84224', intensity: 60 }
    } as any;

    const result = await cloudSync.ensureGameAssets(game);
    expect(result.downloaded).toBe(0);
    expect(result.missing).toContain(missingAssetId);

    // Debe haberse generado el aviso con el formato exacto requerido:
    // "Falta la imagen de «nombre»: vuelve a importarla"
    const expectedNotice = 'Falta la imagen de «Cueva Oscura»: vuelve a importarla';
    expect(cloudSync.getMissingNotices()).toContain(expectedNotice);

    // Comprobar que en useUIStore.toasts aparece el aviso
    const toasts = useUIStore.getState().toasts;
    expect(toasts.some((t) => t.message === expectedNotice)).toBe(true);
  });

  it('4. Si una subida falla (por superar 50 MB), muestra el error con el nombre del archivo en el indicador de la nube', async () => {
    const hugeAssetId = 'asset_huge_map';
    // Crear un blob de 52 MB
    const hugeBlob = new Blob([new Uint8Array(52 * 1024 * 1024)], { type: 'image/png' });

    const hugeAsset: AssetItem = {
      id: hugeAssetId,
      name: 'MapaGigante.png',
      type: 'map',
      mimeType: 'image/png',
      blob: hugeBlob,
      createdAt: Date.now()
    };

    await saveAsset(hugeAsset);
    cloudSync.enqueueUpload(hugeAsset.id);

    // Procesar la cola (fallará por límite de tamaño)
    await cloudSync.processQueue();

    const status = cloudSync.getStatus();
    expect(status.state).toBe('error');
    // El mensaje debe contener el nombre del archivo y mencionar el límite de 50 MB
    expect(status.message).toContain('«MapaGigante.png»');
    expect(status.message).toContain('50 MB');

    // En los toasts también debe aparecer
    const toasts = useUIStore.getState().toasts;
    expect(toasts.some((t) => t.message.includes('«MapaGigante.png»') && t.message.includes('50 MB'))).toBe(true);
  });
});
