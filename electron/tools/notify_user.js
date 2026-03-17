const { broadcastConversationMessage } = require('../conversation');

module.exports = {
    definition: {
        type: 'function',
        function: {
            name: 'notify_user',
            description:
                'Adds a new assistant message to the user conversation in the app. Use it when the user should be proactively notified inside the chat history.',
            parameters: {
                type: 'object',
                properties: {
                    message: {
                        type: 'string',
                        description: 'Notification text that will be added to the conversation as a new assistant message.',
                    },
                },
                required: ['message'],
                additionalProperties: false,
            },
        },
    },
    handler: async ({ message }) => {
        if (typeof message !== 'string' || !message.trim()) {
            throw new Error('The "message" argument must be a non-empty string.');
        }

        const delivery = broadcastConversationMessage({
            role: 'assistant',
            content: message,
        });

        return {
            ok: true,
            ...delivery,
        };
    },
};
