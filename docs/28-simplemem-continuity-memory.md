# SimpleMem Continuity Memory Architecture

## Status

This document records the accepted memory direction for AI Orchestrator Lab.

It supersedes older wording that treated DGX-02 as the canonical memory authority.

## Core Decision

```text
MacBook = canonical work machine
DGX-02 = always-on continuity mirror + compute node + projection server + SimpleMem index host
Phone = stateless thin client
```

DGX-02 is not a temporary emergency fallback. It is the always-on mirror that lets the user continue work from phone, home PC, or remote sessions while the MacBook is unavailable.

However, DGX-02 must not become the canonical memory database.

## Authority Model

| Node | Role |
| --- | --- |
| MacBook | Owns canonical Event Store, WorkItem records, MemoryRecord records, approvals, and drafts |
| DGX-02 | Mirrors canonical data, hosts heavy models, serves projections, runs SimpleMem search/index, buffers remote continuity inputs |
| Home PC | Online client that normally talks to DGX-02 and can show the continuity projection |
| Phone | Thin client for read, approval, stop, retry, and remote input |

Events created through Phone/DGX while the MacBook is unavailable are `pending_remote_input` until the MacBook imports and accepts them.

## SimpleMem Placement

SimpleMem belongs on DGX-02.

Reason:

- DGX-02 is always on.
- DGX-02 can host embedding, indexing, semantic retrieval, and heavier memory search.
- Phone and remote clients can retrieve memory through DGX-02 even when MacBook is closed.
- Tmux/swarm agents can use DGX-02 SimpleMem as a shared blackboard.

But SimpleMem is a derived index, not the source of truth.

```text
MacBook Event Store
  -> canonical MemoryRecord projection
  -> DGX continuity mirror
  -> DGX SimpleMem index
  -> Phone / remote / tmux agent recall
```

Remote input flow:

```text
Phone or DGX remote input
  -> pending remote event
  -> optional provisional SimpleMem index
  -> MacBook reconnect
  -> authoritative import or rejection
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

Canonical archival memory is represented by `MemoryRecord`.

Agents must not directly insert canonical archival memory. They may only request a write:

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
3. Memory Curator promotes the candidate into a canonical `MemoryRecord`.
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
  pendingRemoteEventIds: string[];
  sourceEventIds: string[];
  createdAt: string;
};
```

This lets a tmux swarm or remote session restart without token bloat.

## Indexing Rules

- Trusted and limited active/suggested memories may be indexed.
- Quarantined memories must not be indexed.
- Untrusted memories must not be retrieved unless explicitly activated.
- Phone/DGX-created remote memory candidates remain provisional until MacBook import.
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
memory.remote_input.pending
memory.remote_input.imported
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

Update stale memory seed:

```text
memory_seed_dgx02_authority
-> memory_seed_macbook_authority
```

The new memory states:

```text
MacBook is the authoritative work machine and canonical source for Event Store and MemoryRecord.
DGX-02 is always-on continuity mirror, compute node, projection server, and SimpleMem index host.
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
- SimpleMem adapter never becomes canonical source
- existing `MemoryAPI` fallback still works

### PR-M3: UI and Events

Add memory index events and Memento panel indicators:

```text
index backend
index status
indexed count
skipped count
retrieval source
pending remote input count
```

## Current Boundaries

Take now:

- Core / Archival memory split
- Shared Blackboard
- Memento lightweight snapshot
- SimpleMem retrieval/index backend on DGX-02
- Event-backed memory promotion

Change before implementation:

- `memory_insert_archival` becomes `memory_request_archival_write`
- SimpleMem DB becomes derived index, not canonical DB
- Memento becomes working memory + MemoryRecord IDs + index revision + pending remote input IDs
- `tmux send-keys` direct execution becomes `tmux.dispatch.requested`

Defer:

- multimodal SimpleMem
- SimpleMem cloud MCP as default
- direct agent archival writes
- EvolveMem automatic optimization

## One-Line Rule

SimpleMem lives on DGX-02 because DGX-02 is the always-on continuity mirror, not because DGX-02 owns the truth.

The truth lives on the MacBook.
