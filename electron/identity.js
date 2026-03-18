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

function resolveMarkdownFilePath(fileName, { allowBundledFallback = true } = {}) {
  const normalizedFileName = String(fileName || '').trim();

  if (!normalizedFileName) {
    return null;
  }

  const runtimePath = getDataPath(normalizedFileName);

  if (fs.existsSync(runtimePath)) {
    return runtimePath;
  }

  if (!allowBundledFallback) {
    return null;
  }

  const bundledPath = getBundledPath(normalizedFileName);
  return fs.existsSync(bundledPath) ? bundledPath : null;
}

function loadMarkdownFile(fileName, options = {}) {
  const filePath = resolveMarkdownFilePath(fileName, options);

  if (!filePath) {
    return '';
  }

  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (_error) {
    return '';
  }
}

function parseMarkdownSections(markdown) {
  const sections = [];
  let currentSection = null;

  for (const line of String(markdown || '').split(/\r?\n/)) {
    const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*$/);

    if (headingMatch) {
      currentSection = {
        title: headingMatch[1].trim(),
        lines: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  return sections;
}

function normalizeSectionLines(lines) {
  const normalizedLines = Array.isArray(lines)
    ? lines.map((line) => String(line || '').trimEnd())
    : [];

  while (normalizedLines.length && !normalizedLines[0].trim()) {
    normalizedLines.shift();
  }

  while (
    normalizedLines.length &&
    (!normalizedLines.at(-1).trim() || normalizedLines.at(-1).trim() === '```')
  ) {
    normalizedLines.pop();
  }

  return normalizedLines.filter((line) => line.trim() !== '```');
}

function appendMarkdownSections(promptLines, sectionTitle, markdown) {
  const sections = parseMarkdownSections(markdown);

  if (!sections.length) {
    return;
  }

  promptLines.push('');
  promptLines.push(sectionTitle);

  for (const section of sections) {
    const contentLines = normalizeSectionLines(section.lines);

    if (!contentLines.length) {
      continue;
    }

    promptLines.push(`## ${section.title}`);
    promptLines.push(...contentLines);
    promptLines.push('');
  }

  while (promptLines.length && !promptLines.at(-1).trim()) {
    promptLines.pop();
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
    '# ASSISTANCE IDENTITY',
    '## Name',
    normalizeValue(normalizedIdentity.name, DEFAULT_IDENTITY.name),
    '',
    '## Sex',
    normalizeValue(normalizedIdentity.sex, DEFAULT_IDENTITY.sex),
    '',
    '## Language',
    normalizeValue(normalizedIdentity.language, DEFAULT_IDENTITY.language),
    '',
    '## Style',
    normalizeValue(normalizedIdentity.style, DEFAULT_IDENTITY.style),
  ];

  if (normalizedRules) {
    promptLines.push('');
    promptLines.push('## Rules');
    promptLines.push(normalizedRules);
  }

  if (normalizedOperatingSystem) {
    promptLines.push('');
    promptLines.push('## Operating System');
    promptLines.push(normalizedOperatingSystem);
  }

  const userMarkdown = loadMarkdownFile('USER.md', {
    allowBundledFallback: false,
  });

  if (userMarkdown) {
    appendMarkdownSections(promptLines, '# USER PROFILE', userMarkdown);
  }

  if (hasImapConfig()) {
    const emailMarkdown = loadMarkdownFile('EMAIL.md', {
      allowBundledFallback: false,
    });

    if (emailMarkdown) {
      appendMarkdownSections(promptLines, '# EMAIL RULES', emailMarkdown);
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
