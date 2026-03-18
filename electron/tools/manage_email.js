const {
  deleteMessageByUid,
  getMessageByUid,
  listFolderMessages,
  listMailFolders,
  sendMailMessage,
} = require('../email');

module.exports = {
  definition: {
    type: 'function',
    function: {
      name: 'manage_email',
      description:
        'Reads Gmail via IMAP and sends messages via SMTP. Supports folder listing, message listing, reading a full message, deleting a message, and sending a message.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'list_folders',
              'list_messages',
              'get_message',
              'delete_message',
              'send_message',
            ],
            description: 'Email operation to perform.',
          },
          folder: {
            type: 'string',
            description: 'Mailbox folder path such as INBOX or [Gmail]/Sent Mail.',
          },
          mode: {
            type: 'string',
            enum: ['unread', 'latest', 'search'],
            description: 'How to select messages when action is list_messages.',
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of messages to return for list_messages.',
          },
          query: {
            type: 'string',
            description:
              'Search query for Gmail when mode is search, for example from:alice newer_than:7d is:unread.',
          },
          message_uid: {
            type: 'integer',
            description: 'UID of the message inside the selected folder.',
          },
          to: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Recipient email addresses for send_message.',
          },
          cc: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'CC email addresses for send_message.',
          },
          subject: {
            type: 'string',
            description: 'Email subject for send_message.',
          },
          body: {
            type: 'string',
            description: 'Plain text email body for send_message.',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  handler: async ({
    action,
    folder,
    mode,
    limit,
    query,
    message_uid: messageUid,
    to,
    cc,
    subject,
    body,
  }) => {
    if (action === 'list_folders') {
      const folders = await listMailFolders();

      return {
        ok: true,
        action,
        count: folders.length,
        folders,
      };
    }

    if (action === 'list_messages') {
      return {
        ok: true,
        action,
        ...(await listFolderMessages({ folder, mode, limit, query })),
      };
    }

    if (action === 'get_message') {
      return {
        ok: true,
        action,
        message: await getMessageByUid({ folder, messageUid }),
      };
    }

    if (action === 'delete_message') {
      return {
        ok: true,
        action,
        ...(await deleteMessageByUid({ folder, messageUid })),
      };
    }

    if (action === 'send_message') {
      return {
        ok: true,
        action,
        ...(await sendMailMessage({ to, cc, subject, body })),
      };
    }

    throw new Error(`Unsupported action "${action}".`);
  },
};
