const TOOL_NAME = 'task_from_steps';

function normalizeStepHistory(stepHistory) {
  if (!Array.isArray(stepHistory)) {
    return [];
  }

  return stepHistory
    .map((step) => {
      if (typeof step === 'string') {
        return step.trim();
      }

      if (step && typeof step === 'object') {
        return JSON.stringify(step);
      }

      return '';
    })
    .filter(Boolean);
}

module.exports = {
  definition: {
    type: 'function',
    function: {
      name: TOOL_NAME,
      description:
        'Solves a multi-step task by running a child inference with the current tools, excluding this tool to avoid recursion.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The task that the child inference must complete.',
          },
          step_history: {
            type: 'array',
            description:
              'Optional list of already completed or attempted steps that the child inference should continue from.',
            items: {
              anyOf: [
                { type: 'string' },
                { type: 'object' },
              ],
            },
          },
        },
        required: ['task'],
        additionalProperties: false,
      },
    },
  },
  handler: async ({ task, step_history }, context = {}) => {
    if (typeof task !== 'string' || !task.trim()) {
      throw new Error('The "task" argument must be a non-empty string.');
    }

    if (typeof context.runInferenceSession !== 'function') {
      throw new Error('Nested inference is not available in the current tool context.');
    }

    const normalizedHistory = normalizeStepHistory(step_history);
    const conversation = [
      {
        role: 'user',
        content: [
          'Complete the task using the available tools.',
          `Task: ${task.trim()}`,
          normalizedHistory.length
              ? `What has already been done:\n${normalizedHistory.map((step, index) => `${index + 1}. ${step}`).join('\n')}`
              : 'What has already been done: no steps yet.',
          'Work step by step, call multiple different tools if needed, and in the end return only the task result and a brief list of the steps actually performed.',
        ].join('\n\n'),
      },
    ];

    const session = await context.runInferenceSession(conversation, {
      excludedToolNames: [TOOL_NAME],
    });

    return {
      ok: true,
      task: task.trim(),
      result: session.output,
      steps: session.steps,
    };
  },
};
