# Memento MCP Structure Check

## Source Checked

- DCInside thread: https://gall.dcinside.com/mgallery/board/view/?id=thesingularity&no=1206711&s_type=search_subject_memo&s_keyword=%EB%A9%94%EB%A9%98%ED%86%A0&page=1
- Memento MCP repository: https://github.com/JinHo-von-Choi/memento-mcp

## What Memento Requires

Memento is not just a message log.

The important structure is:

- `remember`: store useful long-term fragments from work.
- `recall`: retrieve relevant memories for the current task.
- `memory_context`: package selected memories into the prompt context.
- `reflect`: find duplicates, contradictions, stale memories, and cleanup candidates.
- `stats`: show memory health.
- `create_relations`: link related fragments into a memory graph.
- `activate_memories`: explicitly mark selected memories as usable context.

The memory record needs more than text:

- layer: fragment, episode, reflection, project memory, user memory.
- scope: global, project, session.
- kind: preference, architecture, pattern, decision, context, workflow, relationship, learning.
- source and trust: desktop, legacy_telegram, mobile, api, agent plus trusted, limited, untrusted.
- activation state: inactive, suggested, active, quarantined.
- relation graph and reflection issues.

## Current Implementation Check

Implemented now:

- `packages/protocol` exports Memento-compatible memory structure:
  - `MemoryScope`
  - `MemoryKind`
  - `MemoryRelation`
  - `MemoryContextPacket`
  - `MemoryReflectionIssue`
  - `MemoryStats`
  - expanded `MemoryAPI`
- `apps/desktop/src/runtime/stage6Memory.ts` now creates:
  - seed project memories
  - recall trace
  - memory context packet
  - relation links
  - reflection issues
  - stats and health
  - activation/pin/forget transitions
- `apps/desktop/src/runtime/stage27MemoryApi.ts` provides a local `MemoryAPI` adapter boundary:
  - `remember`
  - `recall`
  - `memoryContext`
  - `reflect`
  - `stats`
  - `createRelations`
  - `activateMemories`
  - `pin`
  - `forget`
- The Memento panel now shows:
  - remember / recall / memory_context / reflect / stats / relations / activate coverage
  - active/blocked context counts
  - relation links
  - reflection issues
- Backup projection now includes memory context, relation links, stats, and reflection issues in Obsidian/Notion/Mobile artifacts.
  - activation button per memory record

## Important Limitation

This is still a local structural implementation.

It does not yet run a real Memento MCP server, Qdrant vector database, or embedding model.
The current retrieval is a deterministic local heuristic so the product can verify data flow, Event Storage mapping, trust isolation, and UI behavior before adding the real vector backend.

## Next Proper Implementation Step

When Event Storage persistence is stable, replace or complement the local adapter with real memory backends:

```text
MemoryAPI
  -> LocalHeuristicMemoryAdapter
  -> MementoMcpMemoryAdapter
  -> DgxVectorMemoryAdapter
```

Rules:

- Event Storage remains the source of truth for memory events.
- Memento MCP or vector DB is an index/projection, not the only copy.
- Untrusted provider and Telegram memories stay quarantined until explicitly activated.
- Reflection issues must be visible before automatic recall uses risky memories.
