const path = require('path');
const {
  loadMarkdownConfig,
  normalizeValue,
  parseMarkdownConfig,
} = require('./markdown-config');

const DEFAULT_IDENTITY = {
  name: 'Анна',
  sex: 'Женский',
  style: 'Простой, лаконичный и с юмором',
};

const HEADING_TO_FIELD = new Map([
  ['name', 'name'],
  ['имя', 'name'],
  ['sex', 'sex'],
  ['gender', 'sex'],
  ['пол', 'sex'],
  ['style', 'style'],
  ['стиль', 'style'],
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

  return [
    'Identity profile:',
    `Name: ${normalizeValue(normalizedIdentity.name, DEFAULT_IDENTITY.name)}`,
    `Sex: ${normalizeValue(normalizedIdentity.sex, DEFAULT_IDENTITY.sex)}`,
    `Style: ${normalizeValue(normalizedIdentity.style, DEFAULT_IDENTITY.style)}`,
  ].join('\n');
}

module.exports = {
  DEFAULT_IDENTITY,
  buildIdentityPrompt,
  loadIdentity,
  parseIdentityMarkdown,
};
