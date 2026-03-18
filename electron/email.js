const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const { getEnvValue } = require('./setup');

const DEFAULT_IMAP_HOST = 'imap.gmail.com';
const DEFAULT_IMAP_PORT = 993;
const DEFAULT_IMAP_SECURE = true;
const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_SECURE = true;
const DEFAULT_LIST_LIMIT = 10;
const MAX_LIST_LIMIT = 100;
const recentMessageListsByFolder = new Map();

function readRequiredEnv(key) {
  const value = getEnvValue(key).trim();

  if (!value) {
    throw new Error(`Missing required email setting "${key}" in .env.`);
  }

  return value;
}

function readOptionalNumberEnv(key, fallback) {
  const rawValue = getEnvValue(key).trim();

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`The "${key}" value in .env must be a positive integer.`);
  }

  return value;
}

function readOptionalBooleanEnv(key, fallback) {
  const rawValue = getEnvValue(key).trim().toLowerCase();

  if (!rawValue) {
    return fallback;
  }

  if (['true', '1', 'yes', 'on'].includes(rawValue)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(rawValue)) {
    return false;
  }

  throw new Error(`The "${key}" value in .env must be true or false.`);
}

function normalizeLimit(limit, fallback = DEFAULT_LIST_LIMIT) {
  if (limit == null) {
    return fallback;
  }

  const numericLimit = Number(limit);

  if (!Number.isInteger(numericLimit) || numericLimit <= 0) {
    throw new Error('The "limit" field must be a positive integer.');
  }

  return Math.min(numericLimit, MAX_LIST_LIMIT);
}

function normalizeFolder(folder) {
  const normalizedFolder = String(folder || '').trim();

  if (!normalizedFolder) {
    throw new Error('The "folder" field is required.');
  }

  return normalizedFolder;
}

function normalizeMessageUid(messageUid) {
  const numericUid = Number(messageUid);

  if (!Number.isInteger(numericUid) || numericUid <= 0) {
    throw new Error('The "message_uid" field must be a positive integer.');
  }

  return numericUid;
}

function normalizeRecipients(value, fieldName, { optional = false } = {}) {
  if (value == null || value === '') {
    if (optional) {
      return [];
    }

    throw new Error(`The "${fieldName}" field is required.`);
  }

  const list = Array.isArray(value)
    ? value
    : String(value)
        .split(',')
        .map((entry) => entry.trim());

  const recipients = list
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);

  if (!recipients.length && !optional) {
    throw new Error(`The "${fieldName}" field must contain at least one email address.`);
  }

  return recipients;
}

function formatAddress(address) {
  if (!address?.address) {
    return address?.name?.trim() || '';
  }

  if (address?.name?.trim()) {
    return `${address.name.trim()} <${address.address}>`;
  }

  return address.address;
}

function formatAddressList(addresses) {
  if (!Array.isArray(addresses)) {
    return [];
  }

  return addresses.map(formatAddress).filter(Boolean);
}

function buildMessageSummary(message) {
  const envelope = message?.envelope || {};

  return {
    uid: message?.uid ?? null,
    messageId: envelope.messageId || null,
    from: formatAddressList(envelope.from),
    subject: envelope.subject || '',
    date:
      (envelope.date instanceof Date ? envelope.date : message?.internalDate)?.toISOString?.() ||
      null,
    seen: message?.flags instanceof Set ? message.flags.has('\\Seen') : null,
  };
}

function rememberRecentMessageList(folder, messages) {
  recentMessageListsByFolder.set(folder, Array.isArray(messages) ? messages : []);
}

function resolveUidFromRecentMessageList(folder, candidate) {
  const messages = recentMessageListsByFolder.get(folder);

  if (!Array.isArray(messages) || !messages.length) {
    return null;
  }

  const ordinal = Number(candidate);

  if (!Number.isInteger(ordinal) || ordinal <= 0 || ordinal > messages.length) {
    return null;
  }

  const message = messages[ordinal - 1];
  const resolvedUid = Number(message?.uid);

  return Number.isInteger(resolvedUid) && resolvedUid > 0 ? resolvedUid : null;
}

function buildImapConfig() {
  return {
    host: getEnvValue('EMAIL_IMAP_HOST').trim() || DEFAULT_IMAP_HOST,
    port: readOptionalNumberEnv('EMAIL_IMAP_PORT', DEFAULT_IMAP_PORT),
    secure: readOptionalBooleanEnv('EMAIL_IMAP_SECURE', DEFAULT_IMAP_SECURE),
    auth: {
      user: readRequiredEnv('EMAIL_IMAP_USER'),
      pass: readRequiredEnv('EMAIL_IMAP_PASSWORD'),
    },
    logger: false,
  };
}

function buildSmtpConfig() {
  const user = getEnvValue('EMAIL_SMTP_USER').trim() || readRequiredEnv('EMAIL_IMAP_USER');
  const pass =
    getEnvValue('EMAIL_SMTP_PASSWORD').trim() || readRequiredEnv('EMAIL_IMAP_PASSWORD');

  return {
    host: getEnvValue('EMAIL_SMTP_HOST').trim() || DEFAULT_SMTP_HOST,
    port: readOptionalNumberEnv('EMAIL_SMTP_PORT', DEFAULT_SMTP_PORT),
    secure: readOptionalBooleanEnv('EMAIL_SMTP_SECURE', DEFAULT_SMTP_SECURE),
    auth: {
      user,
      pass,
    },
  };
}

function createImapClient() {
  return new ImapFlow(buildImapConfig());
}

function normalizeEmailError(error, protocol) {
  const responseCode = String(error?.serverResponseCode || '').trim().toUpperCase();
  const responseText = String(error?.responseText || error?.message || '').trim();
  const isAuthenticationFailure =
    error?.authenticationFailed === true ||
    responseCode === 'AUTHENTICATIONFAILED' ||
    /invalid credentials|username and password not accepted|password incorrect/i.test(
      responseText,
    );

  if (isAuthenticationFailure) {
    throw new Error(
      [
        `Gmail ${protocol} authentication failed.`,
        'For a personal Gmail account, do not use the normal account password here.',
        'Turn on 2-Step Verification in Google Account settings and create a 16-character App Password for Mail, then put that App Password into EMAIL_IMAP_PASSWORD and EMAIL_SMTP_PASSWORD.',
        'If this is a Google Workspace account with modern auth enforced, plain username/password IMAP/SMTP may be blocked and OAuth would be required instead.',
      ].join(' '),
    );
  }

  throw error;
}

async function withImapClient(callback) {
  const client = createImapClient();

  try {
    await client.connect();
  } catch (error) {
    normalizeEmailError(error, 'IMAP');
  }

  try {
    return await callback(client);
  } finally {
    try {
      await client.logout();
    } catch (_error) {
      client.close();
    }
  }
}

async function withMailboxLock(client, folder, callback) {
  const lock = await client.getMailboxLock(folder);

  try {
    return await callback();
  } finally {
    lock.release();
  }
}

function formatFolder(folder) {
  return {
    path: folder.path,
    name: folder.name,
    delimiter: folder.delimiter || null,
    specialUse: folder.specialUse || null,
    flags: folder.flags instanceof Set ? [...folder.flags] : [],
    listed: folder.listed === true,
    subscribed: folder.subscribed === true,
    disabled: folder.disabled === true,
  };
}

async function listMailFolders() {
  return withImapClient(async (client) => {
    const folders = await client.list();
    return folders.map(formatFolder);
  });
}

async function fetchMessageSummaries(client, uids) {
  const messages = [];

  for (const uid of uids) {
    const message = await client.fetchOne(
      String(uid),
      {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
      },
      { uid: true },
    );

    if (message) {
      messages.push(buildMessageSummary(message));
    }
  }

  return messages;
}

async function listFolderMessages({ folder, mode, limit, query }) {
  const normalizedFolder = normalizeFolder(folder);
  const normalizedMode = String(mode || '').trim().toLowerCase() || 'latest';
  const normalizedLimit = normalizeLimit(limit);

  return withImapClient((client) =>
    withMailboxLock(client, normalizedFolder, async () => {
      let uids = [];

      if (normalizedMode === 'unread') {
        uids = (await client.search({ seen: false }, { uid: true })) || [];
      } else if (normalizedMode === 'latest') {
        uids = (await client.search({ all: true }, { uid: true })) || [];
      } else if (normalizedMode === 'search') {
        const normalizedQuery = String(query || '').trim();

        if (!normalizedQuery) {
          throw new Error('The "query" field is required when mode is "search".');
        }

        uids =
          (await client.search({ gmraw: normalizedQuery }, { uid: true })) ||
          (await client.search({ text: normalizedQuery }, { uid: true })) ||
          [];
      } else {
        throw new Error(`Unsupported list mode "${mode}".`);
      }

      const selectedUids = uids.slice(-normalizedLimit).reverse();
      const messages = await fetchMessageSummaries(client, selectedUids);
      rememberRecentMessageList(normalizedFolder, messages);

      return {
        folder: normalizedFolder,
        mode: normalizedMode,
        limit: normalizedLimit,
        query: normalizedMode === 'search' ? String(query).trim() : null,
        count: messages.length,
        messages,
      };
    }),
  );
}

async function getMessageByUid({ folder, messageUid }) {
  const normalizedFolder = normalizeFolder(folder);
  const normalizedUid = normalizeMessageUid(messageUid);

  return withImapClient((client) =>
    withMailboxLock(client, normalizedFolder, async () => {
      let resolvedUid = normalizedUid;
      let message = await client.fetchOne(
        String(resolvedUid),
        {
          uid: true,
          flags: true,
          envelope: true,
          internalDate: true,
          source: true,
          bodyStructure: true,
        },
        { uid: true },
      );

      if (!message?.source) {
        const fallbackUid = resolveUidFromRecentMessageList(normalizedFolder, normalizedUid);

        if (fallbackUid && fallbackUid !== normalizedUid) {
          resolvedUid = fallbackUid;
          message = await client.fetchOne(
            String(resolvedUid),
            {
              uid: true,
              flags: true,
              envelope: true,
              internalDate: true,
              source: true,
              bodyStructure: true,
            },
            { uid: true },
          );
        }
      }

      if (!message?.source) {
        throw new Error(
          `Message UID ${normalizedUid} was not found in folder "${normalizedFolder}".`,
        );
      }

      const parsedMessage = await simpleParser(message.source);

      return {
        folder: normalizedFolder,
        uid: message.uid ?? resolvedUid,
        messageId: parsedMessage.messageId || message.envelope?.messageId || null,
        subject: parsedMessage.subject || message.envelope?.subject || '',
        date:
          parsedMessage.date?.toISOString?.() ||
          message.envelope?.date?.toISOString?.() ||
          message.internalDate?.toISOString?.() ||
          null,
        from: formatAddressList(parsedMessage.from?.value || message.envelope?.from),
        to: formatAddressList(parsedMessage.to?.value || message.envelope?.to),
        cc: formatAddressList(parsedMessage.cc?.value || message.envelope?.cc),
        bcc: formatAddressList(parsedMessage.bcc?.value || message.envelope?.bcc),
        replyTo: formatAddressList(
          parsedMessage.replyTo?.value || message.envelope?.replyTo,
        ),
        seen: message.flags instanceof Set ? message.flags.has('\\Seen') : null,
        text: parsedMessage.text || '',
        html: parsedMessage.html || '',
        attachments: Array.isArray(parsedMessage.attachments)
          ? parsedMessage.attachments.map((attachment) => ({
              filename: attachment.filename || null,
              contentType: attachment.contentType || null,
              size:
                typeof attachment.size === 'number' ? attachment.size : attachment.content?.length || 0,
              contentDisposition: attachment.contentDisposition || null,
              cid: attachment.cid || null,
            }))
          : [],
      };
    }),
  );
}

async function deleteMessageByUid({ folder, messageUid }) {
  const normalizedFolder = normalizeFolder(folder);
  const normalizedUid = normalizeMessageUid(messageUid);

  return withImapClient((client) =>
    withMailboxLock(client, normalizedFolder, async () => {
      let resolvedUid = normalizedUid;
      let message = await client.fetchOne(
        String(resolvedUid),
        {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
        },
        { uid: true },
      );

      if (!message) {
        const fallbackUid = resolveUidFromRecentMessageList(normalizedFolder, normalizedUid);

        if (fallbackUid && fallbackUid !== normalizedUid) {
          resolvedUid = fallbackUid;
          message = await client.fetchOne(
            String(resolvedUid),
            {
              uid: true,
              envelope: true,
              flags: true,
              internalDate: true,
            },
            { uid: true },
          );
        }
      }

      if (!message) {
        throw new Error(
          `Message UID ${normalizedUid} was not found in folder "${normalizedFolder}".`,
        );
      }

      await client.messageDelete(String(resolvedUid), { uid: true });

      return {
        folder: normalizedFolder,
        deleted: true,
        message: buildMessageSummary(message),
      };
    }),
  );
}

async function sendMailMessage({ to, cc, subject, body }) {
  const recipients = normalizeRecipients(to, 'to');
  const carbonCopy = normalizeRecipients(cc, 'cc', { optional: true });
  const normalizedSubject = String(subject || '').trim();
  const normalizedBody = String(body || '').trim();

  if (!normalizedSubject) {
    throw new Error('The "subject" field is required.');
  }

  if (!normalizedBody) {
    throw new Error('The "body" field is required.');
  }

  const smtpConfig = buildSmtpConfig();
  const transporter = nodemailer.createTransport(smtpConfig);
  let info;

  try {
    info = await transporter.sendMail({
      from: smtpConfig.auth.user,
      to: recipients.join(', '),
      cc: carbonCopy.length ? carbonCopy.join(', ') : undefined,
      subject: normalizedSubject,
      text: normalizedBody,
    });
  } catch (error) {
    normalizeEmailError(error, 'SMTP');
  }

  return {
    sent: true,
    messageId: info.messageId || null,
    accepted: Array.isArray(info.accepted) ? info.accepted : [],
    rejected: Array.isArray(info.rejected) ? info.rejected : [],
    response: info.response || null,
  };
}

module.exports = {
  MAX_LIST_LIMIT,
  buildImapConfig,
  buildSmtpConfig,
  createImapClient,
  deleteMessageByUid,
  getMessageByUid,
  listFolderMessages,
  listMailFolders,
  sendMailMessage,
  withImapClient,
};
