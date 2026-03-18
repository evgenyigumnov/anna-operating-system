const { logTaskEvent } = require('./logger');

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const TELEGRAM_POLL_TIMEOUT_SECONDS = 25;
const TELEGRAM_RETRY_DELAY_MS = 3_000;

function getGlobalFetch() {
  if (typeof fetch === 'function') {
    return fetch;
  }

  throw new Error('Global fetch is not available in this runtime.');
}

function createTelegramBridge(token) {
  const normalizedToken = String(token || '').trim();

  if (!normalizedToken) {
    return {
      isEnabled: false,
      getKnownChatIds: () => [],
      sendMessageToChat: async () => false,
      sendMessageToKnownChats: async () => [],
      start: () => () => {},
    };
  }

  const fetchImpl = getGlobalFetch();
  const knownChatIds = new Set();
  let offset = 0;
  let stopRequested = false;
  let activeTimeout = null;

  async function callTelegramApi(method, payload) {
    const response = await fetchImpl(
      `${TELEGRAM_API_BASE_URL}/bot${normalizedToken}/${method}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload || {}),
      },
    );

    if (!response.ok) {
      throw new Error(`Telegram API request failed with status ${response.status}.`);
    }

    const result = await response.json();

    if (!result?.ok) {
      throw new Error(result?.description || 'Telegram API request failed.');
    }

    return result.result;
  }

  async function sendMessageToChat(chatId, text) {
    const normalizedText = String(text || '').trim();

    if (!normalizedText || !chatId) {
      return false;
    }

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: normalizedText,
    });

    knownChatIds.add(chatId);
    return true;
  }

  async function sendMessageToKnownChats(text) {
    const knownChats = [...knownChatIds];
    const deliveries = [];

    for (const chatId of knownChats) {
      try {
        const delivered = await sendMessageToChat(chatId, text);
        deliveries.push({ chatId, delivered });
      } catch (error) {
        deliveries.push({
          chatId,
          delivered: false,
          error: error instanceof Error ? error.message : 'Failed to send Telegram message.',
        });
      }
    }

    return deliveries;
  }

  function scheduleNextPoll(onMessage, delayMs = 0) {
    if (stopRequested) {
      return;
    }

    activeTimeout = setTimeout(() => {
      void poll(onMessage);
    }, delayMs);
  }

  async function poll(onMessage) {
    if (stopRequested) {
      return;
    }

    try {
      const updates = await callTelegramApi('getUpdates', {
        offset,
        timeout: TELEGRAM_POLL_TIMEOUT_SECONDS,
        allowed_updates: ['message'],
      });

      for (const update of Array.isArray(updates) ? updates : []) {
        offset = Math.max(offset, Number(update?.update_id || 0) + 1);

        const chatId = update?.message?.chat?.id;
        const text = update?.message?.text;

        if (!chatId || typeof text !== 'string' || !text.trim()) {
          continue;
        }

        knownChatIds.add(chatId);
        await onMessage({
          chatId,
          text: text.trim(),
          updateId: update.update_id,
          createdAt:
            update?.message?.date
              ? new Date(update.message.date * 1_000).toISOString()
              : new Date().toISOString(),
        });
      }

      if (!stopRequested) {
        scheduleNextPoll(onMessage, 0);
      }
    } catch (error) {
      logTaskEvent('telegram_poll_error', {
        message: error instanceof Error ? error.message : 'Telegram polling failed.',
      });

      if (!stopRequested) {
        scheduleNextPoll(onMessage, TELEGRAM_RETRY_DELAY_MS);
      }
    }
  }

  function start(onMessage) {
    if (typeof onMessage !== 'function') {
      return () => {};
    }

    stopRequested = false;
    scheduleNextPoll(onMessage, 0);

    return () => {
      stopRequested = true;

      if (activeTimeout) {
        clearTimeout(activeTimeout);
        activeTimeout = null;
      }
    };
  }

  return {
    isEnabled: true,
    getKnownChatIds: () => [...knownChatIds],
    sendMessageToChat,
    sendMessageToKnownChats,
    start,
  };
}

module.exports = {
  createTelegramBridge,
};
