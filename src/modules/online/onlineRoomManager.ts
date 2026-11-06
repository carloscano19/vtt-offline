import { supabase, isSupabaseConfigured } from '../supabase/supabaseClient';
import { GameState } from '../../types/game';
import { saveAsset, getAsset } from '../../db/dexie';
import { invalidateCachedTexture } from '../../pixi/utils/textureCache';

export interface RemoteUser {
  id: string;
  name: string;
  role: 'master' | 'player';
  joinedAt: number;
}

export interface AssetManifestEntry {
  url: string;
  mimeType?: string;
  type?: string;
  name?: string;
  expiresAt: number;
}

export type RoomMessage =
  | { type: 'ROOM_REQUEST_STATE'; playerName: string; playerId: string }
  | { type: 'ROOM_STATE_SYNC'; state: GameState | string; isCompressed: boolean; appVersion?: string; appBuildTime?: number }
  | { type: 'ROOM_ENTITY_POS'; id: string; x: number; y: number }
  | { type: 'ROOM_ASSET_MANIFEST'; assets: Record<string, { url: string; mimeType?: string; type?: string; name?: string }> }
  | { type: 'ROOM_CLOSED' }
  | { type: 'DICE_ROLL_REQUEST'; payload: any }
  | { type: 'DICE_ROLL_RESULT'; payload: any }
  | { type: 'MOVE_STEP_REQUEST'; payload: any }
  | { type: 'MOVE_STEP_APPLIED'; payload: any }
  | { type: 'MOVE_STEP_REJECTED'; payload: any }
  | { type: 'MOVE_UNDO_REQUEST'; payload: any };

/**
 * Genera un código de sala criptográficamente seguro de 18 caracteres.
 */
export function generateRoomCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const array = new Uint8Array(18);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

/**
 * Comprime un string JSON con gzip y lo codifica en base64.
 */
export async function compressString(str: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') {
    return str;
  }
  try {
    const stream = new Blob([new TextEncoder().encode(str)])
      .stream()
      .pipeThrough(new CompressionStream('gzip'));
    const compressedBlob = await new Response(stream).blob();
    const buffer = await compressedBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.warn('[onlineRoomManager] Error comprimiendo estado, enviando sin comprimir:', err);
    return str;
  }
}

/**
 * Descomprime un string base64 comprimido con gzip.
 */
export async function decompressString(base64Str: string): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    return base64Str;
  }
  try {
    const binary = atob(base64Str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    const decompressedBlob = await new Response(stream).blob();
    return await decompressedBlob.text();
  } catch (err) {
    console.warn('[onlineRoomManager] Error descomprimiendo estado:', err);
    return base64Str;
  }
}

/**
 * Filtra el estado completo de la partida para los jugadores remotos:
 * - Omite cualquier entidad con visibleToPlayers === false.
 * - Enmascara puertas con llave como puertas normales cerradas.
 * - Filtra estados de tokens no visibles.
 * - Elimina masterCamera, historial (past, future).
 */
export function filterStateForRemote(game: GameState): GameState {
  const filteredEntities = (game.entities || [])
    .filter((ent) => ent.visibleToPlayers !== false)
    .map((ent) => {
      const copy = { ...ent };
      if (copy.type === 'door' && copy.door) {
        copy.door = {
          ...copy.door,
          isLocked: false
        };
      }
      if (Array.isArray(copy.statuses)) {
        copy.statuses = copy.statuses.filter((st) => st.visibleToPlayers !== false);
      }
      return copy;
    });

  return {
    ...game,
    entities: filteredEntities,
    masterCamera: { ...game.playerCamera }
  };
}

class OnlineRoomManager {
  private roomCode: string | null = null;
  private channel: any = null;
  private isMaster = false;
  private myUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  private myName = 'Máster';
  private signedUrlsCache = new Map<string, AssetManifestEntry>();

  // Control de jugadores conectados
  private connectedUsers: RemoteUser[] = [];
  private usersListeners = new Set<(users: RemoteUser[]) => void>();

  // Notificaciones y eventos
  private stateListeners = new Set<(state: GameState) => void>();
  private entityPosListeners = new Set<(pos: { id: string; x: number; y: number }) => void>();
  private messageListeners = new Set<(msg: RoomMessage) => void>();
  private warningListeners = new Set<(msg: string) => void>();
  private connectionStatusListeners = new Set<(status: 'connected' | 'connecting' | 'disconnected') => void>();

  // Debounce para retransmisión de estado
  private stateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSentFilteredStateJson: string | null = null;

  // Rate-limiting de posición (máx 20 mensajes por segundo = 50ms)
  private lastPosSentTimes = new Map<string, number>();
  private pendingPosTimers = new Map<string, ReturnType<typeof setTimeout>>();

  public getRoomCode(): string | null {
    return this.roomCode;
  }

  public isRoomActive(): boolean {
    return Boolean(this.roomCode && this.channel);
  }

  public getConnectedUsers(): RemoteUser[] {
    return this.connectedUsers;
  }

  public onConnectedUsers(cb: (users: RemoteUser[]) => void): () => void {
    this.usersListeners.add(cb);
    cb(this.connectedUsers);
    return () => this.usersListeners.delete(cb);
  }

  public onState(cb: (state: GameState) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  public onEntityPos(cb: (pos: { id: string; x: number; y: number }) => void): () => void {
    this.entityPosListeners.add(cb);
    return () => this.entityPosListeners.delete(cb);
  }

  public onMessage(cb: (msg: RoomMessage) => void): () => void {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  public onWarning(cb: (msg: string) => void): () => void {
    this.warningListeners.add(cb);
    return () => this.warningListeners.delete(cb);
  }

  public onConnectionStatus(cb: (status: 'connected' | 'connecting' | 'disconnected') => void): () => void {
    this.connectionStatusListeners.add(cb);
    return () => this.connectionStatusListeners.delete(cb);
  }

  private notifyStatus(status: 'connected' | 'connecting' | 'disconnected') {
    this.connectionStatusListeners.forEach((cb) => cb(status));
  }

  private notifyWarning(msg: string) {
    this.warningListeners.forEach((cb) => cb(msg));
  }

  // -------------------------------------------------------------
  // MÁSTER: CREAR Y GESTIONAR SALA
  // -------------------------------------------------------------
  public async openRoom(code?: string): Promise<string> {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Supabase no está configurado en el archivo de entorno.');
    }

    if (this.channel) {
      await this.closeRoom();
    }

    const finalCode = code || generateRoomCode();
    this.roomCode = finalCode;
    this.isMaster = true;
    this.myName = 'Máster';
    this.notifyStatus('connecting');

    const channelName = `vtt_room_${finalCode}`;
    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: this.myUserId }
      }
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        this.updatePresenceList();
      })
      .on('broadcast', { event: 'vtt_msg' }, (payload: { payload: RoomMessage }) => {
        this.handleIncomingMessage(payload.payload);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          this.notifyStatus('connected');
          await this.channel.track({
            id: this.myUserId,
            name: this.myName,
            role: 'master',
            joinedAt: Date.now()
          });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.notifyStatus('disconnected');
        }
      });

    return finalCode;
  }

  public async closeRoom(): Promise<void> {
    if (this.stateDebounceTimer) {
      clearTimeout(this.stateDebounceTimer);
      this.stateDebounceTimer = null;
    }
    this.pendingPosTimers.forEach((timer) => clearTimeout(timer));
    this.pendingPosTimers.clear();

    if (this.channel) {
      try {
        if (this.isMaster) {
          await this.sendBroadcastMessage({ type: 'ROOM_CLOSED' });
        }
        await this.channel.unsubscribe();
      } catch (err) {
        console.warn('[onlineRoomManager] Error al cerrar sala:', err);
      }
    }

    this.channel = null;
    this.roomCode = null;
    this.connectedUsers = [];
    this.usersListeners.forEach((cb) => cb([]));
    this.notifyStatus('disconnected');
  }

  private updatePresenceList() {
    if (!this.channel) return;
    const presenceState = this.channel.presenceState();
    const users: RemoteUser[] = [];
    for (const key of Object.keys(presenceState)) {
      const presences = presenceState[key];
      if (Array.isArray(presences)) {
        for (const p of presences) {
          users.push({
            id: p.id || key,
            name: p.name || 'Jugador',
            role: p.role || 'player',
            joinedAt: p.joinedAt || Date.now()
          });
        }
      }
    }
    this.connectedUsers = users;
    this.usersListeners.forEach((cb) => cb(users));
  }

  // -------------------------------------------------------------
  // MÁSTER: GENERACIÓN DE URLs FIRMADAS (SOLO DE LO VISIBLE)
  // -------------------------------------------------------------
  public async signAssetsForState(filteredGame: GameState): Promise<Record<string, { url: string; mimeType?: string; type?: string; name?: string }>> {
    if (!isSupabaseConfigured() || !supabase) return {};

    // 1. Extraer assetIds presentes en entidades visibles
    const neededAssetIds = new Set<string>();
    for (const ent of filteredGame.entities) {
      if (ent.assetId) neededAssetIds.add(ent.assetId);
    }

    // 2. Extraer assetId de la pista de música que esté sonando
    if (filteredGame.music && filteredGame.music.currentTrackId) {
      const track = filteredGame.music.playlist?.find((t) => t.id === filteredGame.music.currentTrackId);
      if (track && track.assetId) {
        neededAssetIds.add(track.assetId);
      }
    }

    const now = Date.now();
    const manifest: Record<string, { url: string; mimeType?: string; type?: string; name?: string }> = {};
    const idsToFetch: string[] = [];

    for (const id of neededAssetIds) {
      const cached = this.signedUrlsCache.get(id);
      if (cached && cached.expiresAt > now + 3600 * 1000) {
        manifest[id] = {
          url: cached.url,
          mimeType: cached.mimeType,
          type: cached.type,
          name: cached.name
        };
      } else {
        idsToFetch.push(id);
      }
    }

    if (idsToFetch.length === 0) {
      return manifest;
    }

    try {
      const { data: records, error } = await supabase
        .from('library_assets')
        .select('id, storage_path, type, mime_type, name')
        .in('id', idsToFetch);

      if (error) {
        console.warn('[onlineRoomManager] Error consultando library_assets:', error);
        this.notifyWarning('No se pudieron consultar los assets en la nube.');
        return manifest;
      }

      let failedCount = 0;
      for (const item of records || []) {
        try {
          const { data: signedData, error: signError } = await supabase.storage
            .from('vtt-assets')
            .createSignedUrl(item.storage_path, 12 * 3600);

          if (signError || !signedData?.signedUrl) {
            failedCount++;
            continue;
          }

          const entry: AssetManifestEntry = {
            url: signedData.signedUrl,
            mimeType: item.mime_type,
            type: item.type,
            name: item.name,
            expiresAt: now + 11.5 * 3600 * 1000
          };

          this.signedUrlsCache.set(item.id, entry);
          manifest[item.id] = {
            url: entry.url,
            mimeType: entry.mimeType,
            type: entry.type,
            name: entry.name
          };
        } catch {
          failedCount++;
        }
      }

      if (failedCount > 0) {
        this.notifyWarning(`Aviso: no se pudo generar URL firmada para ${failedCount} assets de la partida.`);
      }
    } catch (err) {
      console.warn('[onlineRoomManager] Error firmando assets:', err);
      this.notifyWarning('Error al generar URLs firmadas para assets.');
    }

    return manifest;
  }

  // -------------------------------------------------------------
  // MÁSTER: ENVÍO DE ESTADO (DEBOUNCED 300 MS Y COMPRESIÓN)
  // -------------------------------------------------------------
  public broadcastState(game: GameState, force = false): void {
    if (!this.channel || !this.isMaster) return;

    if (this.stateDebounceTimer) {
      clearTimeout(this.stateDebounceTimer);
      this.stateDebounceTimer = null;
    }

    if (force) {
      this.doBroadcastState(game);
      return;
    }

    this.stateDebounceTimer = setTimeout(() => {
      this.doBroadcastState(game);
    }, 300);
  }

  private async doBroadcastState(game: GameState): Promise<void> {
    if (!this.channel || !this.isMaster) return;

    const filtered = filterStateForRemote(game);
    const jsonStr = JSON.stringify(filtered);

    // Evitar reenvíos si el estado filtrado es idéntico al último enviado
    if (jsonStr === this.lastSentFilteredStateJson) return;
    this.lastSentFilteredStateJson = jsonStr;

    // Firmar assets de lo visible
    const assetManifest = await this.signAssetsForState(filtered);
    if (Object.keys(assetManifest).length > 0) {
      await this.sendBroadcastMessage({
        type: 'ROOM_ASSET_MANIFEST',
        assets: assetManifest
      });
    }

    // Comprimir con gzip si el JSON supera ~150 KB
    let payloadState: GameState | string = filtered;
    let isCompressed = false;
    if (jsonStr.length > 150 * 1024) {
      payloadState = await compressString(jsonStr);
      isCompressed = true;
    }

    await this.sendBroadcastMessage({
      type: 'ROOM_STATE_SYNC',
      state: payloadState,
      isCompressed,
      appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
      appBuildTime: typeof __APP_BUILD_TIME__ !== 'undefined' ? Number(__APP_BUILD_TIME__) : undefined
    });
  }

  // -------------------------------------------------------------
  // MÁSTER: ENVÍO DE POSICIÓN CON RATE-LIMIT (MÁX 20 MSGS/S = 50 MS)
  // -------------------------------------------------------------
  public broadcastEntityPos(id: string, x: number, y: number): void {
    if (!this.channel || !this.isMaster) return;

    const now = performance.now();
    const lastTime = this.lastPosSentTimes.get(id) || 0;
    const elapsed = now - lastTime;

    if (elapsed >= 50) {
      // Enviar inmediatamente
      this.lastPosSentTimes.set(id, now);
      const existingTimer = this.pendingPosTimers.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.pendingPosTimers.delete(id);
      }
      this.sendBroadcastMessage({ type: 'ROOM_ENTITY_POS', id, x, y });
    } else {
      // Programar envío retardado para no sobrepasar 20 msg/s
      if (!this.pendingPosTimers.has(id)) {
        const remaining = 50 - elapsed;
        const timer = setTimeout(() => {
          this.pendingPosTimers.delete(id);
          this.lastPosSentTimes.set(id, performance.now());
          this.sendBroadcastMessage({ type: 'ROOM_ENTITY_POS', id, x, y });
        }, remaining);
        this.pendingPosTimers.set(id, timer);
      }
    }
  }

  // -------------------------------------------------------------
  // JUGADOR REMOTO: CONEXIÓN A SALA
  // -------------------------------------------------------------
  public async connectAsPlayer(code: string, playerName: string): Promise<void> {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Supabase no está configurado en el archivo de entorno.');
    }

    if (this.channel) {
      await this.closeRoom();
    }

    this.roomCode = code.toLowerCase().trim();
    this.isMaster = false;
    this.myName = playerName.trim() || 'Jugador Remoto';
    this.notifyStatus('connecting');

    const channelName = `vtt_room_${this.roomCode}`;
    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: this.myUserId }
      }
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        this.updatePresenceList();
      })
      .on('broadcast', { event: 'vtt_msg' }, (payload: { payload: RoomMessage }) => {
        this.handleIncomingMessage(payload.payload);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          this.notifyStatus('connected');
          await this.channel.track({
            id: this.myUserId,
            name: this.myName,
            role: 'player',
            joinedAt: Date.now()
          });
          // Pedir estado completo al máster
          this.sendBroadcastMessage({
            type: 'ROOM_REQUEST_STATE',
            playerName: this.myName,
            playerId: this.myUserId
          });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.notifyStatus('disconnected');
        }
      });
  }

  // -------------------------------------------------------------
  // MENSAJES Y COMUNICACIÓN BROADCAST
  // -------------------------------------------------------------
  public async sendBroadcastMessage(msg: RoomMessage): Promise<void> {
    if (!this.channel) return;
    try {
      await this.channel.send({
        type: 'broadcast',
        event: 'vtt_msg',
        payload: msg
      });
    } catch (err) {
      console.warn('[onlineRoomManager] Error enviando broadcast:', err);
    }
  }

  private async handleIncomingMessage(msg: RoomMessage): Promise<void> {
    if (!msg || !msg.type) return;

    // Notificar a todos los listeners genéricos de mensajes
    this.messageListeners.forEach((cb) => cb(msg));

    switch (msg.type) {
      case 'ROOM_REQUEST_STATE':
        if (this.isMaster) {
          // El máster recibe la petición de un jugador y le responde de inmediato
          const { useGameStore } = await import('../../stores/useGameStore');
          const currentMasterGame = useGameStore.getState().game;
          this.doBroadcastState(currentMasterGame);
        }
        break;

      case 'ROOM_STATE_SYNC':
        if (!this.isMaster) {
          let decompressedState: GameState;
          if (msg.isCompressed && typeof msg.state === 'string') {
            const rawJson = await decompressString(msg.state);
            decompressedState = JSON.parse(rawJson);
          } else {
            decompressedState = msg.state as GameState;
          }
          this.stateListeners.forEach((cb) => cb(decompressedState));
        }
        break;

      case 'ROOM_ENTITY_POS':
        this.entityPosListeners.forEach((cb) => cb({ id: msg.id, x: msg.x, y: msg.y }));
        break;

      case 'ROOM_ASSET_MANIFEST':
        if (!this.isMaster && msg.assets) {
          this.downloadAndCacheAssets(msg.assets);
        }
        break;

      case 'ROOM_CLOSED':
        if (!this.isMaster) {
          this.notifyWarning('La sala ha sido cerrada por el máster.');
          this.closeRoom();
        }
        break;
    }
  }

  private async downloadAndCacheAssets(
    assets: Record<string, { url: string; mimeType?: string; type?: string; name?: string }>
  ): Promise<void> {
    for (const [id, item] of Object.entries(assets)) {
      try {
        const existing = await getAsset(id);
        if (existing && existing.blob && existing.blob.size > 0) {
          continue;
        }

        const res = await fetch(item.url);
        if (!res.ok) continue;
        const blob = await res.blob();

        await saveAsset({
          id,
          name: item.name || id,
          type: (item.type as any) || 'token',
          mimeType: item.mimeType || blob.type || 'image/png',
          blob,
          createdAt: Date.now()
        });

        invalidateCachedTexture(id);
      } catch (err) {
        console.warn(`[onlineRoomManager] Error descargando asset ${id}:`, err);
      }
    }
  }
}

export const onlineRoomManager = new OnlineRoomManager();
