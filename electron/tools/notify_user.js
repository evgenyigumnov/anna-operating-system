const { deliverConversationEntry } = require('../message-delivery');

module.exports = {
  definition: {
    type: 'function',
    function: {
      name: 'notify_user',
      description:
        'Send a message to the user. Used for reminders or for sending results of completed tasks',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The text of the message or notification that should be sent to the user.',
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

    const delivery = await deliverConversationEntry({
      role: 'assistant',
      content: message,
    });

    return {
      ok: true,
      message: delivery,
    };
  },
};
