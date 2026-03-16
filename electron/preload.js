const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appControls', {
  quit: () => ipcRenderer.invoke('app:quit'),
  infer: (message) => ipcRenderer.invoke('app:infer', message),
});
