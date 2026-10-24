import { app, BrowserWindow, screen, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { IPC_CHANNELS } from '../src/types/ipc';

process.env.DIST = path.join(__dirname, '..', 'dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '..', 'public');

let masterWindow: BrowserWindow | null = null;
let playersWindow: BrowserWindow | null = null;
let isQuitting = false;
let saveConfirmed = false;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function getDisplaysInfo() {
  const primary = screen.getPrimaryDisplay();
  const allDisplays = screen.getAllDisplays();

  return allDisplays.map((disp, index) => ({
    id: disp.id,
    label: disp.label || `Pantalla ${index + 1} (${disp.bounds.width}x${disp.bounds.height})`,
    bounds: {
      x: disp.bounds.x,
      y: disp.bounds.y,
      width: disp.bounds.width,
      height: disp.bounds.height
    },
    isPrimary: disp.id === primary.id
  }));
}

function createMasterWindow() {
  masterWindow = new BrowserWindow({
    title: 'VTT Offline - Máster',
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (VITE_DEV_SERVER_URL) {
    masterWindow.loadURL(`${VITE_DEV_SERVER_URL}?window=master`);
  } else {
    masterWindow.loadFile(path.join(process.env.DIST!, 'index.html'), {
      query: { window: 'master' }
    });
  }

  masterWindow.on('closed', () => {
    masterWindow = null;
    // Si se cierra la ventana máster, cerramos la aplicación
    if (playersWindow && !playersWindow.isDestroyed()) {
      playersWindow.close();
    }
  });
}

function createPlayersWindow() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const secondDisplay = displays.find((d) => d.id !== primary.id);

  let windowOptions: Electron.BrowserWindowConstructorOptions = {
    title: 'VTT Offline - Jugadores',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  };

  if (secondDisplay) {
    // Se detectó segunda pantalla: abrir a pantalla completa en ella
    windowOptions = {
      ...windowOptions,
      x: secondDisplay.bounds.x,
      y: secondDisplay.bounds.y,
      width: secondDisplay.bounds.width,
      height: secondDisplay.bounds.height,
      fullscreen: true
    };
  } else {
    // Solo hay una pantalla: abrir como ventana normal
    windowOptions = {
      ...windowOptions,
      width: 1024,
      height: 768,
      fullscreen: false
    };
  }

  playersWindow = new BrowserWindow(windowOptions);
  playersWindow.setMenu(null);

  if (VITE_DEV_SERVER_URL) {
    playersWindow.loadURL(`${VITE_DEV_SERVER_URL}?window=players`);
  } else {
    playersWindow.loadFile(path.join(process.env.DIST!, 'index.html'), {
      query: { window: 'players' }
    });
  }

  // Atajo F11 para alternar pantalla completa en la ventana de jugadores
  playersWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      if (playersWindow) {
        playersWindow.setFullScreen(!playersWindow.isFullScreen());
        event.preventDefault();
      }
    }
  });

  playersWindow.on('closed', () => {
    playersWindow = null;
  });
}

function setupIpcHandlers() {
  // Sincronización de estado Máster -> Jugadores
  ipcMain.on(IPC_CHANNELS.SYNC_STATE, (_event, state) => {
    if (playersWindow && !playersWindow.isDestroyed()) {
      playersWindow.webContents.send(IPC_CHANNELS.SYNC_STATE, state);
    }
  });

  // Sincronización de regla
  ipcMain.on(IPC_CHANNELS.SYNC_RULER, (_event, ruler) => {
    if (playersWindow && !playersWindow.isDestroyed()) {
      playersWindow.webContents.send(IPC_CHANNELS.SYNC_RULER, ruler);
    }
  });

  // Sincronización de cámara
  ipcMain.on(IPC_CHANNELS.SYNC_CAMERA, (_event, camera) => {
    if (playersWindow && !playersWindow.isDestroyed()) {
      playersWindow.webContents.send(IPC_CHANNELS.SYNC_CAMERA, camera);
    }
  });

  // Consulta de pantallas disponibles
  ipcMain.handle(IPC_CHANNELS.GET_DISPLAYS, () => {
    return getDisplaysInfo();
  });

  // Mover ventana de jugadores a pantalla específica
  ipcMain.handle(IPC_CHANNELS.MOVE_PLAYERS_WINDOW, (_event, { displayId, fullscreen }) => {
    if (!playersWindow || playersWindow.isDestroyed()) {
      createPlayersWindow();
    }
    if (!playersWindow) return false;

    const displays = screen.getAllDisplays();
    const targetDisplay = displays.find((d) => d.id === displayId);
    if (targetDisplay) {
      if (playersWindow.isFullScreen()) {
        playersWindow.setFullScreen(false);
      }
      playersWindow.setBounds({
        x: targetDisplay.bounds.x,
        y: targetDisplay.bounds.y,
        width: targetDisplay.bounds.width,
        height: targetDisplay.bounds.height
      });
      if (fullscreen) {
        playersWindow.setFullScreen(true);
      }
      return true;
    }
    return false;
  });

  // Alternar pantalla completa de jugadores
  ipcMain.on(IPC_CHANNELS.TOGGLE_PLAYERS_FULLSCREEN, () => {
    if (playersWindow && !playersWindow.isDestroyed()) {
      playersWindow.setFullScreen(!playersWindow.isFullScreen());
    }
  });

  // Confirmación de autoguardado recibido desde la ventana máster
  ipcMain.on(IPC_CHANNELS.CONFIRM_SAVE_BEFORE_QUIT, () => {
    saveConfirmed = true;
    if (isQuitting) {
      app.quit();
    }
  });

  // Diálogo para abrir archivos
  ipcMain.handle(IPC_CHANNELS.SHOW_OPEN_DIALOG, async (_event, options) => {
    const parentWin = masterWindow ?? undefined;
    return await dialog.showOpenDialog(parentWin!, options);
  });

  // Diálogo para guardar archivo
  ipcMain.handle(IPC_CHANNELS.SHOW_SAVE_DIALOG, async (_event, options) => {
    const parentWin = masterWindow ?? undefined;
    return await dialog.showSaveDialog(parentWin!, options);
  });

  // Lectura/escritura de buffers de archivos nativos
  ipcMain.handle('fs:read-buffer', async (_event, filePath: string) => {
    const buffer = await fs.readFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  ipcMain.handle('fs:write-buffer', async (_event, { filePath, buffer }: { filePath: string; buffer: ArrayBuffer }) => {
    await fs.writeFile(filePath, Buffer.from(buffer));
    return true;
  });

  ipcMain.handle('fs:read-text', async (_event, filePath: string) => {
    return await fs.readFile(filePath, 'utf-8');
  });
}

function setupScreenEvents() {
  const notifyDisplaysChanged = () => {
    if (masterWindow && !masterWindow.isDestroyed()) {
      masterWindow.webContents.send(IPC_CHANNELS.DISPLAYS_CHANGED, getDisplaysInfo());
    }
  };

  screen.on('display-added', notifyDisplaysChanged);
  screen.on('display-removed', notifyDisplaysChanged);
  screen.on('display-metrics-changed', notifyDisplaysChanged);
}

app.whenReady().then(() => {
  setupIpcHandlers();
  setupScreenEvents();
  createMasterWindow();
  createPlayersWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMasterWindow();
      createPlayersWindow();
    }
  });
});

// Autoguardado al cerrar la aplicación (before-quit) con timeout de 3 segundos
app.on('before-quit', (event) => {
  if (!saveConfirmed && masterWindow && !masterWindow.isDestroyed()) {
    event.preventDefault();
    isQuitting = true;

    // Pedir autoguardado a la ventana máster
    masterWindow.webContents.send(IPC_CHANNELS.REQUEST_SAVE_BEFORE_QUIT);

    // Timeout de 3 segundos por seguridad para no colgar el cierre
    setTimeout(() => {
      saveConfirmed = true;
      app.quit();
    }, 3000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
