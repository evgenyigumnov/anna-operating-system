const fs = require('fs');
const path = require('path');

const LLM_STUDIO_BASE_URL = 'http://192.168.10.12:1234/v1';
const LLM_STUDIO_MODEL = 'unsloth/qwen3.5-9b';

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

function loadTools() {
  const toolsDirectory = path.join(__dirname, 'tools');

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

    definitions.push(definition);
    handlers.set(toolName, handler);
  }

  return {
    definitions,
    handlers,
  };
}

async function runInference(conversation) {
  const client = await createOpenAIClient();
  const { definitions: tools, handlers: toolHandlers } = loadTools();
  const messages = [
    {
      role: 'system',
      content:
        'You are Anna. Reply in Russian unless the user explicitly asks otherwise. Use tools when they are relevant.',
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
      return 'Нет ответа от модели.';
    }

    messages.push(assistantMessage);

    if (!assistantMessage.tool_calls?.length) {
      if (typeof assistantMessage.content === 'string') {
        return assistantMessage.content.trim() || 'Нет ответа от модели.';
      }

      if (Array.isArray(assistantMessage.content)) {
        const text = assistantMessage.content
          .map((item) => (item?.type === 'text' ? item.text : ''))
          .join('')
          .trim();

        return text || 'Нет ответа от модели.';
      }

      return 'Нет ответа от модели.';
    }

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function?.name || 'unknown';
      const toolHandler = toolHandlers.get(toolName);

      if (!toolHandler) {
        throw new Error(`Unsupported tool call: ${toolName}`);
      }

      const rawArguments = toolCall.function?.arguments;
      const parsedArguments = rawArguments ? JSON.parse(rawArguments) : {};
      const result = await toolHandler(parsedArguments);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }
}

module.exports = {
  runInference,
};
