const fs = require('fs');
const path = require('path');
const { getDataPath } = require('./runtime-paths');

const CONVERSATION_HISTORY_FILE_PATH = getDataPath('conversation-history.json');

function normalizeConversationEntry(entry) {
  if (!entry || typeof entry.content !== 'string') {
    return null;
  }

  const content = entry.content.trim();

  if (!content) {
    return null;
  }

  return {
    role: entry.role === 'assistant' ? 'assistant' : 'user',
    content,
    createdAt:
      typeof entry.createdAt === 'string' && entry.createdAt.trim()
        ? entry.createdAt
        : new Date().toISOString(),
  };
}

function normalizeConversation(conversation) {
  if (!Array.isArray(conversation)) {
    return [];
  }

  return conversation.map(normalizeConversationEntry).filter(Boolean);
}

function readConversationHistory() {
  try {
    const rawContent = fs.readFileSync(CONVERSATION_HISTORY_FILE_PATH, 'utf8');
    return normalizeConversation(JSON.parse(rawContent));
  } catch (_error) {
    return [];
  }
}

function writeConversationHistory(conversation) {
  const normalizedConversation = normalizeConversation(conversation);
  fs.mkdirSync(path.dirname(CONVERSATION_HISTORY_FILE_PATH), { recursive: true });
  fs.writeFileSync(
    CONVERSATION_HISTORY_FILE_PATH,
    JSON.stringify(normalizedConversation, null, 2),
    'utf8',
  );

  return normalizedConversation;
}

function appendConversationEntry(entry) {
  const normalizedEntry = normalizeConversationEntry(entry);

  if (!normalizedEntry) {
    throw new Error('Conversation entry content is required.');
  }

  const nextConversation = [
    ...readConversationHistory(),
    normalizedEntry,
  ];

  return {
    entry: normalizedEntry,
    conversation: writeConversationHistory(nextConversation),
  };
}

function clearConversationHistory() {
  return writeConversationHistory([]);
}

module.exports = {
  appendConversationEntry,
  clearConversationHistory,
  normalizeConversation,
  readConversationHistory,
  writeConversationHistory,
};
