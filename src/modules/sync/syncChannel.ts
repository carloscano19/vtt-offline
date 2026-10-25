import { GameState, RulerState, CameraState } from '../../types/game';

export type SyncMessage =
  | { type: 'STATE_SYNC'; state: GameState }
  | { type: 'RULER_SYNC'; ruler: RulerState }
  | { type: 'CAMERA_SYNC'; camera: CameraState }
  | { type: 'VIEWPORT_SYNC'; width: number; height: number }
  | { type: 'REQUEST_CURRENT_STATE' }
  | { type: 'MASTER_HELLO'; id: string }
  | { type: 'MASTER_PRESENT'; id: string }
  | { type: 'MASTER_TAKEOVER'; id: string }
  | { type: 'MASTER_CLOSED'; id: string };

const CHANNEL_NAME = 'vtt_offline_sync_channel';

class SyncManager {
  private channel: BroadcastChannel | null = null;
  private stateListeners: Set<(state: GameState) => void> = new Set();
  private rulerListeners: Set<(ruler: RulerState) => void> = new Set();
  private cameraListeners: Set<(camera: CameraState) => void> = new Set();
  private viewportListeners: Set<(vp: { width: number; height: number }) => void> = new Set();
  private requestStateListeners: Set<() => void> = new Set();

  // Control de pestaña máster única
  private readonly tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  private isMasterWindow = false;
  private canEmit = true; // Por defecto true para pantallas de jugadores (viewport, requests)
  private hasConflictState = false;
  private conflictListeners: Set<(conflict: boolean) => void> = new Set();
  private controlListeners: Set<(hasControl: boolean) => void> = new Set();
  private electionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
        const msg = event.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
          case 'MASTER_HELLO':
            // Si otra pestaña máster acaba de arrancar y yo tengo el control, respondo que estoy activo
            if (this.isMasterWindow && this.canEmit && msg.id !== this.tabId) {
              this.post({ type: 'MASTER_PRESENT', id: this.tabId });
            }
            break;

          case 'MASTER_PRESENT':
            // Recibido por la nueva pestaña: ya hay otro máster activo
            if (this.isMasterWindow && msg.id !== this.tabId) {
              if (this.electionTimer) {
                clearTimeout(this.electionTimer);
                this.electionTimer = null;
              }
              this.canEmit = false;
              this.setConflict(true);
              this.notifyControl(false);
            }
            break;

          case 'MASTER_TAKEOVER':
            // Otra pestaña ha tomado el control expresamente
            if (this.isMasterWindow && msg.id !== this.tabId) {
              this.canEmit = false;
              this.setConflict(true);
              this.notifyControl(false);
            }
            break;

          case 'MASTER_CLOSED':
            // La pestaña activa se cerró. Mantenemos el aviso sin tomar el control automáticamente;
            // el usuario tomará el control explícitamente pulsando "Usar esta".
            break;

          case 'STATE_SYNC':
            this.stateListeners.forEach((listener) => listener(msg.state));
            break;
          case 'RULER_SYNC':
            this.rulerListeners.forEach((listener) => listener(msg.ruler));
            break;
          case 'CAMERA_SYNC':
            this.cameraListeners.forEach((listener) => listener(msg.camera));
            break;
          case 'VIEWPORT_SYNC':
            this.viewportListeners.forEach((listener) => listener({ width: msg.width, height: msg.height }));
            break;
          case 'REQUEST_CURRENT_STATE':
            this.requestStateListeners.forEach((listener) => listener());
            break;
        }
      };

      window.addEventListener('beforeunload', () => {
        if (this.isMasterWindow && this.canEmit) {
          this.post({ type: 'MASTER_CLOSED', id: this.tabId });
        }
      });
    }
  }

  private post(msg: SyncMessage) {
    try {
      this.channel?.postMessage(msg);
    } catch (err) {
      console.error('[SyncManager] Error al enviar mensaje:', err);
    }
  }

  private setConflict(conflict: boolean) {
    if (this.hasConflictState === conflict) return;
    this.hasConflictState = conflict;
    this.conflictListeners.forEach((l) => l(conflict));
  }

  private notifyControl(hasControl: boolean) {
    this.controlListeners.forEach((l) => l(hasControl));
  }

  /**
   * Arranca la detección de máster único al inicializar MasterApp.
   * Anuncia su presencia y espera una respuesta breve antes de tomar el control.
   */
  public startMasterElection(): void {
    this.isMasterWindow = true;
    if (!this.channel) {
      this.canEmit = true;
      this.setConflict(false);
      this.notifyControl(true);
      return;
    }

    // Inicialmente no emite hasta confirmar que no hay conflicto
    this.canEmit = false;
    this.setConflict(false);
    this.notifyControl(false);

    this.post({ type: 'MASTER_HELLO', id: this.tabId });

    // Si nadie responde en 300 ms, somos la única pestaña activa y tomamos el control
    this.electionTimer = setTimeout(() => {
      this.electionTimer = null;
      this.canEmit = true;
      this.setConflict(false);
      this.notifyControl(true);
    }, 300);
  }

  /**
   * Fuerza la toma de control de esta pestaña sobre las demás.
   */
  public takeControl(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
    this.canEmit = true;
    this.setConflict(false);
    this.post({ type: 'MASTER_TAKEOVER', id: this.tabId });
    this.notifyControl(true);
  }

  public hasControl(): boolean {
    return this.canEmit;
  }

  public hasConflict(): boolean {
    return this.hasConflictState;
  }

  public onConflict(callback: (conflict: boolean) => void): () => void {
    this.conflictListeners.add(callback);
    return () => this.conflictListeners.delete(callback);
  }

  public onControl(callback: (hasControl: boolean) => void): () => void {
    this.controlListeners.add(callback);
    return () => this.controlListeners.delete(callback);
  }

  public sendState(state: GameState) {
    if (!this.canEmit) return;
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'STATE_SYNC', state });
      } catch (err) {
        console.error('[SyncManager] Error al enviar STATE_SYNC:', err);
      }
    }
  }

  public sendRuler(ruler: RulerState) {
    if (!this.canEmit) return;
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'RULER_SYNC', ruler });
      } catch (err) {
        console.error('[SyncManager] Error al enviar RULER_SYNC:', err);
      }
    }
  }

  public sendCamera(camera: CameraState) {
    if (!this.canEmit) return;
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'CAMERA_SYNC', camera });
      } catch (err) {
        console.error('[SyncManager] Error al enviar CAMERA_SYNC:', err);
      }
    }
  }

  public requestCurrentState() {
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'REQUEST_CURRENT_STATE' });
      } catch (err) {
        console.error('[SyncManager] Error al enviar REQUEST_CURRENT_STATE:', err);
      }
    }
  }

  public onState(callback: (state: GameState) => void): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  public onRuler(callback: (ruler: RulerState) => void): () => void {
    this.rulerListeners.add(callback);
    return () => this.rulerListeners.delete(callback);
  }

  public onCamera(callback: (camera: CameraState) => void): () => void {
    this.cameraListeners.add(callback);
    return () => this.cameraListeners.delete(callback);
  }

  public sendViewport(width: number, height: number) {
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'VIEWPORT_SYNC', width, height });
      } catch (err) {
        console.error('[SyncManager] Error al enviar VIEWPORT_SYNC:', err);
      }
    }
  }

  public onRequestState(callback: () => void): () => void {
    this.requestStateListeners.add(callback);
    return () => this.requestStateListeners.delete(callback);
  }

  public onViewport(callback: (vp: { width: number; height: number }) => void): () => void {
    this.viewportListeners.add(callback);
    return () => this.viewportListeners.delete(callback);
  }
}

export const syncChannel = new SyncManager();
