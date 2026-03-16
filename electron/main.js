const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { runInference } = require('./openai');

app.commandLine.appendSwitch('no-sandbox');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 520,
    height: 560,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  ipcMain.handle('app:infer', async (_event, message) => {
    if (typeof message !== 'string' || !message.trim()) {
      throw new Error('Message is required');
    }

    return runInference(message.trim());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
