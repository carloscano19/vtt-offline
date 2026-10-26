import { supabase } from '../supabase/supabaseClient';
import { authManager } from '../auth/authManager';
import { db, saveAsset, deleteAsset as deleteLocalAsset, getAllAssets } from '../../db/dexie';
import { AssetItem, AssetType } from '../../types/game';

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
   * REGLA: Los mapas NUNCA van a la nube (solo local).
   * Tokens, objetos, efectos y música SÍ van a la nube.
   */
  public isCloudEligible(type: AssetType): boolean {
    return type !== 'map';
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

        if (!this.isCloudEligible(asset.type)) {
          // Los mapas nunca suben a la nube
          this.uploadQueue.shift();
          this.saveQueueToStorage();
          continue;
        }

        // Subir archivo al bucket vtt-assets
        const fileExt = asset.mimeType?.split('/')[1] || 'bin';
        const storagePath = `${user.id}/${asset.id}.${fileExt}`;

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
   * Sincronización al iniciar sesión o cambiar de dispositivo:
   * 1. Consulta la lista de library_assets en la nube del usuario.
   * 2. Compara con los assets locales en IndexedDB.
   * 3. Descarga los que falten localmente y los guarda en IndexedDB.
   * 4. Sube los elementos locales reutilizables que no estén aún en la nube.
   */
  public async syncOnLogin(): Promise<void> {
    if (!supabase || !authManager.isAuthenticated()) return;
    const user = authManager.getUser();
    if (!user) return;

    this.updateStatus('syncing', 0, 'Descargando biblioteca de la nube...');

    try {
      // 1. Obtener lista de assets en la nube
      const { data: cloudAssets, error } = await supabase
        .from('library_assets')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      const cloudList = (cloudAssets || []) as CloudAssetRecord[];
      const localAssets = await getAllAssets();
      const localMap = new Map(localAssets.map((a) => [a.id, a]));

      // 2. Descargar los que están en la nube y no existen localmente
      let downloadedCount = 0;
      for (const cloudItem of cloudList) {
        if (!localMap.has(cloudItem.id)) {
          this.updateStatus(
            'syncing',
            cloudList.length - downloadedCount,
            `Descargando "${cloudItem.name}"...`
          );

          try {
            const { data: blobData, error: downloadError } = await supabase.storage
              .from('vtt-assets')
              .download(cloudItem.storage_path);

            if (downloadError || !blobData) {
              console.warn(`[cloudSync] No se pudo descargar archivo para ${cloudItem.id}:`, downloadError);
              continue;
            }

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
            downloadedCount++;
          } catch (dlErr) {
            console.error(`[cloudSync] Error descargando ${cloudItem.id}:`, dlErr);
          }
        }
      }

      // 3. Encolar los elementos locales que no están en la nube (siempre que no sean mapas)
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
        const user = authManager.getUser();
        if (user) {
          // Obtener storage_path antes de borrar metadatos o calcularlo
          const { data } = await supabase
            .from('library_assets')
            .select('storage_path')
            .eq('id', assetId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (data?.storage_path) {
            await supabase.storage.from('vtt-assets').remove([data.storage_path]);
          }

          // Borrar registro en base de datos
          await supabase
            .from('library_assets')
            .delete()
            .eq('id', assetId)
            .eq('user_id', user.id);
        }
      } catch (cloudErr) {
        console.warn(`[cloudSync] Error al borrar de la nube el asset ${assetId}:`, cloudErr);
      }
    }
  }
}

export const cloudSync = new CloudSyncManager();
