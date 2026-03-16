const fs = require('fs');
const path = require('path');

const LLM_STUDIO_BASE_URL = 'http://192.168.10.12:1234/v1';
const LLM_STUDIO_MODEL = 'unsloth/qwen3.5-9b';
const DEFAULT_SYSTEM_PROMPT =
  'You are Anna. Reply in Russian unless the user explicitly asks otherwise. Use tools when they are relevant.';

async function createOpenAIClient() {
  let OpenAI;

  try {
    ({ default: OpenAI } = await import('openai'));
  } catch (_error) {
    throw new Error('The openai package is not installed. Run npm i openai');
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'llm-studio',
    baseURL: LLM_STUDIO_BASE_URL,
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
  const systemPrompt =
    typeof options.systemPrompt === 'string' && options.systemPrompt.trim()
      ? options.systemPrompt.trim()
      : DEFAULT_SYSTEM_PROMPT;
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

  while (true) {
    const response = await client.chat.completions.create({
      model: LLM_STUDIO_MODEL,
      messages,
      tool_choice: 'auto',
      tools,
    });

    const choice = response.choices?.[0];
    const assistantMessage = choice?.message;

    if (!assistantMessage) {
      return {
        output: 'Нет ответа от модели.',
        steps: stepHistory,
      };
    }

    messages.push(assistantMessage);
    const assistantText = extractTextContent(assistantMessage.content);

    if (!assistantMessage.tool_calls?.length) {
      return {
        output: assistantText || 'Нет ответа от модели.',
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
      const result = await toolHandler(parsedArguments, {
        runInference,
        runInferenceSession,
        availableToolNames: tools.map((tool) => tool.function?.name).filter(Boolean),
      });

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
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
  runInference,
  runInferenceSession,
};
