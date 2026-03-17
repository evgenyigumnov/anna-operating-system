const { registerTask, unregisterTask } = require('../task-runner');
const { createTaskFile, listTaskFiles, loadState, parseTaskFile } = require('../task-storage');

function formatRelativeTime(timestamp) {
  if (typeof timestamp !== 'string' || !timestamp.trim()) {
    return 'never';
  }

  const targetTime = Date.parse(timestamp);

  if (!Number.isFinite(targetTime)) {
    return 'unknown';
  }

  const diffMs = targetTime - Date.now();
  const absDiffMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absDiffMs < hourMs) {
    return rtf.format(Math.round(diffMs / minuteMs), 'minute');
  }

  if (absDiffMs < dayMs) {
    return rtf.format(Math.round(diffMs / hourMs), 'hour');
  }

  return rtf.format(Math.round(diffMs / dayMs), 'day');
}

function parseRecentRunsValue(taskHistoryRule) {
  if (typeof taskHistoryRule !== 'string') {
    return null;
  }

  const match = taskHistoryRule.trim().match(/^last\s+(\d+)\s+messages$/i);
  return match ? Number(match[1]) : null;
}

function buildTaskList() {
  const state = loadState();

  return listTaskFiles().map((filePath) => {
    const taskConfig = parseTaskFile(filePath);
    const taskState = state.tasks?.[taskConfig.id] || {};
    const runHistory = Array.isArray(taskState.history) ? taskState.history : [];

    return {
      taskId: taskConfig.id,
      fileName: taskConfig.fileName,
      schedule: taskConfig.schedule,
      instructions: taskConfig.instructions,
      historyRule: taskConfig.history,
      recentRunsForAnalysis: parseRecentRunsValue(taskConfig.history),
      runCount: runHistory.length,
      lastRunAt: taskState.lastRunAt || null,
      lastRunAgo: formatRelativeTime(taskState.lastRunAt),
      lastOutput: taskState.lastOutput || null,
      delayedRunAt: taskState.delayedRunAt || null,
    };
  });
}

module.exports = {
  definition: {
    type: 'function',
    function: {
      name: 'manage_tasks',
      description:
        'Creates, deletes, or lists task files stored in electron/tasks. Use English task instructions when possible.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'create', 'delete'],
            description: 'Operation to perform on tasks.',
          },
          task_id: {
            type: 'string',
            description: 'Existing task id or file name for delete.',
          },
          title: {
            type: 'string',
            description: 'Short task title used to generate the file name during create.',
          },
          schedule: {
            type: 'string',
            description: 'Task schedule, for example ASAP, Once a day, Every 6 hours, or After 1 minute.',
          },
          instructions: {
            type: 'string',
            description: 'Task instructions written into the markdown file. Instructions will be parsed by LLM. Instructions should be concise and clear and in human-readable format. Instruction is not shell commands script. If the task runs periodically, add at the end of the instructions that if the task has produced the same result in the previous runs, remain silent. This will avoid sending a message to the user every hour.',
          },
          recent_runs_for_analysis: {
            type: 'integer',
            description:
              'Optional number of latest runs to expose to the task as prior messages for silence or deduplication decisions. If a task is frequently launched, it makes sense to specify the number of stored launch histories so that the user does not receive a notification more than once a day. Calculate how many times the task will be launched per day and use this number as the value.',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  handler: async ({
    action,
    task_id: taskId,
    title,
    schedule,
    instructions,
    recent_runs_for_analysis: recentRunsForAnalysis,
  }) => {
    if (action === 'list') {
      const tasks = buildTaskList();

      return {
        ok: true,
        action,
        count: tasks.length,
        tasks,
      };
    }

    if (action === 'create') {
      const taskConfig = createTaskFile({
        title,
        schedule,
        instructions,
        recentRunsForAnalysis,
      });

      await registerTask(taskConfig.filePath);

      return {
        ok: true,
        action,
        task: {
          taskId: taskConfig.id,
          fileName: taskConfig.fileName,
          schedule: taskConfig.schedule,
          historyRule: taskConfig.history,
        },
      };
    }

    if (action === 'delete') {
      if (typeof taskId !== 'string' || !taskId.trim()) {
        throw new Error('The "task_id" field is required for delete.');
      }

      const deletedTask = unregisterTask(taskId);

      if (!deletedTask) {
        return {
          ok: false,
          action,
          message: `Task "${taskId}" was not found.`,
        };
      }

      return {
        ok: true,
        action,
        task: {
          taskId: deletedTask.id,
          fileName: deletedTask.fileName,
        },
      };
    }

    throw new Error(`Unsupported action "${action}".`);
  },
};
