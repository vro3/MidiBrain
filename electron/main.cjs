const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const midiEngine = require('./midi-engine.cjs');

// Main-process crash logging. Replace console with Sentry init for commercial
// builds — see src/telemetry.ts for the mirrored renderer-side hook.
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection', reason);
});

const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'MidiBrain',
    backgroundColor: '#111116',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow = win;

  midiEngine.setMessageListener((payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('midi:message', payload);
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:3456');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

ipcMain.handle('midi:list-devices', () => midiEngine.listDevices());
ipcMain.handle('midi:open-input', (_e, name) => midiEngine.openInput(name));
ipcMain.handle('midi:close-input', (_e, name) => midiEngine.closeInput(name));
ipcMain.handle('midi:open-output', (_e, name) => midiEngine.openOutput(name));
ipcMain.handle('midi:close-output', (_e, name) => midiEngine.closeOutput(name));
ipcMain.handle('midi:set-routes', (_e, routes) => midiEngine.setRoutes(routes));
ipcMain.handle('midi:send-raw', (_e, outputName, bytes) => midiEngine.sendRaw(outputName, bytes));
ipcMain.handle('midi:list-virtual', () => midiEngine.listVirtualPorts());
ipcMain.handle('midi:create-virtual-input', (_e, name) => midiEngine.createVirtualInput(name));
ipcMain.handle('midi:create-virtual-output', (_e, name) => midiEngine.createVirtualOutput(name));
ipcMain.handle('midi:destroy-virtual-input', (_e, name) => midiEngine.destroyVirtualInput(name));
ipcMain.handle('midi:destroy-virtual-output', (_e, name) => midiEngine.destroyVirtualOutput(name));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  midiEngine.shutdown();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
