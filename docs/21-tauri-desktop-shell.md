# Tauri Desktop Shell Decision

## Status

Accepted for the production desktop shell.

AI Orchestrator Lab should ship as a cross-platform desktop app for Windows and macOS using:

- Tauri 2 as the native shell;
- the current Vite/React desktop app as the web UI;
- OS credential storage for provider secrets;
- SQLite for local cache, outbox, and offline replay;
- sidecar commands only behind the Permission Matrix.

Electron is not the default path unless Tauri blocks a critical native capability.

## Why

The app needs to run mainly on a MacBook, but also from the Windows home PC and phone. DGX-02 is the main authoritative server for Event Store, MemoryRecord, WorkItem, approvals, drafts, and continuity storage. MacBook is the primary work client. Clients should keep a local cache/outbox or thin projection, then sync back to DGX-02.

Tauri fits this shape because it gives the UI a small native shell while still allowing platform-specific integrations:

- macOS Keychain;
- Windows Credential Manager;
- local filesystem access for Obsidian export;
- SSH/tmux sidecar boundaries;
- future tray/watchdog integration;
- safer native command allowlists than a browser-only app.

## Data Authority

DGX-02 remains the source of truth for shared Event Storage, MemoryRecord, WorkItem, approvals, and drafts.

Client behavior:

- DGX-02: authoritative Event Store/MemoryRecord server, projection server, compute server, SimpleMem index host.
- MacBook: primary work client with local SQLite cache/outbox and local model fallback.
- Home PC: local cache/outbox exists, but normal operation assumes DGX-02 projection is online.
- Mobile: read, approve, stop, retry, and pending remote input only.

## Secret Handling

Provider profiles may be created in the desktop UI once and selected later, but raw secrets must not be stored in Event Storage.

Tauri responsibilities:

- store API keys and OAuth refresh/session tokens through OS credential storage;
- expose only secret references to React;
- redact command previews and event payloads before persistence;
- block raw secret viewing from mobile.

## Native Capabilities

The first Tauri integration should expose only narrow commands:

- read/write Obsidian markdown under the configured vault root;
- read local model registry metadata;
- call DGX-02 health/model endpoints;
- manage local cache/outbox;
- read-only tmux capture once terminal events are stable.

The following stay blocked until explicit implementation gates are passed:

- real `tmux send-keys`;
- destructive file operations;
- device reboot execution;
- direct Telegram/mobile terminal commands;
- raw secret export.

## Obsidian Default

The Windows default vault root is:

```text
F:/obsidian/ai-headquarter
```

The exporter should create session markdown under:

```text
F:/obsidian/ai-headquarter/AI-Orchestrator/projects/ai-orchestrator-lab/sessions/
```

The MacBook can later use a different vault root, but Event Storage artifacts should record which projection path was used.

## Reboot / Watchdog

DGX-01 and DGX-02 can both have reboot requests represented in the app, but reboot execution requires:

1. Event Storage reboot intent;
2. explicit approval;
3. watchdog armed before execution;
4. reconnect heartbeat after reboot;
5. minimum service checks.

DGX-02 minimum services:

- `ai-orchestrator-server`;
- Event Storage API;
- qwen36 vLLM route.

DGX-01 minimum services:

- SSH heartbeat;
- operator confirmation.

