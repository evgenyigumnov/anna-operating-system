const log = require('electron-log/main');

const MAX_LOG_LENGTH = 4_000;

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'info';

function truncate(value) {
  if (typeof value !== 'string') {
    return '';
  }

  if (value.length <= MAX_LOG_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_LOG_LENGTH)}...[truncated]`;
}

function serialize(value) {
  try {
    return truncate(
      JSON.stringify(value, (_key, nestedValue) => {
        if (nestedValue instanceof Error) {
          return {
            name: nestedValue.name,
            message: nestedValue.message,
            stack: nestedValue.stack,
          };
        }

        if (typeof nestedValue === 'bigint') {
          return nestedValue.toString();
        }

        return nestedValue;
      }),
    );
  } catch (_error) {
    return truncate(String(value));
  }
}

function writeInfo(eventName, payload) {
  if (payload === undefined) {
    log.info(`[${eventName}]`);
    return;
  }

  log.info(`[${eventName}] ${serialize(payload)}`);
}

function logUserMessage(content, metadata = {}) {
  writeInfo('user_message', {
    ...metadata,
    content,
  });
}

function logAssistantMessage(content, metadata = {}) {
  writeInfo('assistant_message', {
    ...metadata,
    content,
  });
}

function logSystemPrompt(content, metadata = {}) {
  writeInfo('system_prompt', {
    ...metadata,
    content,
  });
}

function logToolCall(toolName, args, metadata = {}) {
  writeInfo('tool_call', {
    ...metadata,
    toolName,
    arguments: args,
  });
}

function logToolResult(toolName, result, metadata = {}) {
  writeInfo('tool_result', {
    ...metadata,
    toolName,
    result,
  });
}

function logInferenceError(error, metadata = {}) {
  writeInfo('inference_error', {
    ...metadata,
    error,
  });
}

module.exports = {
  logUserMessage,
  logAssistantMessage,
  logSystemPrompt,
  logToolCall,
  logToolResult,
  logInferenceError,
};
