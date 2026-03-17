const path = require('path');
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

function loadIdentity(identityPath = path.join(__dirname, '..', 'IDENTITY.md')) {
  return loadMarkdownConfig(identityPath, {
    defaults: DEFAULT_IDENTITY,
    headingToField: HEADING_TO_FIELD,
  });
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

  return promptLines.join('\n');
}

module.exports = {
  DEFAULT_IDENTITY,
  buildIdentityPrompt,
  loadIdentity,
  parseIdentityMarkdown,
};
