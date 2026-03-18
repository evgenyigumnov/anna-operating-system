const fs = require('fs');
const path = require('path');
const { runInferenceSession, extractTextContent } = require('./openai');
const { logInferenceError, logTaskEvent } = require('./logger');
const { deliverConversationEntry } = require('./message-delivery');
const {
  MAX_HISTORY_ITEMS,
  TASKS_DIRECTORY,
  deleteTaskFile,
  deleteTaskState,
  listTaskFiles,
  loadState,
  parseTaskFile,
  saveState,
  saveTaskState,
  trimText,
} = require('./task-storage');

const SILENCE_TOKEN = 'KEEP_SILENCE';

const taskFromStepsTool = require('./tools/task_from_steps');

const taskTimers = new Map();
const runningTasks = new Set();
let runnerOptions = {};

function emitTaskResult(taskResult, options = runnerOptions) {
  if (typeof options?.onTaskResult === 'function') {
    options.onTaskResult(taskResult);
  }
}

function convertToMilliseconds(amount, unit) {
  const normalizedUnit = unit.toLowerCase();
  const baseAmount = Number(amount);

  if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
    return null;
  }

  if (normalizedUnit.startsWith('minute')) {
    return baseAmount * 60 * 1000;
  }

  if (normalizedUnit.startsWith('hour')) {
    return baseAmount * 60 * 60 * 1000;
  }

  if (normalizedUnit.startsWith('day')) {
    return baseAmount * 24 * 60 * 60 * 1000;
  }

  return null;
}

function parseSchedule(scheduleValue) {
  const normalized = trimText(scheduleValue).toLowerCase();

  if (!normalized || normalized === 'asap' || normalized === 'immediately' || normalized === 'now') {
    return {
      kind: 'once',
      label: scheduleValue,
    };
  }

  if (normalized === 'daily' || normalized === 'once a day') {
    return {
      kind: 'interval',
      intervalMs: 24 * 60 * 60 * 1000,
      label: scheduleValue,
    };
  }

  if (normalized === 'hourly' || normalized === 'once an hour') {
    return {
      kind: 'interval',
      intervalMs: 60 * 60 * 1000,
      label: scheduleValue,
    };
  }

  if (normalized === 'every minute' || normalized === 'once a minute') {
    return {
      kind: 'interval',
      intervalMs: 60 * 1000,
      label: scheduleValue,
    };
  }

  const everyPattern = normalized.match(/^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/);

  if (everyPattern) {
    return {
      kind: 'interval',
      intervalMs: convertToMilliseconds(everyPattern[1], everyPattern[2]),
      label: scheduleValue,
    };
  }

  const oncePattern = normalized.match(/^once\s+a[n]?\s+(minute|hour|day)$/);

  if (oncePattern) {
    return {
      kind: 'interval',
      intervalMs: convertToMilliseconds(1, oncePattern[1]),
      label: scheduleValue,
    };
  }

  const afterPattern = normalized.match(/^after\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/);

  if (afterPattern) {
    return {
      kind: 'delayed_once',
      delayMs: convertToMilliseconds(afterPattern[1], afterPattern[2]),
      label: scheduleValue,
    };
  }

  throw new Error(`Unsupported task schedule: "${scheduleValue}".`);
}

function getDelayedRunTimestamp(taskConfig, scheduleConfig, taskState) {
  if (scheduleConfig.kind !== 'delayed_once' || !scheduleConfig.delayMs) {
    return null;
  }

  const savedScheduleLabel = trimText(taskState?.delayedScheduleLabel);
  const savedRunAt = trimText(taskState?.delayedRunAt);

  if (savedScheduleLabel === trimText(taskConfig.schedule) && savedRunAt) {
    const parsedSavedRunAt = Date.parse(savedRunAt);

    if (Number.isFinite(parsedSavedRunAt)) {
      return parsedSavedRunAt;
    }
  }

  const delayedRunAt = new Date(Date.now() + scheduleConfig.delayMs).toISOString();

  saveTaskState(taskConfig.id, (latestTaskState) => ({
    ...latestTaskState,
    delayedScheduleLabel: taskConfig.schedule,
    delayedRunAt,
  }));

  return Date.parse(delayedRunAt);
}

function takeRecentMessages(taskState, limit) {
  const history = Array.isArray(taskState?.history) ? taskState.history : [];
  return history.slice(-limit).map((entry) => entry.output).filter(Boolean);
}

function buildStepHistory(taskConfig, taskState) {
  const normalizedHistory = taskConfig.history.toLowerCase();

  if (normalizedHistory === 'no') {
    return [];
  }

  const lastMessagesPattern = normalizedHistory.match(/^last\s+(\d+)\s+messages$/);

  if (lastMessagesPattern) {
    const messageLimit = Number(lastMessagesPattern[1]);
    return takeRecentMessages(taskState, messageLimit);
  }

  return [`Task history: ${taskConfig.history}`];
}

function buildTaskPrompt(taskConfig) {
  const promptParts = [
    'Instructions:',
    taskConfig.instructions,
  ];

  if (taskConfig.history && taskConfig.history.toLowerCase() !== 'no') {
    promptParts.push(`History rule: ${taskConfig.history}`);
  }

  promptParts.push(
    `If the task says to stay silent, says that nothing changed, or says to stay silent if it was already reported before, return exactly "${SILENCE_TOKEN}".`,
    `Do not explain why you are staying silent. `,
    'Return the final result in English.',
    'If the task requires a notification or advice, return the useful result in concise Markdown.',
  );

  return promptParts.join('\n\n');
}

function clearTaskTimer(taskId) {
  const existingTimer = taskTimers.get(taskId);

  if (existingTimer) {
    clearTimeout(existingTimer);
    taskTimers.delete(taskId);
  }
}

function scheduleNextRun(taskConfig, scheduleConfig, options = {}) {
  if (scheduleConfig.kind !== 'interval' || !scheduleConfig.intervalMs) {
    return;
  }

  clearTaskTimer(taskConfig.id);

  const timer = setTimeout(() => {
    runTask(taskConfig, options).catch((error) => {
      logInferenceError(error, {
        stage: 'task_scheduled_run',
        taskId: taskConfig.id,
        fileName: taskConfig.fileName,
      });
    });
  }, scheduleConfig.intervalMs);

  taskTimers.set(taskConfig.id, timer);
}

function normalizeTaskOutput(rawResult) {
  const text = extractTextContent(rawResult);
  return trimText(text);
}

async function executeTask(taskConfig, taskState) {
  const stepHistory = buildStepHistory(taskConfig, taskState);
  const taskPrompt = buildTaskPrompt(taskConfig);
  const result = await taskFromStepsTool.handler(
    {
      task: taskPrompt,
      step_history: stepHistory,
    },
    {
      runInferenceSession: (conversation, options = {}) => {
        const excludedToolNames = new Set(
          Array.isArray(options.excludedToolNames) ? options.excludedToolNames : [],
        );

        excludedToolNames.add('manage_tasks');

        return runInferenceSession(conversation, {
          ...options,
          excludedToolNames: [...excludedToolNames],
        });
      },
    },
  );

  return {
    output: normalizeTaskOutput(result?.result),
    steps: Array.isArray(result?.steps) ? result.steps : [],
  };
}

function persistTaskResult(taskConfig, output, taskState) {
  const nextHistory = [...(Array.isArray(taskState.history) ? taskState.history : [])];

  nextHistory.push({
    timestamp: new Date().toISOString(),
    output,
  });

  return {
    ...taskState,
    lastRunAt: new Date().toISOString(),
    lastOutput: output,
    history: nextHistory.slice(-MAX_HISTORY_ITEMS),
    delayedScheduleLabel: undefined,
    delayedRunAt: undefined,
  };
}

function scheduleDelayedRun(taskConfig, runAtMs, options = {}) {
  if (!Number.isFinite(runAtMs)) {
    return false;
  }

  const delayMs = runAtMs - Date.now();

  if (delayMs <= 0) {
    return false;
  }

  clearTaskTimer(taskConfig.id);

  const timer = setTimeout(() => {
    runTask(taskConfig, options).catch((error) => {
      logInferenceError(error, {
        stage: 'task_scheduled_run',
        taskId: taskConfig.id,
        fileName: taskConfig.fileName,
      });
    });
  }, delayMs);

  taskTimers.set(taskConfig.id, timer);
  return true;
}

async function runTask(taskConfig, options = {}) {
  if (runningTasks.has(taskConfig.id)) {
    logTaskEvent('task_skipped_already_running', {
      taskId: taskConfig.id,
      fileName: taskConfig.fileName,
    });
    return;
  }

  runningTasks.add(taskConfig.id);
  clearTaskTimer(taskConfig.id);

  const state = loadState();
  const taskState = state.tasks[taskConfig.id] || {};
  let scheduleConfig;

  try {
    scheduleConfig = parseSchedule(taskConfig.schedule);

    logTaskEvent('task_started', {
      taskId: taskConfig.id,
      fileName: taskConfig.fileName,
      schedule: taskConfig.schedule,
    });

    const execution = await executeTask(taskConfig, taskState);
    const output = execution.output || SILENCE_TOKEN;

    saveTaskState(taskConfig.id, (latestTaskState) => persistTaskResult(taskConfig, output, latestTaskState));

    logTaskEvent('task_finished', {
      taskId: taskConfig.id,
      fileName: taskConfig.fileName,
      output,
    });
    emitTaskResult(
      {
        taskId: taskConfig.id,
        fileName: taskConfig.fileName,
        output,
        steps: execution.steps,
      },
      options,
    );

    if (scheduleConfig.kind === 'once' || scheduleConfig.kind === 'delayed_once') {
      fs.unlinkSync(taskConfig.filePath);
      deleteTaskState(taskConfig.id);

      logTaskEvent('task_deleted_after_success', {
        taskId: taskConfig.id,
        fileName: taskConfig.fileName,
      });
      return;
    }

    scheduleNextRun(taskConfig, scheduleConfig, options);
  } catch (error) {
    logInferenceError(error, {
      stage: 'task_execution',
      taskId: taskConfig.id,
      fileName: taskConfig.fileName,
    });

    try {
      if (!scheduleConfig) {
        scheduleConfig = parseSchedule(taskConfig.schedule);
      }

      if (scheduleConfig.kind === 'interval') {
        scheduleNextRun(taskConfig, scheduleConfig, options);
      }
    } catch (_scheduleError) {
      // Ignore schedule parse errors here because the original error is already logged.
    }
  } finally {
    runningTasks.delete(taskConfig.id);
  }
}

async function registerTask(taskFilePath, options = runnerOptions) {
  const taskConfig = parseTaskFile(taskFilePath);
  const scheduleConfig = parseSchedule(taskConfig.schedule);

  if (scheduleConfig.kind === 'interval') {
    scheduleNextRun(taskConfig, scheduleConfig, options);
    logTaskEvent('task_interval_run_scheduled', {
      taskId: taskConfig.id,
      fileName: taskConfig.fileName,
      schedule: taskConfig.schedule,
      runAt: new Date(Date.now() + scheduleConfig.intervalMs).toISOString(),
    });
    return taskConfig;
  }

  if (scheduleConfig.kind !== 'delayed_once') {
    await runTask(taskConfig, options);
    return taskConfig;
  }

  const state = loadState();
  const taskState = state.tasks?.[taskConfig.id] || {};
  const delayedRunAtMs = getDelayedRunTimestamp(taskConfig, scheduleConfig, taskState);

  if (scheduleDelayedRun(taskConfig, delayedRunAtMs, options)) {
    logTaskEvent('task_delayed_run_scheduled', {
      taskId: taskConfig.id,
      fileName: taskConfig.fileName,
      schedule: taskConfig.schedule,
      delayedRunAt: new Date(delayedRunAtMs).toISOString(),
    });
    return taskConfig;
  }

  await runTask(taskConfig, options);
  return taskConfig;
}

function unregisterTask(taskId) {
  const deletedTask = deleteTaskFile(taskId);

  if (!deletedTask) {
    return null;
  }

  clearTaskTimer(deletedTask.id);
  deleteTaskState(deletedTask.id);

  logTaskEvent('task_deleted_by_tool', {
    taskId: deletedTask.id,
    fileName: deletedTask.fileName,
  });

  return deletedTask;
}

function cleanupStateForMissingTasks(taskFiles) {
  const state = loadState();
  const existingTaskIds = new Set(taskFiles.map((filePath) => path.basename(filePath, '.md')));
  let changed = false;

  for (const taskId of Object.keys(state.tasks || {})) {
    if (!existingTaskIds.has(taskId)) {
      delete state.tasks[taskId];
      clearTaskTimer(taskId);
      changed = true;
    }
  }

  if (changed) {
    saveState(state);
  }
}

async function startTaskRunner(options = {}) {
  runnerOptions = options;
  const taskFiles = listTaskFiles();
  cleanupStateForMissingTasks(taskFiles);

  if (!taskFiles.length) {
    logTaskEvent('task_runner_idle', {
      tasksDirectory: TASKS_DIRECTORY,
    });
    return;
  }

  const taskConfigs = taskFiles.map((filePath) => parseTaskFile(filePath));

  logTaskEvent('task_runner_started', {
    taskCount: taskConfigs.length,
    tasks: taskConfigs.map((taskConfig) => ({
      id: taskConfig.id,
      schedule: taskConfig.schedule,
    })),
  });

  await Promise.allSettled(taskFiles.map((taskFilePath) => registerTask(taskFilePath, options)));
}

async function runTaskFile(taskFilePath, options = {}) {
  runnerOptions = options;
  cleanupStateForMissingTasks(listTaskFiles());
  return registerTask(taskFilePath, options);
}

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  let taskFilePath = '';

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === '--task-file') {
      taskFilePath = String(args[index + 1] || '').trim();
      index += 1;
    }
  }

  return {
    taskFilePath,
  };
}

async function runAsStandaloneProcess() {
  const { taskFilePath } = parseCliArgs(process.argv.slice(2));

  const options = {
    async onTaskResult(taskResult) {
      const output = taskResult?.output?.trim();

      if (!output || output === SILENCE_TOKEN) {
        return;
      }

      await deliverConversationEntry({
        role: 'assistant',
        content: output,
      });
    },
  };

  if (taskFilePath) {
    await runTaskFile(taskFilePath, options);
    return;
  }

  await startTaskRunner(options);
}

module.exports = {
  registerTask,
  runTaskFile,
  startTaskRunner,
  unregisterTask,
};

if (require.main === module) {
  runAsStandaloneProcess().catch((error) => {
    logInferenceError(error, {
      stage: 'task_runner_cli',
    });
    process.exitCode = 1;
  });
}
