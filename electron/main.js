const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { loadIdentity } = require('./identity');
const { getSystemInfo } = require('./system-info');
const { runInferenceSession } = require('./openai');
const { startHooks } = require('./hook-runner');
const {
  completeSetup,
  getEnvValue,
  getSetupState,
  saveEmailMarkdown,
  saveEmailSettings,
  saveIdentityMarkdown,
  saveTelegramSettings,
  saveUserMarkdown,
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
const {
  deliverConversationEntry,
  mirrorConversationEntryToTelegram,
  setTelegramBridge,
} = require('./message-delivery');

app.commandLine.appendSwitch('no-sandbox');

const telegramBridge = createTelegramBridge(getEnvValue('TELEGRAM_TOKEN'));
setTelegramBridge(telegramBridge);
let stopTelegramBridge = () => {};
let stopHooks = async () => {};
let telegramConversationQueue = Promise.resolve();

function extractTelegramChatIds(conversation) {
  if (!Array.isArray(conversation)) {
    return [];
  }

  const chatIds = new Set();

  for (const entry of conversation) {
    const isTelegramEntry = entry?.source === 'telegram';
    const chatId = entry?.chatId;

    if (
      !isTelegramEntry ||
      !(
        (typeof chatId === 'string' && chatId.trim()) ||
        typeof chatId === 'number'
      )
    ) {
      continue;
    }

    chatIds.add(typeof chatId === 'string' ? chatId.trim() : chatId);
  }

  return [...chatIds];
}

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
  ipcMain.handle('app:get-system-info', () => getSystemInfo());
  ipcMain.handle('app:get-setup-state', () => getSetupState());
  ipcMain.handle('app:get-conversation-history', () => readConversationHistory());
  ipcMain.handle('app:sync-conversation-history', (_event, conversation) =>
    writeConversationHistory(conversation),
  );
  ipcMain.handle('app:save-user-markdown', (_event, markdown) =>
    saveUserMarkdown(markdown),
  );
  ipcMain.handle('app:save-email-markdown', (_event, markdown) =>
    saveEmailMarkdown(markdown),
  );
  ipcMain.handle('app:save-email-settings', (_event, settings) =>
    saveEmailSettings(settings),
  );
  ipcMain.handle('app:save-telegram-settings', (_event, settings) =>
    saveTelegramSettings(settings),
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

      const latestUserMessage = [...conversation]
        .reverse()
        .find((entry) => entry?.role === 'user' && typeof entry?.content === 'string');

      if (latestUserMessage) {
        await mirrorConversationEntryToTelegram(latestUserMessage);
      }

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
    telegramBridge.rememberChatIds(extractTelegramChatIds(readConversationHistory()));

    stopTelegramBridge = telegramBridge.start((telegramMessage) => {
      telegramConversationQueue = telegramConversationQueue
        .then(async () => {
          const userMessage = {
            role: 'user',
            content: telegramMessage.text,
            createdAt: telegramMessage.createdAt,
            chatId: telegramMessage.chatId,
            source: 'telegram',
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

  startHooks()
    .then((stop) => {
      stopHooks = typeof stop === 'function' ? stop : async () => {};
    })
    .catch((error) => {
      logInferenceError(error, {
        stage: 'hooks_startup',
      });
    });

  createWindow();
  startTaskRunner({
    onTaskResult(taskResult) {
      broadcastRendererEvent('app:task-result', taskResult);

      const output = taskResult?.output?.trim();

      if (!output || output === 'KEEP_SILENCE') {
        return;
      }

      void deliverConversationEntry({
        role: 'assistant',
        content: output,
      });
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
  void stopHooks();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
