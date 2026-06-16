# OS Core Forbidden Import Rules

## Rule 1: No Domain-Specific Nomenclature
Terms belonging to specific external integrations, products, or corporate organizations are strictly forbidden in OS core packages.
- **Forbidden list examples**: `ERP`, `GIOLITE`, `CRM`, `customer_reply`, `salesOrder`, `buyer`, `export`.
- **Allowed Generics**: `Domain`, `Source System`, `external_reply`, `client`, `record`.

## Rule 2: Strict Generic Boundaries
All new core primitives (such as simplememo evidence bridges, approval ledgers, UI control queues) must act only upon metadata constraints (e.g., `sourceTrust`, `approvalStatus`).

## Rule 3: Plugins own Context
If an integration requires semantic understanding of specific fields (e.g., HTV Pricing), it must be built as a plugin that passes pre-digested context into the generic AI OS layer.
