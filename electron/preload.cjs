const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('midi', {
  listDevices: () => ipcRenderer.invoke('midi:list-devices'),
  openInput: (name) => ipcRenderer.invoke('midi:open-input', name),
  closeInput: (name) => ipcRenderer.invoke('midi:close-input', name),
  openOutput: (name) => ipcRenderer.invoke('midi:open-output', name),
  closeOutput: (name) => ipcRenderer.invoke('midi:close-output', name),
  setRoutes: (routes) => ipcRenderer.invoke('midi:set-routes', routes),
  onMessage: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('midi:message', listener);
    return () => ipcRenderer.removeListener('midi:message', listener);
  },
});
