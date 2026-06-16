# AI P63: Generic Evidence Contract

## Context
The AI Orchestrator OS boundary requires that the core evidence ingestion mechanism be entirely agnostic to any specific domain (such as ERP, CRM, or EXAMPLE_DOMAIN concepts). The evidence ingested should act purely as generic knowledge vectors for the AI system.

## Generic Evidence Contract
The core system now relies on a standardized, generic interface for any incoming evidence:

- **sourceSystem**: The originating system identifier (e.g., `erp`, `crm`, `github`, `slack`).
- **sourceModule**: The specific sub-module within the source system (e.g., `sales`, `support`, `repo_X`).
- **sourceRef**: A unique identifier linking back to the exact source record.
- **provenance**: Details mapping the path the evidence took to reach the system.
- **trustBoundary**: Level of verification and reliability (`trusted`, `limited`, `untrusted`).
- **approvalStatus**: Identifies if a human has validated the data (`approved`, `published`, `draft`).
- **redaction**: Required for scrubbing sensitive entity data before processing.
- **snippet**: A brief string preview or reasoning representing the evidence.
- **idempotencyKey**: Ensures duplicate events are skipped or overwritten without side effects.
- **memoryLayer**: Target storage category (`episode`, `reflection`, `project_memory`).
- **domainTags**: Opaque string tags used for flexible routing, without baking the domain strictly into the OS.

Plugins (like the EXAMPLE_DOMAIN ERP Plugin) will map their domain-specific payload to this generic contract.
