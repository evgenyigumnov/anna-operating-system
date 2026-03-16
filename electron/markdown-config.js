const fs = require('fs');

function normalizeValue(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return normalized || fallback;
}

function parseMarkdownConfig(markdown, options = {}) {
  const defaults =
    options.defaults && typeof options.defaults === 'object' ? options.defaults : {};
  const headingToField =
    options.headingToField instanceof Map ? options.headingToField : new Map();
  const sections = {};
  let currentField = null;

  for (const line of String(markdown || '').split(/\r?\n/)) {
    const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*$/);

    if (headingMatch) {
      const heading = headingMatch[1].trim().toLowerCase();
      currentField = headingToField.get(heading) || null;

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

  return Object.fromEntries(
    Object.entries(defaults).map(([field, fallback]) => [
      field,
      normalizeValue(sections[field], fallback),
    ]),
  );
}

function loadMarkdownConfig(filePath, options = {}) {
  try {
    const markdown = fs.readFileSync(filePath, 'utf8');
    return parseMarkdownConfig(markdown, options);
  } catch (_error) {
    return { ...(options.defaults || {}) };
  }
}

module.exports = {
  loadMarkdownConfig,
  normalizeValue,
  parseMarkdownConfig,
};
