function getCurrentTime() {
  return {
    iso: new Date().toISOString(),
    local: new Date().toLocaleString('ru-RU'),
  };
}

async function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  let OpenAI;

  try {
    ({ default: OpenAI } = await import('openai'));
  } catch (_error) {
    throw new Error('The openai package is not installed. Run npm i openai');
  }

  return new OpenAI({ apiKey });
}

async function runInference(message) {
  const client = await createOpenAIClient();

  let response = await client.responses.create({
    model: 'gpt-4.1-mini',
    instructions:
      'You are Anna. Reply in Russian unless the user explicitly asks otherwise. Use tools when they are relevant.',
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: message }],
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'get_current_time',
        description: 'Returns the current local time for the Electron app runtime.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    ],
  });

  while (response.output?.some((item) => item.type === 'function_call')) {
    const toolOutputs = response.output
      .filter((item) => item.type === 'function_call')
      .map((item) => {
        if (item.name !== 'get_current_time') {
          throw new Error(`Unsupported tool call: ${item.name}`);
        }

        return {
          type: 'function_call_output',
          call_id: item.call_id,
          output: JSON.stringify(getCurrentTime()),
        };
      });

    response = await client.responses.create({
      model: 'gpt-4.1-mini',
      previous_response_id: response.id,
      input: toolOutputs,
    });
  }

  return response.output_text?.trim() || 'Нет ответа от модели.';
}

module.exports = {
  runInference,
};
