const fs = require('fs');
const path = require('path');

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

function normalizeValue(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return normalized || fallback;
}

function parseIdentityMarkdown(markdown) {
  const sections = {};
  let currentField = null;

  for (const line of String(markdown || '').split(/\r?\n/)) {
    const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*$/);

    if (headingMatch) {
      const heading = headingMatch[1].trim().toLowerCase();
      currentField = HEADING_TO_FIELD.get(heading) || null;

      if (currentField && typeof sections[currentField] !== 'string') {
        sections[currentField] = '';
      }

      continue;
    }

    if (!currentField) {
      continue;
    }

    sections[currentField] = `${sections[currentField]}${sections[currentField] ? '\n' : ''}${line}`;
  }

  return {
    name: normalizeValue(sections.name, DEFAULT_IDENTITY.name),
    sex: normalizeValue(sections.sex, DEFAULT_IDENTITY.sex),
    style: normalizeValue(sections.style, DEFAULT_IDENTITY.style),
  };
}

function loadIdentity(identityPath = path.join(__dirname, '..', 'IDENTITY.md')) {
  try {
    const markdown = fs.readFileSync(identityPath, 'utf8');
    return parseIdentityMarkdown(markdown);
  } catch (_error) {
    return { ...DEFAULT_IDENTITY };
  }
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
