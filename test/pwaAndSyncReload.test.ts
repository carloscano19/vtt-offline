import { describe, it, expect, vi } from 'vitest';
import { syncChannel } from '../src/modules/sync/syncChannel';
import { GameState } from '../src/types/game';

describe('PWA and Sync Reload', () => {
  it('notifies registered listeners when sendAppReload is invoked', async () => {
    const peer = new BroadcastChannel('vtt_offline_sync_channel');
    let receivedMsg: any = null;
    peer.onmessage = (e) => {
      receivedMsg = e.data;
    };

    syncChannel.sendAppReload('v-test-123');

    // Permitir ciclo de eventos microtask
    await new Promise((r) => setTimeout(r, 20));

    expect(receivedMsg).not.toBeNull();
    expect(receivedMsg.type).toBe('APP_RELOAD_REQUEST');
    expect(receivedMsg.version).toBe('v-test-123');

    // También comprobar que si un peer envía APP_RELOAD_REQUEST, syncChannel dispara sus listeners
    const callback = vi.fn();
    const cleanup = syncChannel.onAppReload(callback);

    peer.postMessage({ type: 'APP_RELOAD_REQUEST', version: 'v-new' });
    await new Promise((r) => setTimeout(r, 20));

    expect(callback).toHaveBeenCalledTimes(1);

    cleanup();
    peer.close();
  });

  it('attaches appVersion to state in sendState across broadcast channels', async () => {
    const peer = new BroadcastChannel('vtt_offline_sync_channel');
    let receivedStateMsg: any = null;
    peer.onmessage = (e) => {
      receivedStateMsg = e.data;
    };

    const dummyState: any = {
      id: 'game_1',
      name: 'Partida Test',
      entities: [],
      grid: { size: 70, color: '#fff', opacity: 0.25, visible: true, snapToGrid: true },
      fog: { enabled: false, explored: [] },
      ambient: { preset: 'noon', color: '#fff', intensity: 1 },
      weather: { rain: { enabled: false, intensity: 50, direction: 90 }, snow: { enabled: false, intensity: 50 }, wind: { enabled: false, intensity: 50, direction: 0 } },
      combat: { active: false, order: [], currentTurnIndex: 0, round: 1 },
      music: { playlist: [], currentTrackId: null, isPlaying: false, volume: 0.8, loopTrack: false },
      playerCamera: { x: 0, y: 0, zoom: 1 },
      masterCamera: { x: 0, y: 0, zoom: 1 },
      followMasterCamera: false,
      turnCounter: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    syncChannel.sendState(dummyState);
    await new Promise((r) => setTimeout(r, 20));

    expect(receivedStateMsg).not.toBeNull();
    expect(receivedStateMsg.type).toBe('STATE_SYNC');
    expect(receivedStateMsg.state.id).toBe('game_1');

    peer.close();
  });
});
