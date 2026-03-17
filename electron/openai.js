const fs = require('fs');
const path = require('path');
const { buildIdentityPrompt, loadIdentity } = require('./identity');
const {
  logAssistantMessage,
  logInferenceError,
  logSystemPrompt,
  logToolCall,
  logToolResult,
  logUserMessage,
} = require('./logger');

const OPENAPI_BASE_URL = 'http://192.168.10.12:11434/v1';
const OPENAPI_MODEL = 'gpt-oss:120b-cloud';

const DEFAULT_SYSTEM_PROMPT =
  'Format every final answer as Markdown. Use tools when they are relevant.';

function buildSystemPrompt(options = {}) {
  const basePrompt =
    typeof options.systemPrompt === 'string' && options.systemPrompt.trim()
      ? options.systemPrompt.trim()
      : DEFAULT_SYSTEM_PROMPT;
  const identityPrompt = buildIdentityPrompt(loadIdentity());

  return `${basePrompt}\n\n${identityPrompt}`;
}

async function createOpenAIClient() {
  let OpenAI;

  try {
    ({ default: OpenAI } = await import('openai'));
  } catch (_error) {
    throw new Error('The openai package is not installed. Run npm i openai');
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'llm-studio',
    baseURL: OPENAPI_BASE_URL,
  });
}

function normalizeConversation(conversation) {
  return conversation
    .filter((entry) => entry && typeof entry.content === 'string')
    .map((entry) => {
      const role = entry.role === 'assistant' ? 'assistant' : 'user';

      return {
        role,
        content: entry.content.trim(),
      };
    })
    .filter((entry) => entry.content);
}

function loadTools(options = {}) {
  const toolsDirectory = path.join(__dirname, 'tools');
  const excludedToolNames = new Set(
    Array.isArray(options.excludedToolNames) ? options.excludedToolNames : [],
  );

  if (!fs.existsSync(toolsDirectory)) {
    return {
      definitions: [],
      handlers: new Map(),
    };
  }

  const toolFiles = fs
    .readdirSync(toolsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort();

  const definitions = [];
  const handlers = new Map();

  for (const toolFile of toolFiles) {
    const toolPath = path.join(toolsDirectory, toolFile);

    delete require.cache[require.resolve(toolPath)];

    const toolModule = require(toolPath);
    const definition = toolModule?.definition;
    const handler = toolModule?.handler;
    const toolName = definition?.function?.name;

    if (!definition || typeof definition !== 'object') {
      throw new Error(`Tool "${toolFile}" must export a definition object`);
    }

    if (typeof toolName !== 'string' || !toolName.trim()) {
      throw new Error(`Tool "${toolFile}" must define function.name`);
    }

    if (typeof handler !== 'function') {
      throw new Error(`Tool "${toolFile}" must export a handler function`);
    }

    if (handlers.has(toolName)) {
      throw new Error(`Duplicate tool name detected: ${toolName}`);
    }

    if (excludedToolNames.has(toolName)) {
      continue;
    }

    definitions.push(definition);
    handlers.set(toolName, handler);
  }

  return {
    definitions,
    handlers,
  };
}

function extractTextContent(content) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (item?.type === 'text' ? item.text : ''))
      .join('')
      .trim();
  }

  return '';
}

async function runInferenceSession(conversation, options = {}) {
  const client = await createOpenAIClient();
  const { definitions: tools, handlers: toolHandlers } = loadTools(options);
  const systemPrompt = buildSystemPrompt(options);
  const stepHistory = [];
  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...normalizeConversation(conversation),
  ];

  if (messages.length === 1) {
    throw new Error('Conversation is empty');
  }

  const latestUserMessage = [...messages]
    .reverse()
    .find((entry) => entry.role === 'user' && typeof entry.content === 'string');

  if (latestUserMessage?.content) {
    logUserMessage(latestUserMessage.content, {
      messageCount: messages.length,
    });
  }

  while (true) {
    let stream;

    try {
      logSystemPrompt(systemPrompt, {
        messageCount: messages.length,
      });
      stream = await client.chat.completions.create({
        model: OPENAPI_MODEL,
        messages,
        tool_choice: 'auto',
        tools,
        stream: true,
      });
    } catch (error) {
      logInferenceError(error, {
        stage: 'chat_completion',
        messageCount: messages.length,
      });
      throw error;
    }

    const assistantMessage = {
      role: 'assistant',
      content: '',
      tool_calls: [],
    };
    const toolCallMap = new Map();
    let finishReason = null;

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;

      if (!delta) {
        continue;
      }

      if (typeof delta.content === 'string' && delta.content) {
        assistantMessage.content += delta.content;

        if (typeof options.onTextDelta === 'function') {
          options.onTextDelta(delta.content);
        }
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index ?? assistantMessage.tool_calls.length;
          const existingToolCall =
            toolCallMap.get(index) || {
              id: toolCallDelta.id || '',
              type: 'function',
              function: {
                name: toolCallDelta.function?.name || '',
                arguments: '',
              },
            };

          if (toolCallDelta.id) {
            existingToolCall.id = toolCallDelta.id;
          }

          if (toolCallDelta.function?.name) {
            existingToolCall.function.name = toolCallDelta.function.name;
          }

          if (typeof toolCallDelta.function?.arguments === 'string') {
            existingToolCall.function.arguments += toolCallDelta.function.arguments;
          }

          toolCallMap.set(index, existingToolCall);
        }
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    assistantMessage.tool_calls = [...toolCallMap.entries()]
      .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
      .map(([, toolCall]) => toolCall);

    if (!assistantMessage) {
      return {
        output: 'Нет ответа от модели.',
        steps: stepHistory,
      };
    }

    messages.push(assistantMessage);
    const assistantText = extractTextContent(assistantMessage.content);
    logAssistantMessage(assistantText, {
      hasToolCalls: Boolean(assistantMessage.tool_calls?.length),
      messageCount: messages.length,
    });

    if (
      finishReason !== 'tool_calls' &&
      !assistantMessage.tool_calls?.length
    ) {
      return {
        output: assistantText || 'No reply fro model.',
        steps: stepHistory,
      };
    }

    stepHistory.push({
      type: 'assistant_tool_request',
      content: assistantText || null,
      toolCalls: assistantMessage.tool_calls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function?.name || 'unknown',
        arguments: toolCall.function?.arguments || '{}',
      })),
    });

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function?.name || 'unknown';
      const toolHandler = toolHandlers.get(toolName);

      if (!toolHandler) {
        throw new Error(`Unsupported tool call: ${toolName}`);
      }

      const rawArguments = toolCall.function?.arguments;
      const parsedArguments = rawArguments ? JSON.parse(rawArguments) : {};
      logToolCall(toolName, parsedArguments, {
        toolCallId: toolCall.id,
      });

      let result;

      try {
        result = await toolHandler(parsedArguments, {
          runInference,
          runInferenceSession,
          availableToolNames: tools.map((tool) => tool.function?.name).filter(Boolean),
        });
      } catch (error) {
        logInferenceError(error, {
          stage: 'tool_execution',
          toolName,
          toolCallId: toolCall.id,
        });
        throw error;
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
      logToolResult(toolName, result, {
        toolCallId: toolCall.id,
      });

      stepHistory.push({
        type: 'tool_result',
        toolName,
        arguments: parsedArguments,
        result,
      });
    }
  }
}

async function runInference(conversation, options = {}) {
  const session = await runInferenceSession(conversation, options);
  return session.output;
}

module.exports = {
  extractTextContent,
  runInference,
  runInferenceSession,
};
