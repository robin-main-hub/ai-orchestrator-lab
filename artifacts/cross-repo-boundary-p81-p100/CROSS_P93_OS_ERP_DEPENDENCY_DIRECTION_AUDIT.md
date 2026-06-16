# CROSS P93: OS-ERP Dependency Direction Audit

## Principle
OS Core must not depend on ERP/EXAMPLE_DOMAIN.
ERP is a domain application/plugin that exports data into the generic OS Evidence Ingress contract.

## Audit Findings
- **OS Main**: Does not import any Domain ERP repository concepts. No mention of `bpCode`, `severity`, or `actionType` exists in the core processing logic.
- **domain Export**: Domain ERP exports its data strictly according to the generic Evidence Contract, wrapping all domain-specific data inside `domainTags`.
- **Direction**: The dependency flows correctly. Domain ERP (Plugin) -> AI OS (Generic Host).

## Status
Clean dependency direction established and verified.
