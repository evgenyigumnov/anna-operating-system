const path = require('path');

const BUNDLED_PROJECT_ROOT = path.resolve(__dirname, '..');
const NORMALIZED_BUNDLED_ROOT = BUNDLED_PROJECT_ROOT.replace(/\\/g, '/').toLowerCase();
const PACKAGED_RUNTIME_MARKER = '/app.asar';

function isPackagedRuntime() {
  return NORMALIZED_BUNDLED_ROOT.includes(PACKAGED_RUNTIME_MARKER);
}

function normalizeDirectoryPath(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim();
  return normalized ? path.resolve(normalized) : '';
}

function resolveRuntimeDataDirectory() {
  const customDataDirectory = normalizeDirectoryPath(process.env.ANNA_DATA_DIR);

  if (customDataDirectory) {
    return customDataDirectory;
  }

  const portableExecutableDirectory = normalizeDirectoryPath(
    process.env.PORTABLE_EXECUTABLE_DIR,
  );

  if (portableExecutableDirectory) {
    return path.join(portableExecutableDirectory, 'anna-data');
  }

  if (isPackagedRuntime()) {
    return path.join(path.dirname(process.execPath), 'anna-data');
  }

  return BUNDLED_PROJECT_ROOT;
}

function getDataPath(...segments) {
  return path.join(resolveRuntimeDataDirectory(), ...segments);
}

function getBundledPath(...segments) {
  return path.join(BUNDLED_PROJECT_ROOT, ...segments);
}

module.exports = {
  getBundledPath,
  getDataPath,
  isPackagedRuntime,
  resolveRuntimeDataDirectory,
};
