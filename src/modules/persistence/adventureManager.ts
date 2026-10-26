import { db } from '../../db/dexie';
import { useGameStore } from '../../stores/useGameStore';
import { syncChannel } from '../sync/syncChannel';
import { GameState } from '../../types/game';

/**
 * Borra por completo la aventura de la aplicación:
 * - Borra todos los mapas de la base de datos local (db.assets donde type === 'map').
 * - Borra todas las partidas guardadas en el navegador (db.savedGames).
 * - Borra la copia de autoguardado (db.autoSave).
 * - Reinicia la partida actual a un estado nuevo y limpio (sin mapas, tokens, paredes ni niebla).
 * - Sincroniza el nuevo estado con la ventana de jugadores.
 *
 * PRESERVA INTACTA LA BIBLIOTECA:
 * - Todos los tokens, objetos, efectos y audios de música se mantienen tanto en IndexedDB local como en Supabase.
 */
export async function clearAdventure(): Promise<void> {
  // 1. Borrar todas las partidas guardadas
  await db.savedGames.clear();

  // 2. Borrar el autoguardado
  await db.autoSave.clear();

  // 3. Borrar solo los mapas de la biblioteca de assets (dejando intactos tokens, objetos, audios, etc.)
  const mapAssets = await db.assets.where('type').equals('map').toArray();
  for (const m of mapAssets) {
    await db.assets.delete(m.id);
  }

  // 4. Reiniciar el GameState a una nueva partida limpia
  const now = Date.now();
  const freshGame: GameState = {
    id: `game_${now}_${Math.random().toString(36).substring(2, 6)}`,
    name: 'Nueva Partida',
    turnCounter: 0,
    grid: {
      size: 70,
      color: '#ffffff',
      opacity: 0.15,
      visible: true,
      snapToGrid: true
    },
    entities: [],
    playerCamera: { x: 0, y: 0, zoom: 1 },
    masterCamera: { x: 0, y: 0, zoom: 1 },
    followMasterCamera: false,
    fog: {
      enabled: true,
      rememberExplored: false,
      explored: [],
      revealed: []
    },
    ambient: {
      preset: 'noon',
      color: '#ffffff',
      intensity: 1.0
    },
    weather: {
      rain: { enabled: false, intensity: 50, direction: 90 },
      snow: { enabled: false, intensity: 50 },
      wind: { enabled: false, intensity: 50, direction: 0 }
    },
    combat: {
      active: false,
      order: [],
      currentTurnIndex: 0,
      round: 1
    },
    music: {
      playlist: [],
      currentTrackId: null,
      isPlaying: false,
      volume: 0.8,
      loopTrack: false
    },
    createdAt: now,
    updatedAt: now
  };

  useGameStore.getState().setGame(freshGame);

  // 5. Enviar el estado limpio a la pantalla de jugadores
  syncChannel.sendState(freshGame);
}
