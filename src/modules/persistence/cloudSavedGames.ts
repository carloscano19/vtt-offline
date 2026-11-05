import { supabase } from '../supabase/supabaseClient';
import { authManager } from '../auth/authManager';
import { GameState } from '../../types/game';
import { normalizeGameState } from './normalizer';

export interface CloudSavedGameSummary {
  id: string;
  name: string;
  owner: string;
  hasPin: boolean;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY_LAST_OWNER = 'vtt_last_game_owner';
const STORAGE_KEY_ACTIVE_CLOUD_ID = 'vtt_active_cloud_game_id';

let memoryOwner = 'Carlos';
let memoryActiveCloudId: string | null = null;

/**
 * Calcula el hash SHA-256 de un PIN utilizando el ID de la partida como sal.
 * El PIN nunca se guarda ni se transmite en texto plano.
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${pin.trim()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getLastUsedOwner(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return localStorage.getItem(STORAGE_KEY_LAST_OWNER) || memoryOwner;
    } catch {
      return memoryOwner;
    }
  }
  return memoryOwner;
}

export function setLastUsedOwner(owner: string): void {
  const trimmed = owner.trim();
  if (!trimmed) return;
  memoryOwner = trimmed;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(STORAGE_KEY_LAST_OWNER, trimmed);
    } catch {
      // Ignore localStorage errors
    }
  }
}

export function getStoredActiveCloudGameId(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return localStorage.getItem(STORAGE_KEY_ACTIVE_CLOUD_ID) || memoryActiveCloudId;
    } catch {
      return memoryActiveCloudId;
    }
  }
  return memoryActiveCloudId;
}

export function setStoredActiveCloudGameId(id: string | null): void {
  memoryActiveCloudId = id;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_CLOUD_ID, id);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_CLOUD_ID);
      }
    } catch {
      // Ignore localStorage errors
    }
  }
}

/**
 * Lista las partidas guardadas en la nube.
 * IMPORTANTE: No descarga el campo `data` (contenido/mapas/tokens) para evitar exponer información de partidas con PIN.
 */
export async function listCloudSavedGames(): Promise<CloudSavedGameSummary[]> {
  if (!supabase || !authManager.isAuthenticated()) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('saved_games')
      .select('id, name, owner, pin_hash, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (error || !data) {
      console.warn('[cloudSavedGames] Error al listar partidas:', error);
      return [];
    }

    return data.map((row: any) => ({
      id: row.id,
      name: row.name || 'Sin título',
      owner: row.owner || 'Máster',
      hasPin: Boolean(row.pin_hash),
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
    }));
  } catch (err) {
    console.warn('[cloudSavedGames] Excepción al listar partidas:', err);
    return [];
  }
}

/**
 * Guarda o actualiza una partida en la tabla vtt.saved_games.
 */
export async function saveGameToCloudSaved(params: {
  id?: string;
  name: string;
  owner: string;
  pin?: string | null;
  game: GameState;
}): Promise<{ success: boolean; id: string; error?: string }> {
  if (!supabase || !authManager.isAuthenticated()) {
    return { success: false, id: '', error: 'No hay conexión o sesión iniciada con la nube' };
  }

  const trimmedName = params.name.trim() || 'Partida sin nombre';
  const trimmedOwner = params.owner.trim() || 'Máster';
  setLastUsedOwner(trimmedOwner);

  const gameId = params.id || `cgame_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    let pinHashToSave: string | null | undefined = undefined;

    if (params.pin !== undefined) {
      const pinStr = (params.pin || '').trim();
      if (pinStr.length > 0) {
        if (!/^\d{4}$/.test(pinStr)) {
          return { success: false, id: gameId, error: 'El PIN debe ser de 4 dígitos numéricos' };
        }
        pinHashToSave = await hashPin(pinStr, gameId);
      } else {
        pinHashToSave = null;
      }
    }

    // Copia del estado a guardar con los metadatos de la nube vinculados
    const now = Date.now();
    const stateToSave: GameState = {
      ...params.game,
      name: trimmedName,
      cloudSavedId: gameId,
      cloudSavedName: trimmedName,
      cloudSavedOwner: trimmedOwner,
      updatedAt: now
    };

    const rowPayload: Record<string, any> = {
      id: gameId,
      name: trimmedName,
      owner: trimmedOwner,
      data: stateToSave,
      updated_at: new Date(now).toISOString()
    };

    if (pinHashToSave !== undefined) {
      rowPayload.pin_hash = pinHashToSave;
    }

    const { error } = await supabase.from('saved_games').upsert(rowPayload, { onConflict: 'id' });

    if (error) {
      console.warn('[cloudSavedGames] Error en upsert:', error);
      return { success: false, id: gameId, error: error.message };
    }

    setStoredActiveCloudGameId(gameId);
    return { success: true, id: gameId };
  } catch (err: any) {
    console.warn('[cloudSavedGames] Excepción en saveGameToCloudSaved:', err);
    return { success: false, id: gameId, error: err?.message || String(err) };
  }
}

/**
 * Carga una partida de la nube.
 * Si la partida tiene PIN, requiere el PIN correcto antes de devolver o aplicar el estado.
 */
export async function loadGameFromCloudSaved(
  id: string,
  pin?: string
): Promise<{ success: boolean; game?: GameState; error?: string }> {
  if (!supabase || !authManager.isAuthenticated()) {
    return { success: false, error: 'No hay conexión con la nube' };
  }

  try {
    const { data: row, error } = await supabase
      .from('saved_games')
      .select('id, name, owner, pin_hash, data')
      .eq('id', id)
      .maybeSingle();

    if (error || !row) {
      return { success: false, error: 'La partida no existe o fue eliminada' };
    }

    if (row.pin_hash) {
      if (!pin) {
        return { success: false, error: 'Esta partida está protegida con PIN' };
      }
      const candidateHash = await hashPin(pin.trim(), id);
      if (candidateHash !== row.pin_hash) {
        return { success: false, error: 'PIN incorrecto' };
      }
    }

    const normalized = normalizeGameState(row.data);
    normalized.cloudSavedId = row.id;
    normalized.cloudSavedName = row.name;
    normalized.cloudSavedOwner = row.owner;

    setStoredActiveCloudGameId(row.id);
    return { success: true, game: normalized };
  } catch (err: any) {
    console.warn('[cloudSavedGames] Excepción en loadGameFromCloudSaved:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Elimina una partida de la nube. Si tiene PIN, comprueba que coincida.
 */
export async function deleteCloudSavedGame(
  id: string,
  pin?: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase || !authManager.isAuthenticated()) {
    return { success: false, error: 'No hay conexión con la nube' };
  }

  try {
    const { data: row, error: fetchErr } = await supabase
      .from('saved_games')
      .select('id, pin_hash')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !row) {
      return { success: false, error: 'La partida no existe' };
    }

    if (row.pin_hash) {
      if (!pin) {
        return { success: false, error: 'Se requiere el PIN para eliminar esta partida' };
      }
      const candidateHash = await hashPin(pin.trim(), id);
      if (candidateHash !== row.pin_hash) {
        return { success: false, error: 'PIN incorrecto' };
      }
    }

    const { error: delErr } = await supabase.from('saved_games').delete().eq('id', id);
    if (delErr) {
      return { success: false, error: delErr.message };
    }

    if (getStoredActiveCloudGameId() === id) {
      setStoredActiveCloudGameId(null);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
