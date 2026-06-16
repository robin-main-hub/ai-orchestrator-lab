# chore(os): enforce generic evidence plugin boundary

## Objective
Enforce the boundary separation between the AI Orchestrator OS Core and domain-specific applications (e.g. EXAMPLE_DOMAIN ERP). The OS core must not depend on ERP concepts.

## Changes
- **Generic Evidence Ingress Framework**: Replaced all mentions of ERP, EXAMPLE_DOMAIN, customer, sales, sample, and quotation with generic contracts (e.g. `external_reply`, `EvidenceIngressResult`, `Domain bridge`).
- **Domain Independence**: OS core logic now exclusively uses `sourceRef`, `entityRef`, `evidenceType`, `trustBoundary`, and `approvalStatus`. Domain-specific data is accepted only via `domainTags` metadata arrays.
- **Documentation**: Added architecture boundary docs (`GENERIC_EVIDENCE_INGRESS_FRAMEWORK.md`, `EXAMPLE_DOMAIN_ERP_PLUGIN_PACK_PLAN.md`, `OS_CORE_FORBIDDEN_IMPORT_RULES.md`, `NEXT_100_TASKS_OS_PLUGIN_SYSTEM.md`) establishing the boundary principles.
- **Plugin Direction**: Established that Domain plugins (like domain) map to the OS generic contract, not the other way around.

## Rollback Notes
If any plugins break, ensure they have updated their export scripts to the new generic `domainTags` structure.

## Verification
- Forbidden term scan clean (all matches resolved or categorized as allowed domain plugins/fixtures).
- Full OS test suite passed (1879/1879 tests).
- Typecheck and Build passed.
