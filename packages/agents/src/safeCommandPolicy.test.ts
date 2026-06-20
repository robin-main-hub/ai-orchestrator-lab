import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAFE_COMMAND_PREFIXES,
  DANGEROUS_PATTERN,
  isAutoApprovableCommand,
} from "./safeCommandPolicy";

// Characterization tests (no behavior change, pure, no I/O) for the mode-B
// auto-approval security boundary. isAutoApprovableCommand is 0-ref across the
// test tree, yet it is the deny-by-default gate that decides whether the loop
// may run a command without a human clicking approve — so its exact semantics
// are load-bearing. We pin the two-stage shape (dangerous-token gate runs BEFORE
// the allowlist, so a vetted prefix can never smuggle a chained second command,
// and widening the allowlist can never re-open the dangerous gate) and the
// space-bounded prefix match. Expected "allowed" cases derive from
// DEFAULT_SAFE_COMMAND_PREFIXES itself (self-consistency), never hardcoded.

describe("isAutoApprovableCommand — deny-by-default mode-B boundary", () => {
  it("blocks empty / whitespace-only commands", () => {
    for (const command of ["", "   ", "\t", "\n"]) {
      const verdict = isAutoApprovableCommand(command);
      expect(verdict.allowed).toBe(false);
    }
    // a truly empty (post-trim) command is reported as such
    expect(isAutoApprovableCommand("   ").reason).toBe("empty command");
  });

  it("allows every default safe prefix on its own, citing the first prefix it matches", () => {
    for (const prefix of DEFAULT_SAFE_COMMAND_PREFIXES) {
      // sanity: a bare default prefix must not itself trip the dangerous gate
      expect(DANGEROUS_PATTERN.test(prefix)).toBe(false);
      // .find() returns the first matching prefix, which for a few entries is an
      // earlier, shorter prefix — so derive the citation the same way the impl does
      const firstMatch = DEFAULT_SAFE_COMMAND_PREFIXES.find(
        (candidate) => prefix === candidate || prefix.startsWith(`${candidate} `),
      );
      const verdict = isAutoApprovableCommand(prefix);
      expect(verdict.allowed).toBe(true);
      expect(verdict.reason).toBe(`matches safe prefix "${firstMatch}"`);
    }
  });

  it("cites the first (shortest) matching prefix when a longer allowlisted prefix is shadowed", () => {
    // "vitest run" is shadowed by "vitest", "tsc --noEmit" by "tsc"
    expect(isAutoApprovableCommand("vitest run").reason).toBe('matches safe prefix "vitest"');
    expect(isAutoApprovableCommand("tsc --noEmit").reason).toBe('matches safe prefix "tsc"');
  });

  it("matches a prefix only at a space boundary (no partial-token match)", () => {
    // exact prefix + an argument is allowed...
    expect(isAutoApprovableCommand("pnpm test --filter web").allowed).toBe(true);
    // ...but a longer token that merely starts with the prefix text is not
    const verdict = isAutoApprovableCommand("pnpm testfoo");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("not in the safe-command allowlist");
  });

  it("runs the dangerous-token gate BEFORE the allowlist, so a safe prefix cannot smuggle a chained command", () => {
    const verdict = isAutoApprovableCommand("pnpm test; rm -rf /");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("command uses a shell feature or a disallowed/mutating token");
  });

  it("blocks shell metacharacters and mutating/network tokens even when otherwise allowlisted", () => {
    const blocked = [
      "pnpm test && echo done", // chaining
      "cat file | grep x", // pipe
      "echo $(whoami)", // command substitution
      "ls > out.txt", // redirection
      "git push origin main", // mutating git
      "git commit -m x", // mutating git
      "sudo rm file", // privileged + rm
      "curl http://evil", // network
      "node --version --force", // force flag
    ];
    for (const command of blocked) {
      const verdict = isAutoApprovableCommand(command);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBe("command uses a shell feature or a disallowed/mutating token");
    }
  });

  it("rejects an unknown but otherwise-clean command as not on the allowlist", () => {
    const verdict = isAutoApprovableCommand("make release");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("not in the safe-command allowlist");
  });
});

describe("isAutoApprovableCommand — allowlist override knobs", () => {
  it("extends the defaults with extraSafePrefixes (a clean extra prefix becomes allowed)", () => {
    expect(isAutoApprovableCommand("deno test").allowed).toBe(false);
    const verdict = isAutoApprovableCommand("deno test", { extraSafePrefixes: ["deno test"] });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe('matches safe prefix "deno test"');
    // defaults still apply alongside the extra entry
    expect(isAutoApprovableCommand("pnpm test", { extraSafePrefixes: ["deno test"] }).allowed).toBe(true);
  });

  it("cannot re-open the dangerous gate by adding a dangerous entry to the allowlist", () => {
    const verdict = isAutoApprovableCommand("git push", { extraSafePrefixes: ["git push"] });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("command uses a shell feature or a disallowed/mutating token");
  });

  it("replaces the defaults entirely when safePrefixes is supplied", () => {
    // a default is no longer honored under a replacement allowlist...
    expect(isAutoApprovableCommand("pnpm test", { safePrefixes: ["only this"] }).allowed).toBe(false);
    // ...and only the replacement set is honored
    const verdict = isAutoApprovableCommand("only this", { safePrefixes: ["only this"] });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe('matches safe prefix "only this"');
  });
});

// The cases above pin the two-stage shape and a representative set of blocked
// tokens, but leave several DANGEROUS_PATTERN edges unpinned: the rest of the
// shell-metacharacter char class ([;&|<>`$(){}] — only ; & | > $( were shown),
// newline/CR *mid-command* injection (distinct from the whitespace-only "empty"
// case, where \n is trimmed away before the gate), the regex's /i flag (mutating
// tokens blocked regardless of case), the \s+ in git\s+push (tab/multi-space can
// not slip a mutating git through), and the \b word-boundary precision (the gate
// is token-level, so a benign word that merely *contains* a dangerous substring
// is not falsely blocked, while the standalone token is). Pin them — each is an
// injection-vector the auto-approve boundary must hold. Reason strings are the
// impl's own constants (self-consistent), not invented.
const SHELL_FEATURE_REASON = "command uses a shell feature or a disallowed/mutating token";

describe("isAutoApprovableCommand — metachar completeness, multiline & case-insensitive token gate", () => {
  it("blocks every remaining shell metacharacter in the char class", () => {
    // < redirection-in, backtick substitution, {}/() expansion/grouping — the
    // class members not already exercised by the earlier blocked[] list.
    const metachar = [
      "echo <in.txt", // < redirection in
      "echo `whoami`", // backtick command substitution
      "echo {a,b}", // brace expansion
      "echo (sub)", // subshell grouping parens
    ];
    for (const command of metachar) {
      const verdict = isAutoApprovableCommand(command);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBe(SHELL_FEATURE_REASON);
    }
  });

  it("blocks newline/CR mid-command (multi-line smuggle), unlike a whitespace-only empty command", () => {
    // A newline *inside* an otherwise-allowlisted command is a chaining vector and
    // is caught by the dangerous gate (not the empty-command branch).
    const nl = isAutoApprovableCommand("pnpm test\nrm -rf /");
    expect(nl.allowed).toBe(false);
    expect(nl.reason).toBe(SHELL_FEATURE_REASON);

    const cr = isAutoApprovableCommand("pnpm test\rmv a b");
    expect(cr.allowed).toBe(false);
    expect(cr.reason).toBe(SHELL_FEATURE_REASON);

    // contrast: a command that is ONLY a newline trims to empty → different reason
    expect(isAutoApprovableCommand("\n").reason).toBe("empty command");
  });

  it("blocks mutating tokens regardless of case (the /i flag)", () => {
    for (const command of ["SUDO ls", "RM file", "GIT PUSH origin main", "Curl http://x"]) {
      const verdict = isAutoApprovableCommand(command);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBe(SHELL_FEATURE_REASON);
    }
  });

  it("blocks git push even with tab/multiple spaces between git and push (\\s+)", () => {
    for (const command of ["git  push origin", "git\tpush origin"]) {
      const verdict = isAutoApprovableCommand(command);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBe(SHELL_FEATURE_REASON);
    }
  });

  it("is token-level, not substring: a benign word containing a dangerous substring is allowed", () => {
    // "alarm" contains "rm" but not at word boundaries, so the \brm\b token rule
    // does not fire; the command still passes only because "echo" is allowlisted.
    const safeWord = isAutoApprovableCommand("echo alarm");
    expect(safeWord.allowed).toBe(true);
    expect(safeWord.reason).toBe('matches safe prefix "echo"');
    // the standalone token, by contrast, IS blocked
    expect(isAutoApprovableCommand("echo rm").reason).toBe(SHELL_FEATURE_REASON);
  });
});
