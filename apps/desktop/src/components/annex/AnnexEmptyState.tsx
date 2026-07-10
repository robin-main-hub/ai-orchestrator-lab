import type { ElementType } from "react";

export function AnnexEmptyState({
  icon: Icon,
  title,
  subtext,
}: {
  icon: ElementType;
  title: string;
  subtext?: string;
}) {
  return (
    <div className="annex-v2__empty">
      <Icon className="annex-v2__empty-icon size-8" aria-hidden="true" />
      <p className="annex-v2__empty-title">{title}</p>
      {subtext ? <p className="annex-v2__empty-subtext">{subtext}</p> : null}
    </div>
  );
}
