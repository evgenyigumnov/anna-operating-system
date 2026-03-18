const { broadcastConversationMessage } = require('./conversation');
const { appendConversationEntry } = require('./conversation-store');
const { logTaskEvent } = require('./logger');

let telegramBridge = null;

function normalizeEntry(entry) {
  if (!entry || typeof entry.content !== 'string') {
    return null;
  }

  const content = entry.content.trim();

  if (!content) {
    return null;
  }

  return {
    role: entry.role === 'user' ? 'user' : 'assistant',
    content,
    createdAt:
      typeof entry.createdAt === 'string' && entry.createdAt.trim()
        ? entry.createdAt
        : new Date().toISOString(),
  };
}

function formatTelegramMirrorText(entry) {
  if (entry.role === 'user') {
    return `User:\n${entry.content}`;
  }

  return entry.content;
}

function setTelegramBridge(bridge) {
  telegramBridge = bridge && bridge.isEnabled ? bridge : null;
}

async function mirrorConversationEntryToTelegram(entry) {
  const normalizedEntry = normalizeEntry(entry);

  if (!normalizedEntry || !telegramBridge?.isEnabled) {
    return [];
  }

  try {
    return await telegramBridge.sendMessageToKnownChats(
      formatTelegramMirrorText(normalizedEntry),
    );
  } catch (error) {
    logTaskEvent('telegram_delivery_error', {
      role: normalizedEntry.role,
      message: error instanceof Error ? error.message : 'Failed to deliver Telegram message.',
    });
    return [];
  }
}

async function deliverConversationEntry(entry, options = {}) {
  const normalizedEntry = normalizeEntry(entry);

  if (!normalizedEntry) {
    throw new Error('Conversation entry content is required.');
  }

  if (options.persist !== false) {
    appendConversationEntry(normalizedEntry);
  }

  if (options.broadcast !== false) {
    broadcastConversationMessage(normalizedEntry);
  }

  if (options.mirrorToTelegram !== false) {
    await mirrorConversationEntryToTelegram(normalizedEntry);
  }

  return normalizedEntry;
}

module.exports = {
  deliverConversationEntry,
  formatTelegramMirrorText,
  mirrorConversationEntryToTelegram,
  setTelegramBridge,
};
