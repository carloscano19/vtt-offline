import { supabase } from '../supabase/supabaseClient';
import { authManager } from '../auth/authManager';
import { GameState } from '../../types/game';
import { useGameStore } from '../../stores/useGameStore';
import { loadAutoSaveFromDb, saveAutoSaveToDb } from './saveManager';

class CloudGameSync {
  private saveDebounceTimer: any = null;
  private pendingGameToSave: GameState | null = null;

  /**
   * Guarda la partida actual en la tabla vtt.games (fila con id 'default').
   */
  public async saveGameToCloud(game: GameState): Promise<boolean> {
    if (!supabase || !authManager.isAuthenticated()) {
      return false;
    }

    const user = authManager.getUser();
    if (!user) return false;

    try {
      const { error } = await supabase.from('games').upsert(
        {
          id: 'default',
          user_id: user.id,
          name: game.name || 'Aventura Principal',
          state: game,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
      );

      if (error) {
        console.warn('[cloudGameSync] Error al guardar partida en la nube:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[cloudGameSync] Excepción al guardar partida en la nube:', err);
      return false;
    }
  }

  /**
   * Programa un autoguardado a la nube con debounce de 2.5s.
   */
  public scheduleAutoSave(game: GameState): void {
    this.pendingGameToSave = game;
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null;
      if (this.pendingGameToSave) {
        this.saveGameToCloud(this.pendingGameToSave);
      }
    }, 2500);
  }

  /**
   * Guarda inmediatamente sin debounce (útil en beforeunload, pagehide o al importar archivo).
   */
  public async saveImmediate(game: GameState): Promise<boolean> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    return this.saveGameToCloud(game);
  }

  /**
   * Descarga la partida de la nube si existe.
   */
  public async loadGameFromCloud(): Promise<{ game: GameState; updatedAt: number } | null> {
    if (!supabase || !authManager.isAuthenticated()) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (error || !data || !data.state) {
        return null;
      }

      const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      return {
        game: data.state as GameState,
        updatedAt
      };
    } catch (err) {
      console.warn('[cloudGameSync] Error al cargar partida de la nube:', err);
      return null;
    }
  }

  /**
   * Sincronización al arrancar o al iniciar sesión:
   * Compara marcas de tiempo de autoguardado local vs la nube y carga la más reciente.
   */
  public async syncOnStartupOrLogin(): Promise<void> {
    if (!supabase || !authManager.isAuthenticated()) {
      return;
    }

    try {
      const [localAuto, cloudResult] = await Promise.all([
        loadAutoSaveFromDb(),
        this.loadGameFromCloud()
      ]);

      const localUpdatedAt = localAuto?.updatedAt || 0;
      const cloudUpdatedAt = cloudResult?.updatedAt || 0;

      if (cloudResult && cloudUpdatedAt > localUpdatedAt) {
        console.log('[cloudGameSync] Restaurando versión más reciente desde la nube...');
        useGameStore.getState().setGame(cloudResult.game);
        await saveAutoSaveToDb(cloudResult.game);
      } else if (localAuto && localAuto.entities && localAuto.entities.length > 0) {
        console.log('[cloudGameSync] Subiendo versión local a la nube...');
        await this.saveGameToCloud(localAuto);
      }
    } catch (err) {
      console.warn('[cloudGameSync] Error en syncOnStartupOrLogin:', err);
    }
  }

  /**
   * Borra la partida de la nube y los mapas asociados (tabla vtt.games y vtt.library_assets tipo 'map').
   */
  public async clearCloudAdventure(): Promise<void> {
    if (!supabase || !authManager.isAuthenticated()) {
      return;
    }

    try {
      // 1. Borrar fila de la partida en vtt.games
      await supabase.from('games').delete().eq('id', 'default');

      // 2. Obtener mapas de la biblioteca para borrar sus archivos en el bucket vtt-assets
      const { data: mapAssets } = await supabase
        .from('library_assets')
        .select('id, storage_path')
        .eq('type', 'map');

      if (mapAssets && mapAssets.length > 0) {
        const paths = mapAssets.map((m) => m.storage_path).filter(Boolean);
        if (paths.length > 0) {
          await supabase.storage.from('vtt-assets').remove(paths);
        }
        await supabase.from('library_assets').delete().eq('type', 'map');
      }
    } catch (err) {
      console.warn('[cloudGameSync] Error al borrar aventura de la nube:', err);
    }
  }
}

export const cloudGameSync = new CloudGameSync();
