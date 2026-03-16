const fs = require('fs');
const path = require('path');
const { loadMarkdownConfig } = require('./markdown-config');
const { runInferenceSession, extractTextContent } = require('./openai');
const { logInferenceError, logTaskEvent } = require('./logger');

const TASKS_DIRECTORY = path.join(__dirname, 'tasks');
const STATE_FILE_PATH = path.join(TASKS_DIRECTORY, '.task-runner-state.json');
const MAX_HISTORY_ITEMS = 20;
const SILENCE_TOKEN = 'KEEP_SILENCE';

const taskFromStepsTool = require('./tools/task_from_steps');

const headingToField = new Map([
  ['schedule', 'schedule'],
  ['instructions', 'instructions'],
  ['history', 'history'],
  ['context', 'history'],
]);

const taskTimers = new Map();
const runningTasks = new Set();

function trimText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function ensureTasksDirectory() {
  if (!fs.existsSync(TASKS_DIRECTORY)) {
    fs.mkdirSync(TASKS_DIRECTORY, { recursive: true });
  }
}

function loadState() {
  ensureTasksDirectory();

  try {
    const rawState = fs.readFileSync(STATE_FILE_PATH, 'utf8');
    const parsedState = JSON.parse(rawState);
    return parsedState && typeof parsedState === 'object' ? parsedState : { tasks: {} };
  } catch (_error) {
    return { tasks: {} };
  }
}

function saveState(state) {
  ensureTasksDirectory();
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2));
}

function saveTaskState(taskId, updateTaskState) {
  const latestState = loadState();
  const currentTaskState = latestState.tasks?.[taskId] || {};
  const nextTaskState = updateTaskState(currentTaskState, latestState);

  latestState.tasks[taskId] = nextTaskState;
  saveState(latestState);

  return latestState;
}

function deleteTaskState(taskId) {
  const latestState = loadState();

  if (latestState.tasks && Object.prototype.hasOwnProperty.call(latestState.tasks, taskId)) {
    delete latestState.tasks[taskId];
    saveState(latestState);
  }

  return latestState;
}

function listTaskFiles() {
  ensureTasksDirectory();

  return fs
    .readdirSync(TASKS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(TASKS_DIRECTORY, entry.name))
    .sort();
}

function parseTaskFile(filePath) {
  const parsed = loadMarkdownConfig(filePath, {
    defaults: {
      schedule: 'ASAP',
      instructions: '',
      history: 'No',
    },
    headingToField,
  });

  const schedule = trimText(parsed.schedule);
  const instructions = trimText(parsed.instructions);
  const history = trimText(parsed.history);

  if (!instructions) {
    throw new Error(`Task file "${path.basename(filePath)}" does not contain instructions.`);
  }

  return {
    id: path.basename(filePath, '.md'),
    filePath,
    fileName: path.basename(filePath),
    schedule,
    instructions,
    history,
  };
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

  throw new Error(`Unsupported task schedule: "${scheduleValue}".`);
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
    `Task file: ${taskConfig.fileName}`,
    `Schedule: ${taskConfig.schedule}`,
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

function publishTaskResult(taskConfig, output, options = {}) {
  if (!output || output.includes(SILENCE_TOKEN)) {
    return;
  }

  options.onTaskResult?.({
    taskId: taskConfig.id,
    fileName: taskConfig.fileName,
    output,
    createdAt: new Date().toISOString(),
  });
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
      runInferenceSession,
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
  };
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
    publishTaskResult(taskConfig, output, options);

    if (scheduleConfig.kind === 'once') {
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

  await Promise.allSettled(taskConfigs.map((taskConfig) => runTask(taskConfig, options)));
}

module.exports = {
  startTaskRunner,
};
