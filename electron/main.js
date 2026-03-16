const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

app.commandLine.appendSwitch('no-sandbox');

function getCurrentTime() {
  return {
    iso: new Date().toISOString(),
    local: new Date().toLocaleString('ru-RU'),
  };
}

async function runInference(message) {
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

  const client = new OpenAI({ apiKey });

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

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 520,
    height: 560,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  ipcMain.handle('app:infer', async (_event, message) => {
    if (typeof message !== 'string' || !message.trim()) {
      throw new Error('Message is required');
    }

    return runInference(message.trim());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
