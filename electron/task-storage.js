const fs = require('fs');
const path = require('path');
const { loadMarkdownConfig } = require('./markdown-config');

const TASKS_DIRECTORY = path.join(__dirname, 'tasks');
const STATE_FILE_PATH = path.join(TASKS_DIRECTORY, '.task-runner-state.json');
const MAX_HISTORY_ITEMS = 20;

const headingToField = new Map([
  ['schedule', 'schedule'],
  ['instructions', 'instructions'],
  ['history', 'history'],
  ['context', 'history'],
]);

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

function buildHistoryValue(recentRunsForAnalysis) {
  if (
    typeof recentRunsForAnalysis === 'number' &&
    Number.isInteger(recentRunsForAnalysis) &&
    recentRunsForAnalysis > 0
  ) {
    return `Last ${recentRunsForAnalysis} messages`;
  }

  return 'No';
}

function slugifyTaskTitle(title) {
  const normalized = trimText(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || 'task';
}

function getNextTaskPrefix(existingFiles) {
  const prefixes = existingFiles
    .map((filePath) => path.basename(filePath))
    .map((fileName) => fileName.match(/^(\d+)-/))
    .map((match) => (match ? Number(match[1]) : null))
    .filter((value) => Number.isInteger(value));

  const nextPrefix = prefixes.length ? Math.max(...prefixes) + 1 : 1;
  return String(nextPrefix).padStart(2, '0');
}

function createTaskMarkdown({ schedule, instructions, history }) {
  return [
    '# Schedule',
    '',
    trimText(schedule) || 'ASAP',
    '',
    '# Instructions',
    '',
    trimText(instructions),
    '',
    '# History',
    '',
    trimText(history) || 'No',
    '',
  ].join('\n');
}

function createTaskFile({ title, schedule, instructions, recentRunsForAnalysis }) {
  const normalizedTitle = trimText(title);
  const normalizedInstructions = trimText(instructions);

  if (!normalizedTitle) {
    throw new Error('The "title" field is required.');
  }

  if (!normalizedInstructions) {
    throw new Error('The "instructions" field is required.');
  }

  ensureTasksDirectory();

  const existingFiles = listTaskFiles();
  const prefix = getNextTaskPrefix(existingFiles);
  const slug = slugifyTaskTitle(normalizedTitle);
  const fileName = `${prefix}-${slug}.md`;
  const filePath = path.join(TASKS_DIRECTORY, fileName);
  const history = buildHistoryValue(recentRunsForAnalysis);

  if (fs.existsSync(filePath)) {
    throw new Error(`Task file "${fileName}" already exists.`);
  }

  fs.writeFileSync(
    filePath,
    createTaskMarkdown({
      schedule: trimText(schedule) || 'ASAP',
      instructions: normalizedInstructions,
      history,
    }),
    'utf8',
  );

  return parseTaskFile(filePath);
}

function findTaskFile(taskId) {
  const normalizedTaskId = trimText(taskId);

  if (!normalizedTaskId) {
    return null;
  }

  return listTaskFiles().find((filePath) => {
    const fileName = path.basename(filePath);
    return fileName === normalizedTaskId || path.basename(filePath, '.md') === normalizedTaskId;
  }) || null;
}

function deleteTaskFile(taskId) {
  const filePath = findTaskFile(taskId);

  if (!filePath) {
    return null;
  }

  fs.unlinkSync(filePath);

  return {
    filePath,
    fileName: path.basename(filePath),
    id: path.basename(filePath, '.md'),
  };
}

module.exports = {
  MAX_HISTORY_ITEMS,
  STATE_FILE_PATH,
  TASKS_DIRECTORY,
  buildHistoryValue,
  createTaskFile,
  deleteTaskFile,
  deleteTaskState,
  ensureTasksDirectory,
  findTaskFile,
  listTaskFiles,
  loadState,
  parseTaskFile,
  saveState,
  saveTaskState,
  trimText,
};
