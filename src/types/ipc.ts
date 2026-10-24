import { GameState, RulerState, CameraState } from './game';

export interface DisplayInfo {
  id: number;
  label: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isPrimary: boolean;
}

export interface IpcChannels {
  // Sync
  SYNC_STATE: 'sync:state';
  SYNC_RULER: 'sync:ruler';
  SYNC_CAMERA: 'sync:camera';

  // Displays & Window management
  GET_DISPLAYS: 'displays:get';
  DISPLAYS_CHANGED: 'displays:changed';
  MOVE_PLAYERS_WINDOW: 'players:move';
  TOGGLE_PLAYERS_FULLSCREEN: 'players:toggle-fullscreen';

  // Quit and Autosave
  REQUEST_SAVE_BEFORE_QUIT: 'app:request-save-before-quit';
  CONFIRM_SAVE_BEFORE_QUIT: 'app:confirm-save-before-quit';

  // Native Dialogs
  SHOW_OPEN_DIALOG: 'dialog:open-file';
  SHOW_SAVE_DIALOG: 'dialog:save-file';
}

export const IPC_CHANNELS: IpcChannels = {
  SYNC_STATE: 'sync:state',
  SYNC_RULER: 'sync:ruler',
  SYNC_CAMERA: 'sync:camera',
  GET_DISPLAYS: 'displays:get',
  DISPLAYS_CHANGED: 'displays:changed',
  MOVE_PLAYERS_WINDOW: 'players:move',
  TOGGLE_PLAYERS_FULLSCREEN: 'players:toggle-fullscreen',
  REQUEST_SAVE_BEFORE_QUIT: 'app:request-save-before-quit',
  CONFIRM_SAVE_BEFORE_QUIT: 'app:confirm-save-before-quit',
  SHOW_OPEN_DIALOG: 'dialog:open-file',
  SHOW_SAVE_DIALOG: 'dialog:save-file'
};

export interface ElectronAPI {
  // Sync
  sendStateToPlayers: (state: GameState) => void;
  onReceiveState: (callback: (state: GameState) => void) => () => void;
  sendRulerToPlayers: (ruler: RulerState) => void;
  onReceiveRuler: (callback: (ruler: RulerState) => void) => () => void;
  sendCameraToPlayers: (camera: CameraState) => void;
  onReceiveCamera: (callback: (camera: CameraState) => void) => () => void;

  // Displays
  getDisplays: () => Promise<DisplayInfo[]>;
  onDisplaysChanged: (callback: (displays: DisplayInfo[]) => void) => () => void;
  movePlayersWindow: (displayId: number, fullscreen: boolean) => Promise<boolean>;
  togglePlayersFullscreen: () => void;

  // Lifecycle
  onRequestSaveBeforeQuit: (callback: () => Promise<void>) => () => void;
  confirmSaveBeforeQuit: () => void;

  // Native dialogs
  showOpenDialog: (options: { title?: string; filters?: { name: string; extensions: string[] }[]; properties?: string[] }) => Promise<{ canceled: boolean; filePaths: string[] }>;
  showSaveDialog: (options: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePath?: string }>;
  readFileAsArrayBuffer: (filePath: string) => Promise<ArrayBuffer>;
  writeFileFromArrayBuffer: (filePath: string, buffer: ArrayBuffer) => Promise<boolean>;
  readTextFile: (filePath: string) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
