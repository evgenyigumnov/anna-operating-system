const fs = require('fs');
const path = require('path');
const { getBundledPath, getDataPath, isPackagedRuntime } = require('./runtime-paths');

const IDENTITY_FILE_PATH = getDataPath('IDENTITY.md');
const USER_FILE_PATH = getDataPath('USER.md');
const EMAIL_RULES_FILE_PATH = getDataPath('EMAIL.md');
const ENV_FILE_PATH = getDataPath('.env');
const SETUP_LOCK_FILE_PATH = getDataPath('already_setup.lock');
const BUNDLED_IDENTITY_FILE_PATH = getBundledPath('IDENTITY.md');
const DEFAULT_OPENAPI_BASE_URL = 'http://127.0.0.1:11434/v1';
const EMAIL_ENV_KEYS = [
  'EMAIL_IMAP_HOST',
  'EMAIL_IMAP_PORT',
  'EMAIL_IMAP_SECURE',
  'EMAIL_IMAP_USER',
  'EMAIL_IMAP_PASSWORD',
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_SECURE',
  'EMAIL_SMTP_USER',
  'EMAIL_SMTP_PASSWORD',
];
const TELEGRAM_ENV_KEYS = ['TELEGRAM_TOKEN'];

function ensureParentDirectory(filePath) {
  const parentDirectory = path.dirname(filePath);

  if (!fs.existsSync(parentDirectory)) {
    fs.mkdirSync(parentDirectory, { recursive: true });
  }
}

function readTextFile(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return fallback;
  }
}

function writeTextFile(filePath, content) {
  ensureParentDirectory(filePath);
  fs.writeFileSync(filePath, String(content), 'utf8');
}

function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function ensureIdentityFile() {
  if (fs.existsSync(IDENTITY_FILE_PATH)) {
    return;
  }

  const bundledIdentity = readTextFile(BUNDLED_IDENTITY_FILE_PATH, '');

  if (bundledIdentity.trim()) {
    writeTextFile(IDENTITY_FILE_PATH, `${bundledIdentity.trimEnd()}\n`);
  }
}

function ensureRuntimeFiles() {
  if (isPackagedRuntime()) {
    ensureIdentityFile();
  }
}

function getIdentityMarkdown() {
  ensureRuntimeFiles();

  const bundledIdentity = readTextFile(BUNDLED_IDENTITY_FILE_PATH, '');
  return readTextFile(IDENTITY_FILE_PATH, bundledIdentity);
}

function getOptionalMarkdown(filePath) {
  return readTextFile(filePath, '');
}

function parseEnvFile(content) {
  const entries = [];

  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);

    if (!match) {
      entries.push({ type: 'raw', value: rawLine });
      continue;
    }

    entries.push({
      type: 'entry',
      key: match[1],
      value: match[2],
    });
  }

  return entries;
}

function stringifyEnvFile(entries) {
  return entries
    .map((entry) =>
      entry.type === 'entry'
        ? `${entry.key}=${entry.value}`
        : entry.value,
    )
    .join('\n')
    .replace(/\n*$/, '\n');
}

function getEnvValue(key) {
  const normalizedKey = String(key || '').trim();

  if (!normalizedKey) {
    return '';
  }

  const envContent = readTextFile(ENV_FILE_PATH, '');
  const envEntries = parseEnvFile(envContent);
  const entry = envEntries.find(
    (currentEntry) =>
      currentEntry.type === 'entry' &&
      currentEntry.key === normalizedKey &&
      typeof currentEntry.value === 'string' &&
      currentEntry.value.trim(),
  );

  return entry?.value?.trim() || '';
}

function applyEnvUpdates(changes) {
  const normalizedEntries = Object.entries(changes || {}).map(([key, value]) => [
    String(key || '').trim(),
    String(value || '').trim(),
  ]);
  const normalizedMap = new Map(
    normalizedEntries.filter(([key]) => key),
  );
  const envContent = readTextFile(ENV_FILE_PATH, '');
  const envEntries = parseEnvFile(envContent);
  const nextEntries = [];
  const updatedKeys = new Set();

  for (const entry of envEntries) {
    if (entry.type !== 'entry' || !normalizedMap.has(entry.key)) {
      nextEntries.push(entry);
      continue;
    }

    if (updatedKeys.has(entry.key)) {
      continue;
    }

    const nextValue = normalizedMap.get(entry.key);
    updatedKeys.add(entry.key);

    if (!nextValue) {
      continue;
    }

    nextEntries.push({
      type: 'entry',
      key: entry.key,
      value: nextValue,
    });
  }

  for (const [key, value] of normalizedEntries) {
    if (!key || updatedKeys.has(key) || !value) {
      continue;
    }

    if (nextEntries.length && nextEntries.at(-1)?.type === 'raw' && nextEntries.at(-1)?.value !== '') {
      nextEntries.push({ type: 'raw', value: '' });
    }

    nextEntries.push({
      type: 'entry',
      key,
      value,
    });
    updatedKeys.add(key);
  }

  writeTextFile(ENV_FILE_PATH, stringifyEnvFile(nextEntries));

  for (const [key, value] of normalizedEntries) {
    if (!key) {
      continue;
    }

    if (value) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

function hasEnvEntries(keys) {
  const normalizedKeys = Array.isArray(keys)
    ? keys
        .map((key) => String(key || '').trim())
        .filter(Boolean)
    : [];

  if (!normalizedKeys.length) {
    return false;
  }

  const envContent = readTextFile(ENV_FILE_PATH, '');
  const envEntries = parseEnvFile(envContent);

  return normalizedKeys.every((key) =>
    envEntries.some(
      (entry) =>
        entry.type === 'entry' &&
        entry.key === key &&
        typeof entry.value === 'string' &&
        entry.value.trim(),
    ),
  );
}

function hasImapConfig() {
  return hasEnvEntries([
    'EMAIL_IMAP_USER',
    'EMAIL_IMAP_PASSWORD',
  ]);
}

function getOpenApiBaseUrl() {
  return getEnvValue('OPENAPI_BASE_URL') || DEFAULT_OPENAPI_BASE_URL;
}

function setOpenApiBaseUrl(baseUrl) {
  const normalizedBaseUrl = String(baseUrl || '').trim();

  if (!normalizedBaseUrl) {
    throw new Error('OPENAPI_BASE_URL is required.');
  }

  const envContent = readTextFile(ENV_FILE_PATH, '');
  const envEntries = parseEnvFile(envContent);
  const nextEntries = [];
  let replaced = false;

  for (const entry of envEntries) {
    if (
      entry.type === 'entry' &&
      entry.key === 'OPENAPI_BASE_URL' &&
      !replaced
    ) {
      nextEntries.push({
        type: 'entry',
        key: 'OPENAPI_BASE_URL',
        value: normalizedBaseUrl,
      });
      replaced = true;
      continue;
    }

    if (entry.type === 'entry' && entry.key === 'OPENAPI_BASE_URL') {
      continue;
    }

    nextEntries.push(entry);
  }

  if (!replaced) {
    if (nextEntries.length && nextEntries.at(-1)?.type === 'raw' && nextEntries.at(-1)?.value !== '') {
      nextEntries.push({ type: 'raw', value: '' });
    }

    nextEntries.push({
      type: 'entry',
      key: 'OPENAPI_BASE_URL',
      value: normalizedBaseUrl,
    });
  }

  writeTextFile(ENV_FILE_PATH, stringifyEnvFile(nextEntries));
  process.env.OPENAPI_BASE_URL = normalizedBaseUrl;

  return normalizedBaseUrl;
}

function getSetupState() {
  return {
    isFirstLaunch: !fs.existsSync(SETUP_LOCK_FILE_PATH),
    identityMarkdown: getIdentityMarkdown(),
    userMarkdown: getOptionalMarkdown(USER_FILE_PATH),
    emailMarkdown: getOptionalMarkdown(EMAIL_RULES_FILE_PATH),
    openApiBaseUrl: getOpenApiBaseUrl(),
    emailImapHost: getEnvValue('EMAIL_IMAP_HOST'),
    emailImapPort: getEnvValue('EMAIL_IMAP_PORT'),
    emailImapSecure: getEnvValue('EMAIL_IMAP_SECURE'),
    emailImapUser: getEnvValue('EMAIL_IMAP_USER'),
    emailImapPassword: getEnvValue('EMAIL_IMAP_PASSWORD'),
    emailSmtpHost: getEnvValue('EMAIL_SMTP_HOST'),
    emailSmtpPort: getEnvValue('EMAIL_SMTP_PORT'),
    emailSmtpSecure: getEnvValue('EMAIL_SMTP_SECURE'),
    emailSmtpUser: getEnvValue('EMAIL_SMTP_USER'),
    emailSmtpPassword: getEnvValue('EMAIL_SMTP_PASSWORD'),
    telegramToken: getEnvValue('TELEGRAM_TOKEN'),
  };
}

function saveMarkdownFile(filePath, markdown, { required = false } = {}) {
  const normalizedMarkdown = String(markdown || '').trim();

  if (!normalizedMarkdown) {
    if (required) {
      throw new Error(`${path.basename(filePath)} content is required.`);
    }

    removeFileIfExists(filePath);
    return '';
  }

  writeTextFile(filePath, `${normalizedMarkdown}\n`);
  return normalizedMarkdown;
}

function saveIdentityMarkdown(markdown) {
  return saveMarkdownFile(IDENTITY_FILE_PATH, markdown, { required: true });
}

function saveUserMarkdown(markdown) {
  return saveMarkdownFile(USER_FILE_PATH, markdown);
}

function saveEmailMarkdown(markdown) {
  return saveMarkdownFile(EMAIL_RULES_FILE_PATH, markdown);
}

function saveEmailSettings(settings) {
  applyEnvUpdates(
    Object.fromEntries(
      EMAIL_ENV_KEYS.map((key) => [key, settings?.[key] || '']),
    ),
  );

  return Object.fromEntries(EMAIL_ENV_KEYS.map((key) => [key, getEnvValue(key)]));
}

function saveTelegramSettings(settings) {
  applyEnvUpdates(
    Object.fromEntries(
      TELEGRAM_ENV_KEYS.map((key) => [key, settings?.[key] || '']),
    ),
  );

  return Object.fromEntries(TELEGRAM_ENV_KEYS.map((key) => [key, getEnvValue(key)]));
}

function completeSetup() {
  writeTextFile(
    SETUP_LOCK_FILE_PATH,
    `setup_completed_at=${new Date().toISOString()}\n`,
  );

  return {
    isFirstLaunch: false,
  };
}

module.exports = {
  DEFAULT_OPENAPI_BASE_URL,
  completeSetup,
  getEnvValue,
  hasEnvEntries,
  hasImapConfig,
  getOpenApiBaseUrl,
  getSetupState,
  saveEmailMarkdown,
  saveEmailSettings,
  saveIdentityMarkdown,
  saveTelegramSettings,
  saveUserMarkdown,
  setOpenApiBaseUrl,
};
