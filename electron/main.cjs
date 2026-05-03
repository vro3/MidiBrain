const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
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

ipcMain.handle('resolume:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Resolume Preset',
    properties: ['openFile'],
    filters: [
      { name: 'Resolume MIDI Preset', extensions: ['xml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const text = await fs.readFile(filePath, 'utf8');
  return { path: filePath, text };
});

ipcMain.handle('resolume:save-file', async (_e, targetPath, text) => {
  let outPath = targetPath;
  if (!outPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Resolume Preset',
      defaultPath: 'preset.xml',
      filters: [{ name: 'Resolume MIDI Preset', extensions: ['xml'] }],
    });
    if (result.canceled || !result.filePath) return null;
    outPath = result.filePath;
  }
  await fs.writeFile(outPath, text, 'utf8');
  return { path: outPath };
});

ipcMain.handle('shell:open-external', (_e, url) => shell.openExternal(url));

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const sendToFocused = (channel) => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (win && !win.isDestroyed()) win.webContents.send(channel);
  };

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Resolume Preset…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToFocused('menu:open-resolume'),
        },
        {
          label: 'Save Resolume Preset',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToFocused('menu:save-resolume'),
        },
        {
          label: 'Save Resolume Preset As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendToFocused('menu:save-resolume-as'),
        },
        { type: 'separator' },
        {
          label: 'Close Resolume Editor',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendToFocused('menu:close-resolume'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'loopMIDI (Windows virtual ports)',
          click: () => shell.openExternal('https://www.tobias-erichsen.de/software/loopmidi.html'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  midiEngine.shutdown();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
