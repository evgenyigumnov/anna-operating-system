const fs = require('fs');
const os = require('os');

function readLinuxReleaseInfo() {
  try {
    const content = fs.readFileSync('/etc/os-release', 'utf8');
    const lines = content.split(/\r?\n/);
    const values = {};

    for (const line of lines) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);

      if (!match) {
        continue;
      }

      values[match[1]] = match[2].replace(/^"/, '').replace(/"$/, '');
    }

    return values;
  } catch (_error) {
    return {};
  }
}

function getSystemInfo() {
  const platform = os.platform();
  const architecture = os.arch();

  if (platform === 'win32') {
    return `Windows ${os.release()} ${architecture}`;
  }

  if (platform === 'darwin') {
    return `macOS ${os.release()} ${architecture}`;
  }

  if (platform === 'linux') {
    const releaseInfo = readLinuxReleaseInfo();
    const distribution =
      releaseInfo.PRETTY_NAME ||
      releaseInfo.NAME ||
      'Linux';

    return `${distribution} ${architecture}`.trim();
  }

  return `${os.type()} ${os.release()} ${architecture}`.trim();
}

module.exports = {
  getSystemInfo,
};
