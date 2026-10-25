import { GameState, RulerState, CameraState } from '../../types/game';

export type SyncMessage =
  | { type: 'STATE_SYNC'; state: GameState }
  | { type: 'RULER_SYNC'; ruler: RulerState }
  | { type: 'CAMERA_SYNC'; camera: CameraState }
  | { type: 'VIEWPORT_SYNC'; width: number; height: number }
  | { type: 'REQUEST_CURRENT_STATE' };

const CHANNEL_NAME = 'vtt_offline_sync_channel';

class SyncManager {
  private channel: BroadcastChannel | null = null;
  private stateListeners: Set<(state: GameState) => void> = new Set();
  private rulerListeners: Set<(ruler: RulerState) => void> = new Set();
  private cameraListeners: Set<(camera: CameraState) => void> = new Set();
  private viewportListeners: Set<(vp: { width: number; height: number }) => void> = new Set();
  private requestStateListeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
        const msg = event.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
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
    }
  }

  public sendState(state: GameState) {
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'STATE_SYNC', state });
      } catch (err) {
        console.error('[SyncManager] Error al enviar STATE_SYNC:', err);
      }
    }
  }

  public sendRuler(ruler: RulerState) {
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'RULER_SYNC', ruler });
      } catch (err) {
        console.error('[SyncManager] Error al enviar RULER_SYNC:', err);
      }
    }
  }

  public sendCamera(camera: CameraState) {
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
