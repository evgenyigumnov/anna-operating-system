function getCurrentTime() {
  return {
    iso: new Date().toISOString(),
    local: new Date().toLocaleString('ru-RU'),
  };
}

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

async function runInference(message) {
  const client = await createOpenAIClient();
  const messages = [
    {
      role: 'system',
      content:
        'You are Anna. Reply in Russian unless the user explicitly asks otherwise. Use tools when they are relevant.',
    },
    {
      role: 'user',
      content: message,
    },
  ];

  while (true) {
    const response = await client.chat.completions.create({
      model: LLM_STUDIO_MODEL,
      messages,
      tool_choice: 'auto',
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_current_time',
            description: 'Returns the current local time for the Electron app runtime.',
            parameters: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
        },
      ],
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
      if (toolCall.function?.name !== 'get_current_time') {
        throw new Error(`Unsupported tool call: ${toolCall.function?.name || 'unknown'}`);
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(getCurrentTime()),
      });
    }
  }
}

module.exports = {
  runInference,
};
