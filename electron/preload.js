const { contextBridge, ipcRenderer } = require('electron');

const CONVERSATION_MESSAGE_CHANNEL = 'app:conversation-message';

contextBridge.exposeInMainWorld('appControls', {
  quit: () => ipcRenderer.invoke('app:quit'),
  getIdentity: () => ipcRenderer.invoke('app:get-identity'),
  getSystemInfo: () => ipcRenderer.invoke('app:get-system-info'),
  getSetupState: () => ipcRenderer.invoke('app:get-setup-state'),
  getConversationHistory: () => ipcRenderer.invoke('app:get-conversation-history'),
  syncConversationHistory: (conversation) =>
    ipcRenderer.invoke('app:sync-conversation-history', conversation),
  saveUserMarkdown: (markdown) =>
    ipcRenderer.invoke('app:save-user-markdown', markdown),
  saveEmailMarkdown: (markdown) =>
    ipcRenderer.invoke('app:save-email-markdown', markdown),
  saveEmailSettings: (settings) =>
    ipcRenderer.invoke('app:save-email-settings', settings),
  saveTelegramSettings: (settings) =>
    ipcRenderer.invoke('app:save-telegram-settings', settings),
  saveIdentityMarkdown: (markdown) =>
    ipcRenderer.invoke('app:save-identity-markdown', markdown),
  saveOpenApiBaseUrl: (baseUrl) =>
    ipcRenderer.invoke('app:save-openapi-base-url', baseUrl),
  completeSetup: () => ipcRenderer.invoke('app:complete-setup'),
  onTaskResult: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => {
      handler(payload);
    };

    ipcRenderer.on('app:task-result', listener);

    return () => {
      ipcRenderer.removeListener('app:task-result', listener);
    };
  },
  onConversationMessage: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => {
      handler(payload);
    };

    ipcRenderer.on(CONVERSATION_MESSAGE_CHANNEL, listener);

    return () => {
      ipcRenderer.removeListener(CONVERSATION_MESSAGE_CHANNEL, listener);
    };
  },
  inferStream: async (conversation, handlers = {}) => {
    const requestId =
      typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const subscriptions = [
      [
        'app:infer:chunk',
        (_event, payload) => {
          if (payload?.requestId === requestId) {
            handlers.onChunk?.(payload.delta || '');
          }
        },
      ],
      [
        'app:infer:done',
        (_event, payload) => {
          if (payload?.requestId === requestId) {
            handlers.onDone?.(payload.output || '');
          }
        },
      ],
      [
        'app:infer:error',
        (_event, payload) => {
          if (payload?.requestId === requestId) {
            handlers.onError?.(
              new Error(payload?.message || 'Failed to get a reply.'),
            );
          }
        },
      ],
    ];

    for (const [channel, listener] of subscriptions) {
      ipcRenderer.on(channel, listener);
    }

    try {
      return await ipcRenderer.invoke('app:infer', {
        requestId,
        conversation,
      });
    } finally {
      for (const [channel, listener] of subscriptions) {
        ipcRenderer.removeListener(channel, listener);
      }
    }
  },
});
