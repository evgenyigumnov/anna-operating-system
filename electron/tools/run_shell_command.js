const { exec } = require('node:child_process');
const { promisify } = require('node:util');

const execAsync = promisify(exec);
const COMMAND_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

function trimOutput(value) {
  if (typeof value !== 'string') {
    return '';
  }

  if (Buffer.byteLength(value, 'utf8') <= MAX_OUTPUT_BYTES) {
    return value;
  }

  return `${value.slice(0, MAX_OUTPUT_BYTES)}\n...[output truncated]`;
}

module.exports = {
  definition: {
    type: 'function',
    function: {
      name: 'run_shell_command',
      description: 'Executes a shell command on the local machine and returns stdout, stderr, and exit details.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Shell command to execute.',
          },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
  },
  handler: async ({ command }) => {
    if (typeof command !== 'string' || !command.trim()) {
      throw new Error('The "command" argument must be a non-empty string.');
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      });

      return {
        ok: true,
        command,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
      };
    } catch (error) {
      return {
        ok: false,
        command,
        stdout: trimOutput(error.stdout),
        stderr: trimOutput(error.stderr || error.message),
        code: typeof error.code === 'number' ? error.code : null,
        signal: error.signal || null,
        timedOut: error.killed === true && error.signal === 'SIGTERM',
      };
    }
  },
};
