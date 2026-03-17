const { app, BrowserWindow } = require('electron');

const LOAD_TIMEOUT_MS = 20_000;
const TOOL_NAME = 'get_url_dump';

function normalizeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('The "url" argument must be a non-empty string.');
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(value.trim());
  } catch (_error) {
    throw new Error('The "url" argument must be a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }

  return parsedUrl.toString();
}

function withTimeout(promise, timeoutMs, errorMessage) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function buildExtractionScript() {
  function extractPageDump() {
    const BLOCK_TAGS = new Set([
      'ADDRESS',
      'ARTICLE',
      'ASIDE',
      'BLOCKQUOTE',
      'DIV',
      'DL',
      'DT',
      'DD',
      'FIELDSET',
      'FIGCAPTION',
      'FIGURE',
      'FOOTER',
      'FORM',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'HEADER',
      'HR',
      'LI',
      'MAIN',
      'NAV',
      'OL',
      'P',
      'PRE',
      'SECTION',
      'TABLE',
      'TBODY',
      'TD',
      'TFOOT',
      'TH',
      'THEAD',
      'TR',
      'UL',
    ]);
    const SKIP_TAGS = new Set([
      'HEAD',
      'SCRIPT',
      'STYLE',
      'NOSCRIPT',
      'SVG',
      'CANVAS',
      'IFRAME',
      'OBJECT',
      'EMBED',
      'TEMPLATE',
      'SOURCE',
      'IMG',
      'PICTURE',
      'VIDEO',
      'AUDIO',
    ]);
    const links = [];
    const linkIndexes = new Map();

    function normalizeWhitespace(value) {
      return (value || '').replace(/\s+/g, ' ');
    }

    function cleanupText(value) {
      return (value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    function getReadableAnchorText(element) {
      const directText = cleanupText(normalizeWhitespace(element.innerText || element.textContent || ''));

      if (directText) {
        return directText;
      }

      const labelledText = cleanupText(
        normalizeWhitespace(
          element.getAttribute('aria-label') || element.getAttribute('title') || '',
        ),
      );

      return labelledText;
    }

    function registerLink(href, text) {
      if (linkIndexes.has(href)) {
        return linkIndexes.get(href);
      }

      const index = links.length + 1;

      linkIndexes.set(href, index);
      links.push({
        index,
        href,
        text,
      });

      return index;
    }

    function renderChildren(node) {
      return Array.from(node.childNodes)
        .map((childNode) => renderNode(childNode))
        .join('');
    }

    function renderNode(node) {
      if (!node) {
        return '';
      }

      if (node.nodeType === Node.TEXT_NODE) {
        return normalizeWhitespace(node.textContent || '');
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const tagName = node.tagName.toUpperCase();

      if (SKIP_TAGS.has(tagName)) {
        return '';
      }

      if (tagName === 'BR') {
        return '\n';
      }

      if (tagName === 'HR') {
        return '\n\n';
      }

      if (tagName === 'A') {
        const href = node.href || '';
        const text = getReadableAnchorText(node);

        if (!href || !text) {
          return text;
        }

        const index = registerLink(href, text);

        return `${text} [${index}]`;
      }

      const content = renderChildren(node);
      const trimmedContent = cleanupText(content);

      if (!trimmedContent) {
        return '';
      }

      if (tagName === 'LI') {
        return `\n* ${trimmedContent}`;
      }

      if (BLOCK_TAGS.has(tagName)) {
        return `\n${trimmedContent}\n`;
      }

      return content;
    }

    const title = cleanupText(document.title || '');
    const text = cleanupText(renderNode(document.body || document.documentElement));
    let dump = text;

    if (title) {
      dump = cleanupText(`${title}\n\n${dump}`);
    }

    if (links.length > 0) {
      const references = links.map((link) => `[${link.index}] ${link.href}`).join('\n');
      dump = `${dump}\n\nReferences\n\n${references}`;
    }

    return {
      title,
      text,
      links,
      dump: dump.trim(),
    };
  }

  return `(${extractPageDump.toString()})()`;
}

async function loadPageDump(targetUrl) {
  await app.whenReady();

  const browserWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      images: false,
    },
  });

  browserWindow.webContents.setWindowOpenHandler(() => ({
    action: 'deny',
  }));

  try {
    await withTimeout(
      browserWindow.loadURL(targetUrl),
      LOAD_TIMEOUT_MS,
      `Timed out while loading "${targetUrl}".`,
    );

    const pageDump = await withTimeout(
      browserWindow.webContents.executeJavaScript(buildExtractionScript(), true),
      LOAD_TIMEOUT_MS,
      `Timed out while extracting page content from "${targetUrl}".`,
    );

    return {
      ok: true,
      url: targetUrl,
      finalUrl: browserWindow.webContents.getURL() || targetUrl,
      ...pageDump,
    };
  } finally {
    if (!browserWindow.isDestroyed()) {
      browserWindow.destroy();
    }
  }
}

module.exports = {
  definition: {
    type: 'function',
    function: {
      name: TOOL_NAME,
      description:
        'Loads a web page and returns a text dump plus numbered links in a format similar to "lynx -dump -image_links=0".',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Absolute HTTP or HTTPS URL to fetch.',
          },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
  },
  handler: async ({ url }) => loadPageDump(normalizeUrl(url)),
};
