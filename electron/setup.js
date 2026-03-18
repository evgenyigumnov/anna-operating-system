const fs = require('fs');
const path = require('path');
const { getBundledPath, getDataPath, isPackagedRuntime } = require('./runtime-paths');

const IDENTITY_FILE_PATH = getDataPath('IDENTITY.md');
const ENV_FILE_PATH = getDataPath('.env');
const SETUP_LOCK_FILE_PATH = getDataPath('already_setup.lock');
const BUNDLED_IDENTITY_FILE_PATH = getBundledPath('IDENTITY.md');
const DEFAULT_OPENAPI_BASE_URL = 'http://127.0.0.1:11434/v1';

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
    openApiBaseUrl: getOpenApiBaseUrl(),
  };
}

function saveIdentityMarkdown(markdown) {
  const normalizedMarkdown = String(markdown || '').trim();

  if (!normalizedMarkdown) {
    throw new Error('IDENTITY.md content is required.');
  }

  writeTextFile(IDENTITY_FILE_PATH, `${normalizedMarkdown}\n`);
  return normalizedMarkdown;
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
  getOpenApiBaseUrl,
  getSetupState,
  saveIdentityMarkdown,
  setOpenApiBaseUrl,
};
