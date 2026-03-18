const { createImapClient, getMessageByUidFromClient } = require('../email');
const { logInferenceError, logTaskEvent } = require('../logger');
const { hasImapConfig } = require('../setup');
const { registerTask } = require('../task-runner');
const { createTaskFile } = require('../task-storage');

const HOOK_NAME = 'email';
const MAILBOX_PATH = 'INBOX';
const RECONNECT_DELAY_MS = 30 * 1000;
const MAX_EMAIL_TEXT_LENGTH = 8_000;
const MAX_SUBJECT_LENGTH = 200;

function truncateText(value, maxLength) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...[truncated]`;
}

function formatAddressList(addresses) {
  if (!Array.isArray(addresses) || !addresses.length) {
    return 'Unknown';
  }

  return addresses.join(', ');
}

function buildTaskInstructions(message) {
  const emailText = truncateText(message.text, MAX_EMAIL_TEXT_LENGTH) || 'No plain text body.';
  const attachmentLines = Array.isArray(message.attachments) && message.attachments.length
    ? message.attachments
        .map((attachment) => {
          const name = attachment.filename || 'unnamed';
          const contentType = attachment.contentType || 'unknown';
          const size = Number.isFinite(attachment.size) ? attachment.size : 0;
          return `- ${name} (${contentType}, ${size} bytes)`;
        })
        .join('\n')
    : '- No attachments';

  return [
    'A new email has arrived. Process it immediately.',
    'Use the existing email rules for importance, spam filtering, suspicious content, and reply style.',
    'If the email is not important and should not bother the user, return exactly "KEEP_SILENCE".',
    'You may use the manage_email tool with the folder and UID below if you need to re-read the full message or send a reply.',
    '',
    'Email details:',
    `- Folder: ${message.folder}`,
    `- UID: ${message.uid}`,
    `- Message-ID: ${message.messageId || 'N/A'}`,
    `- Date: ${message.date || 'N/A'}`,
    `- From: ${formatAddressList(message.from)}`,
    `- To: ${formatAddressList(message.to)}`,
    `- CC: ${formatAddressList(message.cc)}`,
    `- Reply-To: ${formatAddressList(message.replyTo)}`,
    `- Subject: ${truncateText(message.subject, MAX_SUBJECT_LENGTH) || '(no subject)'}`,
    `- Seen: ${message.seen === true ? 'yes' : 'no'}`,
    '',
    'Attachments:',
    attachmentLines,
    '',
    'Plain text body:',
    emailText,
  ].join('\n');
}

function createEmailTask(message) {
  return createTaskFile({
    title: `hook email ${message.uid} ${message.subject || 'message'}`,
    schedule: 'ASAP',
    instructions: buildTaskInstructions(message),
    recentRunsForAnalysis: null,
  });
}

async function resolveLatestUid(client) {
  const uids = (await client.search({ all: true }, { uid: true })) || [];
  return uids.length ? uids[uids.length - 1] : 0;
}

module.exports = {
  name: HOOK_NAME,
  async start() {
    if (!hasImapConfig()) {
      logTaskEvent('hook_skipped', {
        hookName: HOOK_NAME,
        reason: 'Missing IMAP configuration.',
      });
      return () => {};
    }

    let stopped = false;
    let reconnectTimer = null;
    let client = null;
    let isConnecting = false;
    let lastSeenUid = 0;
    let messageQueue = Promise.resolve();

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = (reason) => {
      if (stopped || reconnectTimer) {
        return;
      }

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, RECONNECT_DELAY_MS);

      logTaskEvent('email_hook_reconnect_scheduled', {
        reason,
        reconnectInMs: RECONNECT_DELAY_MS,
      });
    };

    const queueMessageProcessing = (uid) => {
      messageQueue = messageQueue
        .then(async () => {
          if (stopped || !client?.usable) {
            return;
          }

          const message = await getMessageByUidFromClient(client, {
            folder: MAILBOX_PATH,
            messageUid: uid,
          });
          const taskConfig = createEmailTask(message);

          logTaskEvent('email_hook_task_created', {
            uid: message.uid,
            subject: message.subject,
            taskFilePath: taskConfig.filePath,
          });

          await registerTask(taskConfig.filePath);
        })
        .catch((error) => {
          logInferenceError(error, {
            stage: 'email_hook_process_message',
            uid,
          });
        });

      return messageQueue;
    };

    const processNewMessages = async () => {
      if (stopped || !client?.usable) {
        return;
      }

      const latestUid = await resolveLatestUid(client);

      if (!latestUid || latestUid <= lastSeenUid) {
        return;
      }

      const allUids = (await client.search({ all: true }, { uid: true })) || [];
      const newUids = allUids.filter((uid) => uid > lastSeenUid);

      if (!newUids.length) {
        lastSeenUid = latestUid;
        return;
      }

      lastSeenUid = newUids[newUids.length - 1];

      for (const uid of newUids) {
        await queueMessageProcessing(uid);
      }
    };

    const connect = async () => {
      if (stopped || isConnecting) {
        return;
      }

      isConnecting = true;
      clearReconnectTimer();

      const nextClient = createImapClient();
      client = nextClient;

      nextClient.on('error', (error) => {
        logInferenceError(error, {
          stage: 'email_hook_client_error',
        });
      });

      nextClient.on('close', () => {
        logTaskEvent('email_hook_connection_closed', {
          mailbox: MAILBOX_PATH,
        });

        if (client === nextClient) {
          client = null;
        }

        scheduleReconnect('connection_closed');
      });

      nextClient.on('exists', (event) => {
        if (
          stopped ||
          event?.path !== MAILBOX_PATH ||
          !Number.isFinite(event?.count) ||
          !Number.isFinite(event?.prevCount) ||
          event.count <= event.prevCount
        ) {
          return;
        }

        void processNewMessages();
      });

      try {
        await nextClient.connect();
        await nextClient.mailboxOpen(MAILBOX_PATH);
        lastSeenUid = await resolveLatestUid(nextClient);

        logTaskEvent('email_hook_connected', {
          mailbox: MAILBOX_PATH,
          lastSeenUid,
        });
      } catch (error) {
        if (client === nextClient) {
          client = null;
        }

        logInferenceError(error, {
          stage: 'email_hook_connect',
        });
        scheduleReconnect('connect_failed');

        try {
          nextClient.close();
        } catch (_error) {
          // Ignore cleanup errors here.
        }
      } finally {
        isConnecting = false;
      }
    };

    await connect();

    return async () => {
      stopped = true;
      clearReconnectTimer();

      if (client) {
        try {
          await client.logout();
        } catch (_error) {
          client.close();
        } finally {
          client = null;
        }
      }
    };
  },
};
