# Tauri Shell Placeholder

This directory is reserved for the future Tauri 2 desktop shell.

The current v0 desktop app still runs through Vite/React. Do not add real native command execution here until the protocol, Event Storage, redaction, permission matrix, and execution slot boundaries are stable.

Initial Tauri responsibilities:

- OS credential storage for provider API keys and OAuth sessions;
- local SQLite cache/outbox;
- Obsidian vault file writes under an approved root;
- narrow DGX-02 health/model calls;
- read-only tmux capture.

Blocked until later:

- raw `tmux send-keys`;
- destructive file moves/deletes;
- device reboot execution;
- raw secret export;
- Telegram/mobile direct terminal typing.

