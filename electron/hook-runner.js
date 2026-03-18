const fs = require('fs');
const path = require('path');
const { logInferenceError, logTaskEvent } = require('./logger');

function loadHookFiles() {
  const hooksDirectory = path.join(__dirname, 'hooks');

  if (!fs.existsSync(hooksDirectory)) {
    return [];
  }

  return fs
    .readdirSync(hooksDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(hooksDirectory, entry.name))
    .sort();
}

async function startHooks() {
  const stopHandlers = [];
  const hookFiles = loadHookFiles();

  for (const hookPath of hookFiles) {
    try {
      delete require.cache[require.resolve(hookPath)];

      const hookModule = require(hookPath);
      const hookName =
        typeof hookModule?.name === 'string' && hookModule.name.trim()
          ? hookModule.name.trim()
          : path.basename(hookPath, '.js');

      if (typeof hookModule?.start !== 'function') {
        throw new Error(`Hook "${hookName}" must export a start function.`);
      }

      const stop = await hookModule.start();

      logTaskEvent('hook_started', {
        hookName,
        fileName: path.basename(hookPath),
      });

      if (typeof stop === 'function') {
        stopHandlers.push({
          hookName,
          stop,
        });
      }
    } catch (error) {
      logInferenceError(error, {
        stage: 'hook_startup',
        hookFile: path.basename(hookPath),
      });
    }
  }

  return async () => {
    await Promise.allSettled(
      stopHandlers.map(async ({ hookName, stop }) => {
        try {
          await stop();

          logTaskEvent('hook_stopped', {
            hookName,
          });
        } catch (error) {
          logInferenceError(error, {
            stage: 'hook_shutdown',
            hookName,
          });
        }
      }),
    );
  };
}

module.exports = {
  startHooks,
};
