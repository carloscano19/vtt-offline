import { supabase } from '../supabase/supabaseClient';
import { authManager } from '../auth/authManager';
import { db, saveAsset, deleteAsset as deleteLocalAsset, getAllAssets } from '../../db/dexie';
import { AssetItem, AssetType } from '../../types/game';
import { invalidateCachedTexture } from '../../pixi/utils/textureCache';
import { syncChannel } from './syncChannel';
import { useGameStore } from '../../stores/useGameStore';
import { cloudGameSync } from '../persistence/cloudGameSync';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'unauthenticated' | 'error';

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  message?: string;
}

export type SyncListener = (status: SyncStatus) => void;

interface CloudAssetRecord {
  id: string;
  user_id: string;
  name: string;
  type: AssetType;
  mime_type: string;
  size: number;
  tags?: string[];
  storage_path: string;
  chroma_key?: any;
  width?: number | null;
  height?: number | null;
  created_at?: string;
  updated_at?: string;
}

const QUEUE_STORAGE_KEY = 'vtt_cloud_upload_queue_v1';

class CloudSyncManager {
  private listeners: Set<SyncListener> = new Set();
  private isSyncing = false;
  private uploadQueue: string[] = []; // IDs de assets pendientes de subir
  private currentState: SyncState = 'unauthenticated';
  private currentMessage = '';

  constructor() {
    this.loadQueueFromStorage();

    // Escuchar eventos de red del navegador
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[cloudSync] Conexión recuperada. Procesando cola...');
        this.processQueue();
      });
      window.addEventListener('offline', () => {
        console.log('[cloudSync] Sin conexión a internet.');
        this.updateStatus('offline', this.uploadQueue.length, 'Sin conexión a internet');
      });
    }

    // Escuchar cambios de sesión
    authManager.onAuthStateChange((user) => {
      if (user) {
        if (!navigator.onLine) {
          this.updateStatus('offline', this.uploadQueue.length, 'Sin conexión');
        } else {
          this.updateStatus('syncing', 0, 'Sincronizando biblioteca...');
          this.syncOnLogin().catch((err) => {
            console.error('[cloudSync] Error en syncOnLogin:', err);
            this.updateStatus('error', 0, err.message);
          });
        }
      } else {
        this.updateStatus('unauthenticated', 0, 'Inicia sesión para guardar tu biblioteca en la nube');
      }
    });
  }

  public getStatus(): SyncStatus {
    return {
      state: this.currentState,
      pendingCount: this.uploadQueue.length,
      message: this.currentMessage
    };
  }

  public onStatusChange(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateStatus(state: SyncState, pendingCount: number, message?: string) {
    this.currentState = state;
    this.currentMessage = message || '';
    const status: SyncStatus = { state, pendingCount, message: this.currentMessage };
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[cloudSync] Error en listener de sync:', err);
      }
    }
  }

  private loadQueueFromStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
        if (saved) {
          this.uploadQueue = JSON.parse(saved);
        }
      }
    } catch {
      this.uploadQueue = [];
    }
  }

  private saveQueueToStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.uploadQueue));
      }
    } catch (err) {
      console.warn('[cloudSync] Error al guardar cola en localStorage:', err);
    }
  }

  /**
   * Determina si un tipo de asset debe subirse a la nube.
   * Todos los assets de la biblioteca (mapas, tokens, objetos, efectos y audio) se sincronizan a la nube.
   */
  public isCloudEligible(_type: AssetType): boolean {
    return true;
  }

  /**
   * Encola un asset local para subirlo a la nube
   */
  public enqueueUpload(assetId: string) {
    if (!this.uploadQueue.includes(assetId)) {
      this.uploadQueue.push(assetId);
      this.saveQueueToStorage();
    }
    this.processQueue();
  }

  /**
   * Procesa la cola de subida pendiente a Supabase
   */
  public async processQueue(): Promise<void> {
    if (this.isSyncing) return;
    if (!authManager.isAuthenticated() || !supabase) {
      this.updateStatus('unauthenticated', 0, 'Inicia sesión para guardar tu biblioteca en la nube');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.updateStatus('offline', this.uploadQueue.length, 'Sin conexión');
      return;
    }

    if (this.uploadQueue.length === 0) {
      this.updateStatus('synced', 0, 'Biblioteca sincronizada');
      return;
    }

    this.isSyncing = true;
    this.updateStatus('syncing', this.uploadQueue.length, `Subiendo ${this.uploadQueue.length} elementos...`);

    const user = authManager.getUser();
    if (!user) {
      this.isSyncing = false;
      return;
    }

    try {
      while (this.uploadQueue.length > 0) {
        if (!navigator.onLine) {
          this.updateStatus('offline', this.uploadQueue.length, 'Sin conexión');
          break;
        }

        const assetId = this.uploadQueue[0];
        const asset = await db.assets.get(assetId);

        if (!asset) {
          // El asset ya no existe localmente, quitarlo de la cola
          this.uploadQueue.shift();
          this.saveQueueToStorage();
          continue;
        }

        // Subir archivo al bucket vtt-assets bajo ruta compartida
        const fileExt = asset.mimeType?.split('/')[1] || 'bin';
        const storagePath = `shared/${asset.type}/${asset.id}.${fileExt}`;

        // Subir blob a Storage
        const { error: storageError } = await supabase.storage
          .from('vtt-assets')
          .upload(storagePath, asset.blob, {
            contentType: asset.mimeType || 'application/octet-stream',
            upsert: true
          });

        if (storageError) {
          console.error(`[cloudSync] Error al subir asset ${asset.id} a Storage:`, storageError);
          throw storageError;
        }

        // Registrar o actualizar metadatos en tabla vtt.library_assets
        const payload: Partial<CloudAssetRecord> = {
          id: asset.id,
          user_id: user.id,
          name: asset.name,
          type: asset.type,
          mime_type: asset.mimeType,
          size: asset.blob.size || 0,
          tags: asset.tags || [],
          storage_path: storagePath,
          width: asset.width || null,
          height: asset.height || null,
          updated_at: new Date().toISOString()
        };

        const { error: dbError } = await supabase
          .from('library_assets')
          .upsert(payload, { onConflict: 'id' });

        if (dbError) {
          console.error(`[cloudSync] Error al guardar metadatos de ${asset.id}:`, dbError);
          throw dbError;
        }

        // Eliminado con éxito de la cola
        this.uploadQueue.shift();
        this.saveQueueToStorage();
        this.updateStatus('syncing', this.uploadQueue.length, `Subiendo elementos (${this.uploadQueue.length} restantes)...`);
      }

      this.updateStatus('synced', 0, 'Biblioteca sincronizada');
    } catch (err: any) {
      console.error('[cloudSync] Error procesando cola de subida:', err);
      this.updateStatus('error', this.uploadQueue.length, `Error al sincronizar: ${err?.message || String(err)}`);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Descarga un lote de assets de la nube con concurrencia limitada (por defecto 4).
   */
  public async downloadBatchWithConcurrency(
    items: CloudAssetRecord[],
    concurrency = 4,
    onItemDone?: (item: CloudAssetRecord) => void
  ): Promise<number> {
    if (!supabase || items.length === 0) return 0;
    let nextIndex = 0;
    let successCount = 0;

    const worker = async () => {
      while (nextIndex < items.length) {
        const idx = nextIndex++;
        const cloudItem = items[idx];

        try {
          const { data: blobData, error: downloadError } = await supabase!.storage
            .from('vtt-assets')
            .download(cloudItem.storage_path);

          if (downloadError || !blobData) {
            console.warn(`[cloudSync] No se pudo descargar archivo para ${cloudItem.id}:`, downloadError);
          } else {
            const newLocalAsset: AssetItem = {
              id: cloudItem.id,
              name: cloudItem.name,
              type: cloudItem.type,
              mimeType: cloudItem.mime_type,
              blob: blobData,
              tags: cloudItem.tags || [],
              createdAt: cloudItem.created_at ? new Date(cloudItem.created_at).getTime() : Date.now(),
              width: cloudItem.width || undefined,
              height: cloudItem.height || undefined
            };

            await saveAsset(newLocalAsset);
            invalidateCachedTexture(newLocalAsset.id);
            syncChannel.sendAssetDownloaded(newLocalAsset.id);
            successCount++;
          }
        } catch (dlErr) {
          console.error(`[cloudSync] Error descargando ${cloudItem.id}:`, dlErr);
        } finally {
          if (onItemDone) {
            onItemDone(cloudItem);
          }
        }
      }
    };

    const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(pool);
    return successCount;
  }

  /**
   * Sincronización al iniciar sesión o cambiar de dispositivo:
   * 1. Espera a que la sincronización de la aventura activa termine para conocer su estado real.
   * 2. Consulta library_assets en la nube y compara con IndexedDB.
   * 3. Descarga primero los assets que usa la partida abierta (mapas, tokens, efectos y música activa).
   * 4. Descarga el resto de la biblioteca a continuación con concurrencia de 4.
   * 5. Sube los elementos locales reutilizables que no estén aún en la nube.
   */
  public async syncOnLogin(): Promise<void> {
    if (!supabase || !authManager.isAuthenticated()) return;
    const user = authManager.getUser();
    if (!user) return;

    this.updateStatus('syncing', 0, 'Sincronizando biblioteca de la nube...');

    try {
      // Asegurarse de que la partida real (de la nube o local) ya ha sido cargada en el store
      await cloudGameSync.waitForStartupSync();

      // 1. Obtener lista de todos los assets en la biblioteca compartida
      const { data: cloudAssets, error } = await supabase
        .from('library_assets')
        .select('*');

      if (error) {
        throw error;
      }

      const cloudList = (cloudAssets || []) as CloudAssetRecord[];
      const localAssets = await getAllAssets();
      const localMap = new Map(localAssets.map((a) => [a.id, a]));

      // 2. Extraer los assetIds que realmente utiliza la partida abierta actualmente
      const currentGame = useGameStore.getState().game;
      const priorityAssetIds = new Set<string>();

      if (currentGame) {
        // Entidades (mapas, tokens, objetos, efectos)
        for (const ent of currentGame.entities || []) {
          if (ent.assetId) {
            priorityAssetIds.add(ent.assetId);
          }
        }
        // Música que suene activamente
        if (currentGame.music?.isPlaying && currentGame.music.currentTrackId) {
          const activeTrack = currentGame.music.playlist?.find(
            (t) => t.id === currentGame.music.currentTrackId
          );
          if (activeTrack?.assetId) {
            priorityAssetIds.add(activeTrack.assetId);
          }
        }
      }

      // Separar los faltantes en prioritarios (partida abierta) y resto de biblioteca
      const missingAssets = cloudList.filter((c) => !localMap.has(c.id));
      const priorityItems = missingAssets.filter((c) => priorityAssetIds.has(c.id));
      const remainingItems = missingAssets.filter((c) => !priorityAssetIds.has(c.id));
      const totalMissing = missingAssets.length;
      let downloadedCount = 0;

      // Fase 1: Descargar primero con concurrencia 4 los assets de la partida abierta
      if (priorityItems.length > 0) {
        this.updateStatus(
          'syncing',
          totalMissing - downloadedCount,
          `Cargando assets de la partida (${priorityItems.length} restantes)...`
        );

        await this.downloadBatchWithConcurrency(priorityItems, 4, (item) => {
          downloadedCount++;
          this.updateStatus(
            'syncing',
            totalMissing - downloadedCount,
            `Descargando "${item.name}"...`
          );
        });
      }

      // Fase 2: Descargar el resto de la biblioteca con concurrencia 4
      if (remainingItems.length > 0) {
        this.updateStatus(
          'syncing',
          totalMissing - downloadedCount,
          `Sincronizando biblioteca (${remainingItems.length} restantes)...`
        );

        await this.downloadBatchWithConcurrency(remainingItems, 4, (item) => {
          downloadedCount++;
          this.updateStatus(
            'syncing',
            totalMissing - downloadedCount,
            `Descargando "${item.name}"...`
          );
        });
      }

      // 3. Encolar los elementos locales que no están en la nube
      const cloudIds = new Set(cloudList.map((c) => c.id));
      for (const local of localAssets) {
        if (this.isCloudEligible(local.type) && !cloudIds.has(local.id)) {
          if (!this.uploadQueue.includes(local.id)) {
            this.uploadQueue.push(local.id);
          }
        }
      }
      this.saveQueueToStorage();

      // Procesar la cola si hay elementos locales por subir
      if (this.uploadQueue.length > 0) {
        await this.processQueue();
      } else {
        this.updateStatus('synced', 0, 'Biblioteca sincronizada');
      }
    } catch (err: any) {
      console.error('[cloudSync] Error durante syncOnLogin:', err);
      this.updateStatus('error', this.uploadQueue.length, err?.message || 'Error de sincronización');
    }
  }

  /**
   * Elimina un asset tanto en local como en la nube
   */
  public async deleteAssetComplete(assetId: string): Promise<void> {
    // 1. Quitar de la cola de subida si estaba pendiente
    this.uploadQueue = this.uploadQueue.filter((id) => id !== assetId);
    this.saveQueueToStorage();

    // 2. Borrar de IndexedDB local
    await deleteLocalAsset(assetId);

    // 3. Si hay sesión activa en Supabase, borrar de la nube
    if (supabase && authManager.isAuthenticated()) {
      try {
        const { data } = await supabase
          .from('library_assets')
          .select('storage_path')
          .eq('id', assetId)
          .maybeSingle();

        if (data?.storage_path) {
          await supabase.storage.from('vtt-assets').remove([data.storage_path]);
        }

        // Borrar registro en base de datos
        await supabase
          .from('library_assets')
          .delete()
          .eq('id', assetId);
      } catch (cloudErr) {
        console.warn(`[cloudSync] Error al borrar de la nube el asset ${assetId}:`, cloudErr);
      }
    }
  }

  /**
   * Consulta el almacenamiento total consumido en la nube (límite 1 GB en tier gratuito de Supabase)
   */
  public async getStorageUsage(): Promise<{ usedBytes: number; totalBytes: number; percentage: number }> {
    const totalBytes = 1024 * 1024 * 1024; // 1 GB
    let usedBytes = 0;

    if (supabase && authManager.isAuthenticated()) {
      try {
        const { data, error } = await supabase.rpc('get_storage_usage');
        if (!error && typeof data === 'number') {
          usedBytes = data;
        } else {
          const { data: assets } = await supabase.from('library_assets').select('size');
          if (assets) {
            usedBytes = assets.reduce((acc: number, curr: any) => acc + (curr.size || 0), 0);
          }
        }
      } catch (err) {
        console.warn('[cloudSync] Error al obtener uso de almacenamiento:', err);
      }
    }

    if (usedBytes === 0) {
      try {
        const localAssets = await getAllAssets();
        usedBytes = localAssets.reduce((acc, curr) => acc + (curr.blob?.size || 0), 0);
      } catch {
        // fallback
      }
    }

    const percentage = Math.min(100, Math.round((usedBytes / totalBytes) * 1000) / 10);
    return {
      usedBytes,
      totalBytes,
      percentage
    };
  }
}

export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const cloudSync = new CloudSyncManager();
