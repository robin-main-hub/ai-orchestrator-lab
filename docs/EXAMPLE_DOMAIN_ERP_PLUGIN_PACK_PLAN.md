# EXAMPLE_DOMAIN ERP Plugin Pack Plan

## Objective
With the OS core completely agnostic of EXAMPLE_DOMAIN concepts, the EXAMPLE_DOMAIN logic will exist strictly as an isolated plugin pack.

## Execution Plan
1. **Plugin Architecture**: Establish a standard plugin directory (`plugins/example-domain-erp`).
2. **Custom Templates**: Import `EXAMPLE_DOMAIN` business logic templates as custom `WorkflowTemplate` configurations at runtime rather than embedding them in `@ai-orchestrator/protocol`.
3. **ERP Evidence Ingestion**:
   - Create a webhook receiver that listens to the ERP DB.
   - Run translation logic locally inside the plugin pack to transform ERP evidence records into the OS Core Generic Evidence Contract.
4. **Persona Injections**: Load custom EXAMPLE_DOMAIN characters (e.g., `sales_ops` specifically mapped to EXAMPLE_DOMAIN workflows) via the `AgentConfigSource` overrides.
