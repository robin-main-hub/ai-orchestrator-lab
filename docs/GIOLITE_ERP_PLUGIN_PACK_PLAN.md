# GIOLITE ERP Plugin Pack Plan

## Objective
With the OS core completely agnostic of GIOLITE concepts, the GIOLITE logic will exist strictly as an isolated plugin pack.

## Execution Plan
1. **Plugin Architecture**: Establish a standard plugin directory (`plugins/giolite-erp`).
2. **Custom Templates**: Import `GIOLITE` business logic templates as custom `WorkflowTemplate` configurations at runtime rather than embedding them in `@ai-orchestrator/protocol`.
3. **ERP Evidence Ingestion**:
   - Create a webhook receiver that listens to the ERP DB.
   - Run translation logic locally inside the plugin pack to transform ERP evidence records into the OS Core Generic Evidence Contract.
4. **Persona Injections**: Load custom GIOLITE characters (e.g., `sales_ops` specifically mapped to GIOLITE workflows) via the `AgentConfigSource` overrides.
