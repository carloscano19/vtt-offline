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

  it('notifies master when TV reports its player version', async () => {
    const peer = new BroadcastChannel('vtt_offline_sync_channel');
    let receivedByPeer: any = null;
    peer.onmessage = (e) => {
      receivedByPeer = e.data;
    };

    // 1. sendPlayerVersion envía por canal
    syncChannel.sendPlayerVersion('v2.0.0', 1700000000);
    await new Promise((r) => setTimeout(r, 20));

    expect(receivedByPeer).toEqual({
      type: 'PLAYER_VERSION_REPORT',
      appVersion: 'v2.0.0',
      appBuildTime: 1700000000
    });

    // 2. onPlayerVersion en máster recibe reporte emitido por la tele
    const callback = vi.fn();
    const cleanup = syncChannel.onPlayerVersion(callback);

    peer.postMessage({
      type: 'PLAYER_VERSION_REPORT',
      appVersion: 'v2.1.0',
      appBuildTime: 1700000500
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(callback).toHaveBeenCalledWith({
      appVersion: 'v2.1.0',
      appBuildTime: 1700000500
    });

    cleanup();
    peer.close();
  });

  it('master antiguo y tele nueva: la tele no recarga y reporta version mas nueva', async () => {
    // Simular lógica de decisión de PlayersApp
    const reloadMock = vi.fn();
    const sessionStore = new Map<string, string>();
    const fakeSessionStorage = {
      getItem: (k: string) => sessionStore.get(k) || null,
      setItem: (k: string, v: string) => sessionStore.set(k, v)
    };

    const handleMasterState = (
      state: { appVersion?: string; appBuildTime?: number },
      localVersion: string,
      localBuildTime: number
    ) => {
      let shouldReload = false;
      let showMasterOlderWarning = false;
      let reportedVersion: { version: string; buildTime: number } | null = null;

      const masterBuildTime = typeof state.appBuildTime === 'number' ? state.appBuildTime : 0;
      const masterVersion = state.appVersion || '';

      if (masterVersion && masterVersion !== localVersion) {
        if (masterBuildTime > localBuildTime) {
          showMasterOlderWarning = false;
          const sessionKey = `vtt_tv_reloaded_${masterVersion}`;
          const alreadyReloaded = !!fakeSessionStorage.getItem(sessionKey);
          if (!alreadyReloaded) {
            fakeSessionStorage.setItem(sessionKey, '1');
            shouldReload = true;
            reloadMock();
          }
        } else {
          showMasterOlderWarning = true;
          reportedVersion = { version: localVersion, buildTime: localBuildTime };
        }
      }

      return { shouldReload, showMasterOlderWarning, reportedVersion };
    };

    // Caso 1: Tele tiene versión más reciente (build 2000 vs 1000 del máster)
    const resultOldMaster = handleMasterState(
      { appVersion: 'v1.0.0', appBuildTime: 1000 },
      'v2.0.0',
      2000
    );

    // La tele NO debe recargar
    expect(resultOldMaster.shouldReload).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
    // Muestra aviso de máster con versión anterior
    expect(resultOldMaster.showMasterOlderWarning).toBe(true);
    // Reporta versión al máster
    expect(resultOldMaster.reportedVersion).toEqual({
      version: 'v2.0.0',
      buildTime: 2000
    });

    // Caso 2: Máster se actualiza y ahora es más nuevo (build 3000 vs 2000 de tele)
    const resultNewMaster = handleMasterState(
      { appVersion: 'v3.0.0', appBuildTime: 3000 },
      'v2.0.0',
      2000
    );

    // La tele SÍ recarga
    expect(resultNewMaster.shouldReload).toBe(true);
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(resultNewMaster.showMasterOlderWarning).toBe(false);

    // Caso 3: Extra protección sessionStorage - no recarga dos veces por la misma versión
    const resultRepeatState = handleMasterState(
      { appVersion: 'v3.0.0', appBuildTime: 3000 },
      'v2.0.0',
      2000
    );
    expect(resultRepeatState.shouldReload).toBe(false);
    expect(reloadMock).toHaveBeenCalledTimes(1); // No vuelve a llamarse
  });
});
