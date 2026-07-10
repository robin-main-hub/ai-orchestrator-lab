import { formatAnnexActorLabel } from "./annexData";

function initialsFrom(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0] ?? "").charAt(0) + (parts[1] ?? "").charAt(0)).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function AnnexRosterItem({ name, role }: { name: string; role: string }) {
  return (
    <div className="annex-v2__roster-item">
      <span className="annex-v2__avatar" aria-hidden="true">
        {initialsFrom(name)}
      </span>
      <span className="annex-v2__roster-text">
        <span className="annex-v2__roster-name">{name}</span>
        <span className="annex-v2__roster-role">{formatAnnexActorLabel(role)}</span>
      </span>
    </div>
  );
}
