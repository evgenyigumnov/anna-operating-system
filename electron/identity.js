const fs = require('fs');
const path = require('path');
const { getBundledPath, getDataPath } = require('./runtime-paths');
const { hasImapConfig } = require('./setup');
const {
  loadMarkdownConfig,
  normalizeValue,
  parseMarkdownConfig,
} = require('./markdown-config');

const DEFAULT_IDENTITY = {
  name: 'Anna',
  sex: 'Female',
  language: 'English',
  style: 'Simple, concise, and with a sense of humor',
  rules: '',
  operatingSystem: '',
};

const HEADING_TO_FIELD = new Map([
  ['name', 'name'],
  ['sex', 'sex'],
  ['gender', 'sex'],
  ['language', 'language'],
  ['locale', 'language'],
  ['style', 'style'],
  ['rules', 'rules'],
  ['operating system', 'operatingSystem'],
  ['os', 'operatingSystem'],
]);

function parseIdentityMarkdown(markdown) {
  return parseMarkdownConfig(markdown, {
    defaults: DEFAULT_IDENTITY,
    headingToField: HEADING_TO_FIELD,
  });
}

function resolveIdentityPath(identityPath) {
  if (typeof identityPath === 'string' && identityPath.trim()) {
    return path.resolve(identityPath);
  }

  const runtimeIdentityPath = getDataPath('IDENTITY.md');

  if (fs.existsSync(runtimeIdentityPath)) {
    return runtimeIdentityPath;
  }

  return getBundledPath('IDENTITY.md');
}

function loadIdentity(identityPath) {
  return loadMarkdownConfig(resolveIdentityPath(identityPath), {
    defaults: DEFAULT_IDENTITY,
    headingToField: HEADING_TO_FIELD,
  });
}

function resolveMarkdownFilePath(fileName) {
  const normalizedFileName = String(fileName || '').trim();

  if (!normalizedFileName) {
    return null;
  }

  const runtimePath = getDataPath(normalizedFileName);

  if (fs.existsSync(runtimePath)) {
    return runtimePath;
  }

  const bundledPath = getBundledPath(normalizedFileName);
  return fs.existsSync(bundledPath) ? bundledPath : null;
}

function loadMarkdownFile(fileName) {
  const filePath = resolveMarkdownFilePath(fileName);

  if (!filePath) {
    return '';
  }

  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (_error) {
    return '';
  }
}

function buildIdentityPrompt(identity) {
  const normalizedIdentity = {
    ...DEFAULT_IDENTITY,
    ...(identity && typeof identity === 'object' ? identity : {}),
  };
  const normalizedRules = normalizeValue(normalizedIdentity.rules, '');
  const normalizedOperatingSystem = normalizeValue(normalizedIdentity.operatingSystem, '');

  const promptLines = [
    'Identity profile:',
    `Name: ${normalizeValue(normalizedIdentity.name, DEFAULT_IDENTITY.name)}`,
    `Sex: ${normalizeValue(normalizedIdentity.sex, DEFAULT_IDENTITY.sex)}`,
    `Language: ${normalizeValue(normalizedIdentity.language, DEFAULT_IDENTITY.language)}`,
    `Style: ${normalizeValue(normalizedIdentity.style, DEFAULT_IDENTITY.style)}`,
  ];

  if (normalizedRules) {
    promptLines.push('Rules:');
    promptLines.push(normalizedRules);
  }

  if (normalizedOperatingSystem) {
    promptLines.push(`Operating System: ${normalizedOperatingSystem}`);
  }

  const userMarkdown = loadMarkdownFile('USER.md');

  if (userMarkdown) {
    promptLines.push('');
    promptLines.push('User profile config:');
    promptLines.push(userMarkdown);
  }

  if (hasImapConfig()) {
    const emailMarkdown = loadMarkdownFile('EMAIL.md');

    if (emailMarkdown) {
      promptLines.push('');
      promptLines.push('Email rules config:');
      promptLines.push(emailMarkdown);
    }
  }

  return promptLines.join('\n');
}

module.exports = {
  DEFAULT_IDENTITY,
  buildIdentityPrompt,
  loadIdentity,
  parseIdentityMarkdown,
};
