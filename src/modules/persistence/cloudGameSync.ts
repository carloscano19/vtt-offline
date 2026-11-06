import { supabase } from '../supabase/supabaseClient';
import { authManager } from '../auth/authManager';
import { GameState } from '../../types/game';
import { useGameStore } from '../../stores/useGameStore';
import { loadAutoSaveFromDb, saveAutoSaveToDb } from './saveManager';
import { getStoredActiveCloudGameId, setStoredActiveCloudGameId } from './cloudSavedGames';

class CloudGameSync {
  private saveDebounceTimer: any = null;
  private pendingGameToSave: GameState | null = null;

  /**
   * Guarda la partida actual en la tabla vtt.games (fila con id 'default') para la tele y juego en vivo,
   * y si la partida proviene de la nube, actualiza también su fila en vtt.saved_games.
   */
  public async saveGameToCloud(game: GameState): Promise<boolean> {
    if (!supabase || !authManager.isAuthenticated()) {
      return false;
    }

    const user = authManager.getUser();
    if (!user) return false;

    try {
      // 1. Guardar siempre en vtt.games ('default') para la pantalla de la tele y observadores
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
        console.warn('[cloudGameSync] Error al guardar partida en vtt.games:', error);
      }

      // 2. Si hay una partida activa de la nube, actualizar también su fila en vtt.saved_games
      const targetCloudId = game.cloudSavedId || getStoredActiveCloudGameId();
      if (targetCloudId) {
        const { error: savedError } = await supabase
          .from('saved_games')
          .update({
            name: game.name || game.cloudSavedName || 'Aventura',
            data: {
              ...game,
              cloudSavedId: targetCloudId,
              cloudSavedName: game.name || game.cloudSavedName
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', targetCloudId);

        if (savedError) {
          console.warn('[cloudGameSync] Error al actualizar fila en vtt.saved_games:', savedError);
        }
      }

      return !error;
    } catch (err) {
      console.warn('[cloudGameSync] Excepción al guardar partida en la nube:', err);
      return false;
    }
  }

  /**
   * Cancela cualquier temporizador o autoguardado pendiente en memoria
   * para evitar carreras de escritura al cerrar o cambiar de partida.
   */
  public cancelPendingAutoSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.pendingGameToSave = null;
  }

  /**
   * Realiza un guardado final inmediato de la partida activa actual antes de cambiar o cerrar tablero,
   * cancelando cualquier temporizador pendiente.
   */
  public async flushAndFinalizeActiveCloudGame(): Promise<void> {
    const pending = this.pendingGameToSave;
    this.cancelPendingAutoSave();

    const gameToSave = pending || useGameStore.getState().game;
    if (gameToSave) {
      try {
        await saveAutoSaveToDb(gameToSave);
      } catch (err) {
        console.warn('[cloudGameSync] Error en guardado final Dexie:', err);
      }
      await this.saveGameToCloud(gameToSave);
    }
  }

  /**
   * Cierra el tablero dejando una partida nueva y vacía en Atardecer,
   * sin tocar la biblioteca ni las partidas guardadas.
   */
  public async closeBoard(): Promise<void> {
    // 1. Cancelar autoguardados pendientes
    this.cancelPendingAutoSave();

    // 2. Desvincular partida activa de la nube
    setStoredActiveCloudGameId(null);

    // 3. Resetear juego en memoria (partida limpia en Atardecer)
    useGameStore.getState().resetGame();
    const cleanGame = useGameStore.getState().game;

    // 4. Guardar inmediatamente en Dexie y en vtt.games ('default') para la tele
    try {
      await saveAutoSaveToDb(cleanGame);
    } catch (err) {
      console.warn('[cloudGameSync] Error al guardar cleanGame en Dexie:', err);
    }
    await this.saveImmediate(cleanGame);
  }

  /**
   * Programa un autoguardado (Dexie local y nube) con debounce de 1.5s (1–2 s).
   */
  public scheduleAutoSave(game: GameState): void {
    this.pendingGameToSave = game;
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(async () => {
      this.saveDebounceTimer = null;
      if (this.pendingGameToSave) {
        try {
          await saveAutoSaveToDb(this.pendingGameToSave);
        } catch (err) {
          console.warn('[cloudGameSync] Error en autoguardado Dexie:', err);
        }
        this.saveGameToCloud(this.pendingGameToSave);
      }
    }, 1500);
  }

  /**
   * Fuerza el autoguardado pendiente de inmediato (al soltar o al sincronizar).
   */
  public async flushAutoSave(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    if (this.pendingGameToSave) {
      try {
        await saveAutoSaveToDb(this.pendingGameToSave);
      } catch (err) {
        console.warn('[cloudGameSync] Error en flush autoguardado Dexie:', err);
      }
      await this.saveGameToCloud(this.pendingGameToSave);
    }
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

  private startupSyncPromise: Promise<void> | null = null;

  /**
   * Sincronización al arrancar o al iniciar sesión:
   * Compara marcas de tiempo de autoguardado local vs la nube y carga la más reciente.
   */
  public async syncOnStartupOrLogin(): Promise<void> {
    if (!supabase || !authManager.isAuthenticated()) {
      return;
    }

    if (this.startupSyncPromise) {
      return this.startupSyncPromise;
    }

    this.startupSyncPromise = (async () => {
      try {
        const [localAuto, cloudResult] = await Promise.all([
          loadAutoSaveFromDb(),
          this.loadGameFromCloud()
        ]);

        const localUpdatedAt = localAuto?.updatedAt || 0;
        const cloudUpdatedAt = cloudResult?.updatedAt || 0;

        if (cloudResult && cloudUpdatedAt > localUpdatedAt) {
          console.log('[cloudGameSync] Restaurando versión más reciente desde la nube...');
          const restoredGame = cloudResult.game;
          const storedCloudId = getStoredActiveCloudGameId();
          if (restoredGame.cloudSavedId) {
            setStoredActiveCloudGameId(restoredGame.cloudSavedId);
          } else if (storedCloudId) {
            restoredGame.cloudSavedId = storedCloudId;
          }
          useGameStore.getState().setGame(restoredGame);
          await saveAutoSaveToDb(restoredGame);
        } else if (localAuto && localAuto.entities && localAuto.entities.length > 0) {
          console.log('[cloudGameSync] Subiendo versión local a la nube...');
          if (localAuto.cloudSavedId) {
            setStoredActiveCloudGameId(localAuto.cloudSavedId);
          }
          await this.saveGameToCloud(localAuto);
        }
      } catch (err) {
        console.warn('[cloudGameSync] Error en syncOnStartupOrLogin:', err);
      } finally {
        this.startupSyncPromise = null;
      }
    })();

    return this.startupSyncPromise;
  }

  /**
   * Espera a que termine la sincronización de arranque si está en curso
   */
  public async waitForStartupSync(): Promise<void> {
    if (this.startupSyncPromise) {
      await this.startupSyncPromise;
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
