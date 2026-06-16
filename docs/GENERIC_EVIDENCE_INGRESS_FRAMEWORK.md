# Generic Evidence Ingress Framework

The AI Orchestrator OS handles inbound data streams generically. We do not enforce the shape of source systems within the OS core. Instead, systems adapt their payloads to the **Generic Evidence Contract**.

## Implementation Details
1. **Source System Integrations**: Handled entirely through external hooks or plugins.
2. **Generic Evidence Payload**:
   - Requires explicit metadata mappings (`sourceSystem`, `idempotencyKey`).
   - Ensures memory is stored correctly (via `memoryLayer` and `domainTags`).
3. **Batch Remember Adapter**: Ingests the normalized payloads into SimpleMemo without understanding what generated them.

All future OS ingestion pathways must be built assuming zero knowledge of the connected app domains.
