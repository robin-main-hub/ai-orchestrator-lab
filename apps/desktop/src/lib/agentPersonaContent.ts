/// <reference types="vite/client" />

export type BundledAgentPersonaContent = {
  agentsMd?: string;
  identityMd?: string;
  soulMd?: string;
  userMd?: string;
};

const personaMarkdownModules = {
  ...import.meta.glob("../../../../agents/*/{AGENTS,IDENTITY,SOUL,USER}.md", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
  ...import.meta.glob("../../../../agents/SAFETY.md", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
} as Record<string, string>;

let bundledSafetyMd: string | undefined;

const personaContentByDirectory: Record<string, BundledAgentPersonaContent> = (() => {
  const out: Record<string, BundledAgentPersonaContent> = {};

  for (const [path, body] of Object.entries(personaMarkdownModules)) {
    if (/agents\/SAFETY\.md$/.test(path)) {
      bundledSafetyMd = body;
      continue;
    }

    const match = path.match(/agents\/([^/]+)\/(AGENTS|IDENTITY|SOUL|USER)\.md$/);
    if (!match) continue;

    const directoryName = match[1]!;
    const fileName = match[2]!;
    out[directoryName] ??= {};

    if (fileName === "AGENTS") {
      out[directoryName].agentsMd = body;
    } else if (fileName === "IDENTITY") {
      out[directoryName].identityMd = body;
    } else if (fileName === "SOUL") {
      out[directoryName].soulMd = body;
    } else {
      out[directoryName].userMd = body;
    }
  }

  return out;
})();

export function getBundledAgentPersonaContent(directoryName: string | undefined): BundledAgentPersonaContent | undefined {
  if (!directoryName) return undefined;
  return personaContentByDirectory[directoryName];
}

export function getBundledAgentPersonaContentByPath(path: string | undefined): string | undefined {
  if (!path) return undefined;

  const match = path.match(/agents\/([^/]+)\/(AGENTS|SOUL)\.md$/);
  if (!match) return undefined;

  const content = getBundledAgentPersonaContent(match[1]);
  return match[2] === "AGENTS" ? content?.agentsMd : content?.soulMd;
}

export function listBundledAgentPersonaContent(): Readonly<Record<string, BundledAgentPersonaContent>> {
  return personaContentByDirectory;
}

export function getBundledAgentSafetyContent() {
  return bundledSafetyMd;
}
