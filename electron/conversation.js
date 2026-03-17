const { BrowserWindow } = require('electron');

const CONVERSATION_MESSAGE_CHANNEL = 'app:conversation-message';

function broadcastConversationMessage(message) {
    if (!message || typeof message.content !== 'string' || !message.content.trim()) {
        throw new Error('Conversation message content is required.');
    }

    const payload = {
        role: message.role === 'user' ? 'user' : 'assistant',
        content: message.content.trim(),
        createdAt:
            typeof message.createdAt === 'string' && message.createdAt.trim()
                ? message.createdAt
                : new Date().toISOString(),
    };

    let deliveredWindowCount = 0;

    for (const window of BrowserWindow.getAllWindows()) {
        const { webContents } = window;

        if (webContents.isDestroyed()) {
            continue;
        }

        webContents.send(CONVERSATION_MESSAGE_CHANNEL, payload);
        deliveredWindowCount += 1;
    }

    return {
        deliveredWindowCount,
        message: payload,
    };
}

module.exports = {
    CONVERSATION_MESSAGE_CHANNEL,
    broadcastConversationMessage,
};
