const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appControls', {
  quit: () => ipcRenderer.invoke('app:quit'),
  getIdentity: () => ipcRenderer.invoke('app:get-identity'),
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
