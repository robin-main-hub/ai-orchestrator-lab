# AI P64: Plugin Boundary Refactor Report

## Overview
This refactoring aimed to enforce strict separation between the AI Orchestrator OS Core and domain-specific plugin concepts. As part of this, multiple instances of forbidden terms such as `EXAMPLE_DOMAIN`, `ERP`, and `customer` were decoupled from core structures.

## Core Adjustments
1. **SimpleMemo Package**:
   - Replaced explicit `ERP DB`, `ERP/CRM`, and `ERP bridge` references in `batchRemember.ts`, `adapter.ts`, and `evidenceBridge.ts` with generic names like `Source DB`, `domain bridge`, and `Domain evidence`.
2. **Server App**:
   - `evidenceIngest.ts` now uses `Domain Evidence Hub` and `source system` rather than `ERP Evidence Hub`. The source identifier has been abstracted to `generic_evidence`.
3. **Desktop App**:
   - Rewrote logic in `stage9Permission.ts` to scan for `external` instead of `customer`, and swapped the returned action to `external_reply`.
   - Updated presentation layers (`controlQueuePresentation.ts`, `permissionApprovalLedger.ts`) to label interactions as "외부 답변" (External Reply) rather than "고객 답변" (Customer Reply).
   - Test suites in `stage9Permission.test.ts` and `permissionApprovalLedger.test.ts` were aligned to assert `external_reply` functionality.
4. **Protocol Package**:
   - Updated `workflowTemplate.ts` to define the baseline templates using `Domain` and generic terminology instead of `EXAMPLE_DOMAIN`.
5. **Mobile App**:
   - Modified `seeds.ts` to reference `DOMAIN-WIKI` instead of `DOMAIN-WIKI`.

## Scripts Restructuring
- The initial `smokeIngest.ts` script was refactored and renamed to `smokeGenericEvidenceIngest.ts`.
- Removed the domain-specific demonstration script path from the public example surface; only neutral evidence-ingest smoke coverage should remain in-repo.

## Summary
The OS core successfully delegates domain logic to plugins while maintaining generic internal boundaries.
