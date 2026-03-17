const path = require('path');
const {
  loadMarkdownConfig,
  normalizeValue,
  parseMarkdownConfig,
} = require('./markdown-config');

const DEFAULT_IDENTITY = {
  name: 'Anna',
  sex: 'Female',
  style: 'Simple, concise, and with a sense of humor',
  rules: '',
};

const HEADING_TO_FIELD = new Map([
  ['name', 'name'],
  ['sex', 'sex'],
  ['gender', 'sex'],
  ['style', 'style'],
  ['rules', 'rules'],
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

  const promptLines = [
    'Identity profile:',
    `Name: ${normalizeValue(normalizedIdentity.name, DEFAULT_IDENTITY.name)}`,
    `Sex: ${normalizeValue(normalizedIdentity.sex, DEFAULT_IDENTITY.sex)}`,
    `Style: ${normalizeValue(normalizedIdentity.style, DEFAULT_IDENTITY.style)}`,
  ];

  if (normalizedRules) {
    promptLines.push('Rules:');
    promptLines.push(normalizedRules);
  }

  return promptLines.join('\n');
}

module.exports = {
  DEFAULT_IDENTITY,
  buildIdentityPrompt,
  loadIdentity,
  parseIdentityMarkdown,
};
