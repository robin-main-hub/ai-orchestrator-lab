# SimpleMem Continuity Memory Architecture

## Status

This document records the accepted continuity memory direction for AI Orchestrator Lab.

It separates active work authority from continuity mirroring: MacBook owns operator decisions and offline outbox state, while DGX-02 mirrors continuity and hosts derived retrieval indexes.

## Core Decision

```text
MacBook = operator authority for active work and offline cache/outbox
DGX-02 = continuity mirror, sync server, heavy model host, and derived retrieval index host
Home PC = online client
Phone = thin approval/read/input client
SimpleMem = derived retrieval index over mirrored continuity records
```

MacBook is the active operator authority.

It owns live work decisions, local Event Store/MemoryRecord/WorkItem/approval/draft state, and the offline outbox while the user is working. DGX-02 mirrors that continuity when online, keeps durable shared projections, and hosts heavy model execution plus derived retrieval indexes.

## Authority Model

| Node | Role |
| --- | --- |
| MacBook | Operator authority for active work state, local decisions, offline cache/outbox, and local model fallback |
| DGX-02 | Continuity mirror and sync server for Event Store, MemoryRecord, WorkItem, approvals, drafts, heavy model execution, projection, and SimpleMem index hosting |
| Home PC | Online client that normally talks to DGX-02 |
| Phone | Thin client for read, approval, stop, retry, and remote input |

Events created through MacBook are active operator state. Phone, Home PC, and external ingress events are client-side pending inputs until accepted into MacBook work state and mirrored to DGX-02.

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
memory_seed_macbook_authority
```

The memory states:

```text
MacBook is the operator authority for active work state, local decisions, and offline continuity outbox.
DGX-02 is the continuity mirror and sync server for mirrored Event Store, MemoryRecord, WorkItem, approvals, drafts, and derived retrieval indexes.
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

- MacBook active work authority
- DGX-02 continuity mirror and sync server
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

MacBook owns active work authority; DGX-02 mirrors continuity and hosts derived SimpleMem retrieval indexes.
