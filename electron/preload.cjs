const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('platform', {
  os: process.platform, // 'darwin' | 'win32' | 'linux'
});

contextBridge.exposeInMainWorld('midi', {
  listDevices: () => ipcRenderer.invoke('midi:list-devices'),
  openInput: (name) => ipcRenderer.invoke('midi:open-input', name),
  closeInput: (name) => ipcRenderer.invoke('midi:close-input', name),
  openOutput: (name) => ipcRenderer.invoke('midi:open-output', name),
  closeOutput: (name) => ipcRenderer.invoke('midi:close-output', name),
  setRoutes: (routes) => ipcRenderer.invoke('midi:set-routes', routes),
  sendRaw: (outputName, bytes) => ipcRenderer.invoke('midi:send-raw', outputName, bytes),
  listVirtualPorts: () => ipcRenderer.invoke('midi:list-virtual'),
  createVirtualInput: (name) => ipcRenderer.invoke('midi:create-virtual-input', name),
  createVirtualOutput: (name) => ipcRenderer.invoke('midi:create-virtual-output', name),
  destroyVirtualInput: (name) => ipcRenderer.invoke('midi:destroy-virtual-input', name),
  destroyVirtualOutput: (name) => ipcRenderer.invoke('midi:destroy-virtual-output', name),
  onMessage: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('midi:message', listener);
    return () => ipcRenderer.removeListener('midi:message', listener);
  },
  openResolumeFile: () => ipcRenderer.invoke('resolume:open-file'),
  saveResolumeFile: (path, text) => ipcRenderer.invoke('resolume:save-file', path, text),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
});
