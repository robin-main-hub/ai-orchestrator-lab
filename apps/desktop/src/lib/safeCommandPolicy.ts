/**
 * Safe-command allowlist for closed-loop "mode B" auto-approval.
 *
 * Mode A keeps a human in the loop for every dispatch. Mode B lets the loop
 * auto-approve a *narrow, vetted* set of read-only / verification commands
 * (run the tests, lint, typecheck) so a CodingPacket can be driven to green
 * without a human clicking approve on each step — while anything that mutates
 * the system, touches the network, or uses shell features still escalates.
 *
 * This is a security boundary, so it is DENY BY DEFAULT:
 *   - reject any shell metacharacter that enables chaining / redirection /
 *     command substitution (a single allowed prefix must not smuggle a second
 *     command), and any known-dangerous token;
 *   - then allow only commands whose normalized form matches an explicit
 *     allowlist of prefixes.
 *
 * The allowlist is overridable so an operator can widen/narrow it per setup —
 * it is the knob that governs how autonomous mode B is.
 */

export const DEFAULT_SAFE_COMMAND_PREFIXES: ReadonlyArray<string> = [
  "pnpm test",
  "pnpm -r test",
  "pnpm -r --if-present test",
  "pnpm lint",
  "pnpm typecheck",
  "pnpm build",
  "pnpm -r build",
  "pnpm -r --sort build",
  "npm test",
  "npm run test",
  "npm run lint",
  "yarn test",
  "vitest",
  "vitest run",
  "eslint",
  "tsc",
  "tsc --noEmit",
  "jest",
  "pytest",
  "cargo test",
  "go test",
  "git status",
  "git diff",
  "git log",
  "git show",
  "ls",
  "cat",
  "head",
  "tail",
  "grep",
  "rg",
  "pwd",
  "echo",
  "which",
  "node --version",
];

// Shell features that could chain a second command or expand into one, plus
// tokens that mutate the machine / reach the network. Any hit = not auto-safe.
const DANGEROUS_PATTERN =
  /[;&|<>`$(){}]|\n|\r|--force|-rf\b|\bsudo\b|\brm\b|\bmv\b|\bcp\b|\bdd\b|\bmkfs\b|\bchmod\b|\bchown\b|\bln\b|\bcurl\b|\bwget\b|\bnc\b|\bssh\b|\bscp\b|\brsync\b|\bkill\b|\bshutdown\b|\breboot\b|\binstall\b|\buninstall\b|\badd\b|\bpublish\b|\bgit\s+push\b|\bgit\s+reset\b|\bgit\s+clean\b|\bgit\s+checkout\b|\bgit\s+commit\b|\bgit\s+rebase\b/i;

export type SafeCommandVerdict = { allowed: boolean; reason: string };

export function isAutoApprovableCommand(
  command: string,
  options: { extraSafePrefixes?: ReadonlyArray<string>; safePrefixes?: ReadonlyArray<string> } = {},
): SafeCommandVerdict {
  const trimmed = (command ?? "").trim();
  if (!trimmed) {
    return { allowed: false, reason: "empty command" };
  }
  if (DANGEROUS_PATTERN.test(trimmed)) {
    return { allowed: false, reason: "command uses a shell feature or a disallowed/mutating token" };
  }

  const prefixes = options.safePrefixes ?? [...DEFAULT_SAFE_COMMAND_PREFIXES, ...(options.extraSafePrefixes ?? [])];
  const match = prefixes.find((prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `));
  if (match) {
    return { allowed: true, reason: `matches safe prefix "${match}"` };
  }
  return { allowed: false, reason: "not in the safe-command allowlist" };
}
