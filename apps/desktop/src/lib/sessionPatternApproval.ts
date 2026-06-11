import type { ApprovalDecisionOutcome } from "./closedLoopRuntime";
import { DANGEROUS_PATTERN } from "./safeCommandPolicy";

/**
 * Session-scoped pattern approval (item 10): after a human approves a
 * command once, they can grant "allow this command family for the session".
 * Subsequent commands matching an approved prefix are granted server-side
 * (audit trail intact) without another human click.
 *
 * Safety: prefix grants never override the dangerous-command deny list —
 * `git push --force` stays human-gated even if "git push" was approved.
 */

/** common launchers where the first token alone is too broad to be a pattern */
const TWO_TOKEN_RUNNERS = new Set([
  "git", "pnpm", "npm", "npx", "yarn", "node", "python", "python3", "pip",
  "cargo", "go", "docker", "kubectl", "make", "tsc", "corepack",
]);

export function extractCommandPrefix(command: string): string {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  const first = tokens[0]!;
  if (TWO_TOKEN_RUNNERS.has(first) && tokens.length > 1 && !tokens[1]!.startsWith("-")) {
    return `${first} ${tokens[1]}`;
  }
  return first;
}

export function matchesApprovedPrefix(command: string, prefixes: ReadonlyArray<string>): boolean {
  const normalized = command.trim();
  if (!normalized) return false;
  if (DANGEROUS_PATTERN.test(normalized)) return false;
  return prefixes.some((prefix) => {
    const p = prefix.trim();
    if (!p) return false;
    return normalized === p || normalized.startsWith(`${p} `);
  });
}

/**
 * Wraps a base approval strategy (typically human polling). When the command
 * matches a session-approved prefix the grant callback records the approval
 * server-side and the dispatch is approved immediately; otherwise — or when
 * the grant fails — the decision falls through to the base strategy.
 */
export function createPatternApprovalStrategy(deps: {
  base: (sourceItemId: string, context: { command: string }) => Promise<ApprovalDecisionOutcome>;
  getApprovedPrefixes: () => ReadonlyArray<string>;
  /** record the auto-grant on the server (e.g. grantDgxApproval). Resolves true on success. */
  grant: (sourceItemId: string, context: { command: string; prefix: string }) => Promise<boolean>;
  logger?: (message: string) => void;
}): (sourceItemId: string, context: { command: string }) => Promise<ApprovalDecisionOutcome> {
  const logger = deps.logger ?? (() => {});
  return async (sourceItemId, context) => {
    const prefixes = deps.getApprovedPrefixes();
    if (!matchesApprovedPrefix(context.command, prefixes)) {
      return deps.base(sourceItemId, context);
    }
    const prefix = prefixes.find(
      (p) => context.command.trim() === p.trim() || context.command.trim().startsWith(`${p.trim()} `),
    )!;
    try {
      const granted = await deps.grant(sourceItemId, { command: context.command, prefix });
      if (granted) {
        logger(`pattern approval: "${context.command}" auto-approved (prefix "${prefix}")`);
        return "approved";
      }
    } catch (error) {
      logger(`pattern approval: grant failed (${error instanceof Error ? error.message : String(error)})`);
    }
    return deps.base(sourceItemId, context);
  };
}
