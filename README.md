# Anna Operating System

Anna Operating System is a local desktop assistant built with Electron and React. It provides a chat window connected to an LLM through an OpenAI-compatible API and can use local tools to perform practical actions on the computer.

The current identity of the assistant is defined in [IDENTITY.md](IDENTITY.md): the assistant is named Anna, speaks English, and answers in a simple, concise style with a sense of humor. The application persists chat history locally and renders assistant responses as Markdown.
If `TELEGRAM_TOKEN` is defined in `.env`, the app also starts a Telegram bot bridge: incoming Telegram text messages are added to the main conversation and assistant replies are mirrored back to Telegram.

## Markdown configuration files

The application can extend the main assistant prompt with additional Markdown files:

- [IDENTITY.md](IDENTITY.md): defines the assistant identity, style, language, rules, and operating system context.
- [USER.md](USER.md): adds a user profile block to the system prompt. Use it for stable personal context such as name, location, family, preferences, and communication rules.
- [EMAIL.md](EMAIL.md): adds email-specific rules to the system prompt when IMAP is configured. Use it to describe which emails are important, how to summarize them, when to stay silent, and what reply format to follow.

## What the project already does

![ui](ui.png)


- Runs as an Electron desktop app with a React frontend.
- Shows a local chat interface with Markdown rendering for assistant replies.
- Persists conversation history locally and restores it on the next launch.
- Sends the conversation to a model exposed through an OpenAI-compatible API endpoint.
- Streams assistant output into the UI while the model is generating it.
- Loads the assistant identity and prompt rules from Markdown files such as `IDENTITY.md`, `USER.md`, and `EMAIL.md`.
- Supports model tool calling through the implementations in `electron/tools`.
- Includes a first-launch step-by-step wizard that lets the user configure assistant identity and `OPENAPI_BASE_URL`.
- Runs background tasks defined as Markdown files and executes them on schedules such as immediate, delayed, hourly, and daily.
- Pushes non-silent task results back into the main conversation automatically.
- Starts optional background hooks from `electron/hooks`, including email polling when IMAP is configured.
- Starts an optional Telegram bridge when `TELEGRAM_TOKEN` is configured, mirrors conversation messages, and replies to Telegram chats.

## Available tools

The current implementation in `electron/tools` supports these actions:

- `get_current_time`: return the current local time.
- `get_url_dump`: open an HTTP or HTTPS page in hidden Electron browser context and extract readable text with numbered references.
- `run_shell_command`: execute a shell command on the local machine and return stdout, stderr, and exit details.
- `manage_tasks`: list, create, and delete background tasks stored as Markdown files.
- `manage_email`: list folders, list message summaries, read a full message, delete a message, and send a message through Gmail IMAP/SMTP.
- `task_from_steps`: internal helper for multi-step task execution.

## Hooks

Run background logic on app startup (e.g. watchers, listeners). Implementation in `electron/hooks` supports these actions:

- `email` — watches inbox and creates tasks for new emails


## Background task system

The project includes a built-in task runner. Tasks are stored as Markdown files with sections such as `# Schedule`, `# Instructions`, and `# History`.

Supported schedules at the moment:

- `ASAP`
- `Immediately`
- `Now`
- `Daily`
- `Hourly`
- `Every minute`
- `Every N minutes`
- `Every N hours`
- `Every N days`
- `Once a minute`
- `Once an hour`
- `Once a day`
- `After N minutes`
- `After N hours`
- `After N days`

Task history can be disabled with `No` or configured as `Last N messages` so repeated runs can decide whether to stay silent. Silent task output is implemented through the exact token `KEEP_SILENCE`.

One-time tasks are deleted automatically after a successful run. Periodic tasks are rescheduled after each execution.

## Example user messages

These are examples of messages the current assistant should be able to handle because they map directly to the implemented tools and task flow:

- `What time is it now?`
- `Open https://example.com and give me a short summary.`
- `Check https://www.nytimes.com/ and tell me if there is news about Russia.`
- `Run "df -h" and tell me whether disk space is low.`
- `Run "free -m" and "ps axu", then suggest which apps use too much memory.`
- `List my current background tasks.`
- `Create a task to check disk space once a day and stay silent if nothing changed.`
- `Remind me after 1 minute to call my mom.`
- `Delete the task 04-reminder.`
- `List my email folders.`
- `Show unread emails from INBOX.`
- `Show the latest 10 emails from INBOX.`
- `Find emails in INBOX with query "from:alice newer_than:7d".`
- `Open the full email with UID 123 from INBOX.`
- `Delete the email with UID 123 from INBOX.`
- `Send an email to bob@example.com with cc to team@example.com.`

## Planned features

[TODO.md](TODO.md) shows features that are planned but not implemented yet.

## How to run Anna Operating System in development mode

1. Optional: install Ubuntu 22.04 in a virtual machine and do the next steps there.
2. Install Ollama. Set enviroment variable `OLLAMA_HOST=0.0.0.0:11434` before starting Ollama.
3. Launch Ollama and log in to the server to use cloud-backed models.
4. Run `ollama pull glm-5:cloud`.
5. Optional: run `ollama pull embeddinggemma` for future RAG embeddings support.
6. Run `git clone git@github.com:evgenyigumnov/anna-operating-system.git`.
7. Run `cd anna-operating-system`.
8. Create a `.env` file from `.env.example`.
9. Set `OPENAPI_BASE_URL=http://192.168.10.12:11434/v1`, replacing the IP with your host.
10. Optional: add `TELEGRAM_TOKEN=...` to enable Telegram integration for a bot created with BotFather.
11. Optional: configure Gmail email access with these `.env` variables:

```bash
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_IMAP_PORT=993
EMAIL_IMAP_SECURE=true
EMAIL_IMAP_USER=user@gmail.com
EMAIL_IMAP_PASSWORD=your_app_password

EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=465
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=user@gmail.com
EMAIL_SMTP_PASSWORD=your_app_password
```
12. Run `npm install --no-bin-links`.
13. Run `npm start`.


## Build instructions for Windows
```bash
npm run build:exe
```
