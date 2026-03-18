const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { loadIdentity } = require('./identity');
const { runInferenceSession } = require('./openai');
const {
  completeSetup,
  getEnvValue,
  getSetupState,
  saveIdentityMarkdown,
  setOpenApiBaseUrl,
} = require('./setup');
const { startTaskRunner } = require('./task-runner');
const { logInferenceError } = require('./logger');
const {
  appendConversationEntry,
  readConversationHistory,
  writeConversationHistory,
} = require('./conversation-store');
const { broadcastConversationMessage } = require('./conversation');
const { createTelegramBridge } = require('./telegram');

app.commandLine.appendSwitch('no-sandbox');

const telegramBridge = createTelegramBridge(getEnvValue('TELEGRAM_TOKEN'));
let stopTelegramBridge = () => {};
let telegramConversationQueue = Promise.resolve();

function sendInferenceEvent(webContents, channel, payload) {
  if (!webContents.isDestroyed()) {
    webContents.send(channel, payload);
  }
}

function broadcastRendererEvent(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    const { webContents } = window;
    if (!webContents.isDestroyed()) {
      webContents.send(channel, payload);
    }
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

  ipcMain.handle('app:get-identity', () => loadIdentity());
  ipcMain.handle('app:get-setup-state', () => getSetupState());
  ipcMain.handle('app:get-conversation-history', () => readConversationHistory());
  ipcMain.handle('app:sync-conversation-history', (_event, conversation) =>
    writeConversationHistory(conversation),
  );
  ipcMain.handle('app:save-identity-markdown', (_event, markdown) =>
    saveIdentityMarkdown(markdown),
  );
  ipcMain.handle('app:save-openapi-base-url', (_event, baseUrl) =>
    setOpenApiBaseUrl(baseUrl),
  );
  ipcMain.handle('app:complete-setup', () => completeSetup());

  ipcMain.handle('app:infer', async (event, payload) => {
    const conversation = payload?.conversation;
    const requestId = payload?.requestId;

    if (!Array.isArray(conversation) || conversation.length === 0) {
      throw new Error('Conversation is required');
    }

    if (typeof requestId !== 'string' || !requestId.trim()) {
      throw new Error('requestId is required');
    }

    try {
      writeConversationHistory(conversation);

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

      appendConversationEntry({
        role: 'assistant',
        content: session.output,
      });

      if (telegramBridge.isEnabled) {
        await telegramBridge.sendMessageToKnownChats(session.output);
      }

      return session.output;
    } catch (error) {
      logInferenceError(error, {
        conversationLength: conversation.length,
      });

      sendInferenceEvent(event.sender, 'app:infer:error', {
        requestId,
        message: error instanceof Error ? error.message : 'Failed to get a reply.',
      });

      throw error;
    }
  });

  if (telegramBridge.isEnabled) {
    stopTelegramBridge = telegramBridge.start((telegramMessage) => {
      telegramConversationQueue = telegramConversationQueue
        .then(async () => {
          const userMessage = {
            role: 'user',
            content: telegramMessage.text,
            createdAt: telegramMessage.createdAt,
          };

          appendConversationEntry(userMessage);
          broadcastConversationMessage(userMessage);

          const conversation = readConversationHistory();
          const session = await runInferenceSession(conversation);
          const assistantMessage = {
            role: 'assistant',
            content: session.output,
          };

          appendConversationEntry(assistantMessage);
          broadcastConversationMessage(assistantMessage);
          await telegramBridge.sendMessageToChat(
            telegramMessage.chatId,
            session.output,
          );
        })
        .catch((error) => {
          logInferenceError(error, {
            stage: 'telegram_message_processing',
          });
        });

      return telegramConversationQueue;
    });
  }

  createWindow();
  startTaskRunner({
    onTaskResult(taskResult) {
      broadcastRendererEvent('app:task-result', taskResult);

      const output = taskResult?.output?.trim();

      if (!output) {
        return;
      }

      appendConversationEntry({
        role: 'assistant',
        content: output,
      });

      if (telegramBridge.isEnabled) {
        void telegramBridge.sendMessageToKnownChats(output);
      }
    },
  }).catch((error) => {
    logInferenceError(error, {
      stage: 'task_runner_startup',
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  stopTelegramBridge();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
