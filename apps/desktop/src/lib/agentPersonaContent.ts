/// <reference types="vite/client" />

export type BundledAgentPersonaContent = {
  agentsMd?: string;
  soulMd?: string;
};

const personaMarkdownModules = import.meta.glob(
  "../../../../agents/*/{AGENTS,SOUL}.md",
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

const personaContentByDirectory: Record<string, BundledAgentPersonaContent> = (() => {
  const out: Record<string, BundledAgentPersonaContent> = {};

  for (const [path, body] of Object.entries(personaMarkdownModules)) {
    const match = path.match(/agents\/([^/]+)\/(AGENTS|SOUL)\.md$/);
    if (!match) continue;

    const directoryName = match[1]!;
    const fileName = match[2]!;
    out[directoryName] ??= {};

    if (fileName === "AGENTS") {
      out[directoryName].agentsMd = body;
    } else {
      out[directoryName].soulMd = body;
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
