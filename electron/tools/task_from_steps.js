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
          task.trim(),
          normalizedHistory.length
              ? `Previous runs of this task have already done the following:\n${normalizedHistory.map((step, index) => `${index + 1}. ${step}`).join('\n')}`
              : 'Previous runs of this task have not completed any steps yet.',
          'If the task requires an exact silence token such as "KEEP_SILENCE", preserve it exactly and return only that token with no extra text.',
          'Work step by step, call multiple different tools if needed, and in the end return only the task result and a brief list of the steps actually performed.',
        ].join('\n\n'),
      },
    ];

    const session = await context.runInferenceSession(conversation, {
      excludedToolNames: [TOOL_NAME],
      userMessageForLogging: 'Complete the task using the available tools.',
    });

    return {
      ok: true,
      task: task.trim(),
      result: session.output,
      steps: session.steps,
    };
  },
};
