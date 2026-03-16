const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { runInference } = require('./openai');
const { logInferenceError, logUserMessage } = require('./logger');

app.commandLine.appendSwitch('no-sandbox');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1020,
    height: 988,
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

  ipcMain.handle('app:infer', async (_event, conversation) => {
    if (!Array.isArray(conversation) || conversation.length === 0) {
      throw new Error('Conversation is required');
    }

    const latestUserMessage = [...conversation]
      .reverse()
      .find((entry) => entry?.role === 'user' && typeof entry.content === 'string');

    if (latestUserMessage?.content?.trim()) {
      logUserMessage(latestUserMessage.content.trim(), {
        conversationLength: conversation.length,
      });
    }

    try {
      return await runInference(conversation);
    } catch (error) {
      logInferenceError(error, {
        conversationLength: conversation.length,
      });
      throw error;
    }
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
