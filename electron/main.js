const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { runInferenceSession } = require('./openai');
const { logInferenceError, logUserMessage } = require('./logger');

app.commandLine.appendSwitch('no-sandbox');

function sendInferenceEvent(webContents, channel, payload) {
  if (!webContents.isDestroyed()) {
    webContents.send(channel, payload);
  }
}

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

  ipcMain.handle('app:infer', async (event, payload) => {
    const conversation = payload?.conversation;
    const requestId = payload?.requestId;

    if (!Array.isArray(conversation) || conversation.length === 0) {
      throw new Error('Conversation is required');
    }

    if (typeof requestId !== 'string' || !requestId.trim()) {
      throw new Error('requestId is required');
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
      const session = await runInferenceSession(conversation, {
        onTextDelta(delta) {
          sendInferenceEvent(event.sender, 'app:infer:chunk', {
            requestId,
            delta,
          });
        },
      });

      sendInferenceEvent(event.sender, 'app:infer:done', {
        requestId,
        output: session.output,
      });

      return session.output;
    } catch (error) {
      logInferenceError(error, {
        conversationLength: conversation.length,
      });

      sendInferenceEvent(event.sender, 'app:infer:error', {
        requestId,
        message:
          error instanceof Error ? error.message : 'Не удалось получить ответ.',
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
