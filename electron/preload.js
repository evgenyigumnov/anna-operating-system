const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appControls', {
  quit: () => ipcRenderer.invoke('app:quit'),
  infer: (conversation) => ipcRenderer.invoke('app:infer', conversation),
});
