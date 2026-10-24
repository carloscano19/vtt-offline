import { contextBridge, ipcRenderer } from 'electron';
import { GameState, RulerState, CameraState } from '../src/types/game';
import { DisplayInfo, IPC_CHANNELS } from '../src/types/ipc';

contextBridge.exposeInMainWorld('electronAPI', {
  // Sincronización entre ventanas
  sendStateToPlayers: (state: GameState) => {
    ipcRenderer.send(IPC_CHANNELS.SYNC_STATE, state);
  },
  onReceiveState: (callback: (state: GameState) => void) => {
    const subscription = (_event: any, state: GameState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.SYNC_STATE, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SYNC_STATE, subscription);
  },

  sendRulerToPlayers: (ruler: RulerState) => {
    ipcRenderer.send(IPC_CHANNELS.SYNC_RULER, ruler);
  },
  onReceiveRuler: (callback: (ruler: RulerState) => void) => {
    const subscription = (_event: any, ruler: RulerState) => callback(ruler);
    ipcRenderer.on(IPC_CHANNELS.SYNC_RULER, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SYNC_RULER, subscription);
  },

  sendCameraToPlayers: (camera: CameraState) => {
    ipcRenderer.send(IPC_CHANNELS.SYNC_CAMERA, camera);
  },
  onReceiveCamera: (callback: (camera: CameraState) => void) => {
    const subscription = (_event: any, camera: CameraState) => callback(camera);
    ipcRenderer.on(IPC_CHANNELS.SYNC_CAMERA, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SYNC_CAMERA, subscription);
  },

  // Gestión de pantallas
  getDisplays: (): Promise<DisplayInfo[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_DISPLAYS);
  },
  onDisplaysChanged: (callback: (displays: DisplayInfo[]) => void) => {
    const subscription = (_event: any, displays: DisplayInfo[]) => callback(displays);
    ipcRenderer.on(IPC_CHANNELS.DISPLAYS_CHANGED, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DISPLAYS_CHANGED, subscription);
  },
  movePlayersWindow: (displayId: number, fullscreen: boolean): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.MOVE_PLAYERS_WINDOW, { displayId, fullscreen });
  },
  togglePlayersFullscreen: () => {
    ipcRenderer.send(IPC_CHANNELS.TOGGLE_PLAYERS_FULLSCREEN);
  },

  // Ciclo de vida y autoguardado antes de cerrar
  onRequestSaveBeforeQuit: (callback: () => Promise<void>) => {
    const subscription = async () => {
      try {
        await callback();
      } finally {
        ipcRenderer.send(IPC_CHANNELS.CONFIRM_SAVE_BEFORE_QUIT);
      }
    };
    ipcRenderer.on(IPC_CHANNELS.REQUEST_SAVE_BEFORE_QUIT, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.REQUEST_SAVE_BEFORE_QUIT, subscription);
  },
  confirmSaveBeforeQuit: () => {
    ipcRenderer.send(IPC_CHANNELS.CONFIRM_SAVE_BEFORE_QUIT);
  },

  // Diálogos y archivos
  showOpenDialog: (options: any) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SHOW_OPEN_DIALOG, options);
  },
  showSaveDialog: (options: any) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SHOW_SAVE_DIALOG, options);
  },
  readFileAsArrayBuffer: (filePath: string) => {
    return ipcRenderer.invoke('fs:read-buffer', filePath);
  },
  writeFileFromArrayBuffer: (filePath: string, buffer: ArrayBuffer) => {
    return ipcRenderer.invoke('fs:write-buffer', { filePath, buffer });
  },
  readTextFile: (filePath: string) => {
    return ipcRenderer.invoke('fs:read-text', filePath);
  }
});
