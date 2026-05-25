# SimpleMem Continuity Memory Architecture

## Status

This document records the accepted memory direction for AI Orchestrator Lab.

It corrects older wording that briefly treated the MacBook as the memory authority.

## Core Decision

```text
DGX-02 = main authoritative server
MacBook = primary work client with offline cache/outbox
Home PC = online client
Phone = thin approval/read/input client
SimpleMem = derived retrieval index on DGX-02
```

DGX-02 is the main system.

It owns authoritative Event Store, MemoryRecord, WorkItem, approvals, drafts, continuity storage, and server-side projections. MacBook is where the user usually works, but it is not the final source of truth. When MacBook is offline, it writes to local cache/outbox and syncs back to DGX-02 later.

## Authority Model

| Node | Role |
| --- | --- |
| DGX-02 | Authoritative shared server for Event Store, MemoryRecord, WorkItem, approvals, drafts, continuity storage, heavy model execution, projection, and SimpleMem index hosting |
| MacBook | Primary work client; keeps local cache/outbox for offline work and local model fallback |
| Home PC | Online client that normally talks to DGX-02 |
| Phone | Thin client for read, approval, stop, retry, and remote input |

Events created through MacBook while offline, Phone, Home PC, or external ingress are client-side pending inputs until synced to DGX-02.

## SimpleMem Placement

SimpleMem belongs on DGX-02.

Reason:

- DGX-02 is always on and is the main server.
- DGX-02 hosts heavy model, embedding, indexing, semantic retrieval, and memory search workloads.
- Phone and remote clients can retrieve memory through DGX-02.
- Tmux/swarm agents can use DGX-02 SimpleMem as a shared blackboard.

But SimpleMem is not the original memory database.

Original memory is:

```text
DGX-02 Event Store
  -> DGX-02 MemoryRecord projection
```

SimpleMem is derived:

```text
DGX-02 Event Store / MemoryRecord
  -> DGX SimpleMem index
  -> Phone / remote / tmux agent recall
```

Client input flow:

```text
MacBook offline / Phone / Home PC / external ingress
  -> pending client event
  -> DGX-02 sync
  -> optional Memory Curator promotion
  -> DGX SimpleMem index
```

## Memory Layers

### Core / Working Memory

Small JSON block injected into a worker agent prompt.

It contains only:

- current objective
- active file paths
- current constraints
- current blocker
- last handoff summary

Agents may update only their own working memory:

```text
memory_update_core(key, value)
```

This emits:

```text
memory.core.updated
```

### Archival Memory

Long-term facts, decisions, contracts, architecture rules, customer rules, and resolved bugs.

Original archival memory is represented by `MemoryRecord` on DGX-02.

Agents must not directly insert archival memory. They may only request a write:

```text
memory_request_archival_write(title, content, tags, sourceEventIds)
```

This emits:

```text
memory.archival_write.requested
```

Memory Curator or Orchestrator then promotes or rejects it:

```text
memory.archival_write.promoted
memory.archival_write.rejected
memory.index.requested
memory.index.completed
```

## Shared Blackboard

Tmux panes and specialized agents should not share raw transcripts.

They collaborate through Event-backed Archival Memory plus SimpleMem retrieval.

Example:

1. Backend Agent completes an API contract.
2. Backend Agent requests archival write with source event IDs.
3. Memory Curator promotes the candidate into an authoritative `MemoryRecord` on DGX-02.
4. DGX SimpleMem indexes that MemoryRecord.
5. Frontend Agent searches for the API contract and receives `EvidenceRef` entries.

Retrieved memory must be attached as evidence, not silently injected as untraceable hidden context.

## Memento Snapshot

Memento is not a full transcript dump and not merely a SimpleMem index dump.

It is a lightweight restorable memory state:

```ts
type MemoryMementoSnapshot = {
  sessionId: string;
  agentWorkingMemoryByAgentId: Record<string, AgentWorkingMemory>;
  activeMemoryRecordIds: string[];
  quarantinedMemoryRecordIds: string[];
  memoryContextPacketId?: string;
  simpleMemIndexRevision?: string;
  pendingClientEventIds: string[];
  sourceEventIds: string[];
  createdAt: string;
};
```

This lets a tmux swarm or remote session restart without token bloat.

## Indexing Rules

- Trusted and limited active/suggested memories may be indexed.
- Quarantined memories must not be indexed.
- Untrusted memories must not be retrieved unless explicitly activated.
- Client-created memory candidates remain pending until DGX-02 receives and processes them.
- Raw source documents must not be stored inside `EvidenceRef`.
- `EvidenceRef` stores only reference, summary, content hash, revision, and observed timestamp.

## Required Events

```text
memory.core.updated
memory.archival_write.requested
memory.archival_write.promoted
memory.archival_write.rejected
memory.index.requested
memory.index.completed
memory.index.skipped
memory.index.failed
memory.memento.snapshot.created
memory.client_input.pending
memory.client_input.synced
```

## Tmux Dispatch Safety

Do not execute `tmux send-keys` directly from memory tools or remote inputs.

Create a dispatch intent first:

```text
tmux.dispatch.requested
```

Actual dispatch requires:

- Event Store record
- redaction pass
- permission matrix pass
- approval policy pass

## Implementation Plan

### PR-M0: Authority Seed Correction

Keep the seed memory aligned with runtime topology:

```text
memory_seed_dgx02_authority
```

The memory states:

```text
DGX-02 is the authoritative server for Event Store, MemoryRecord, WorkItem, approvals, drafts, and continuity storage.
MacBook is the primary work client with a local cache/outbox for offline work, and syncs back to DGX-02 when online.
```

### PR-M1: Protocol Types

Add:

```text
AgentWorkingMemory
ArchivalMemoryIntent
MemoryMementoSnapshot
MemoryRetrievalSource
SimpleMemBackendMode
SimpleMemIndexStatus
SimpleMemAdapterConfig
SimpleMemIndexReport
```

### PR-M2: Mock SimpleMem Adapter

Add:

```text
apps/desktop/src/runtime/stage30SimpleMemAdapter.ts
apps/desktop/src/runtime/stage30SimpleMemAdapter.test.ts
```

Test requirements:

- quarantined memory is not indexed by default
- untrusted memory is skipped unless activated
- SimpleMem adapter never becomes original source
- existing `MemoryAPI` fallback still works

### PR-M3: UI and Events

Add memory index events and Memento panel indicators:

```text
index backend
index status
indexed count
skipped count
retrieval source
pending client input count
```

## Current Boundaries

Take now:

- DGX-02 authority
- MacBook client cache/outbox
- Core / Archival memory split
- Shared Blackboard
- Memento lightweight snapshot
- SimpleMem retrieval/index backend on DGX-02
- Event-backed memory promotion

Change before implementation:

- `memory_insert_archival` becomes `memory_request_archival_write`
- SimpleMem DB becomes derived index, not original DB
- Memento becomes working memory + MemoryRecord IDs + index revision + pending client event IDs
- `tmux send-keys` direct execution becomes `tmux.dispatch.requested`

Defer:

- multimodal SimpleMem
- SimpleMem cloud MCP as default
- direct agent archival writes
- EvolveMem automatic optimization

## One-Line Rule

DGX-02 is the main authority. SimpleMem lives there as a derived retrieval index over DGX-02 MemoryRecord.
