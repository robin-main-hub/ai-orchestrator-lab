/**
 * Safe-command allowlist — now the single source of truth lives in
 * @ai-orchestrator/agents so the server can share the exact same policy
 * (a payload that is "auto-safe" on the desktop must be "auto-safe" on the
 * server, with no drift). This file re-exports it so existing desktop imports
 * (`./safeCommandPolicy`) keep working unchanged.
 *
 * See packages/agents/src/safeCommandPolicy.ts for the actual allowlist and the
 * deny-by-default rationale.
 */
export {
  DANGEROUS_PATTERN,
  DEFAULT_SAFE_COMMAND_PREFIXES,
  isAutoApprovableCommand,
  type SafeCommandVerdict,
} from "@ai-orchestrator/agents";
