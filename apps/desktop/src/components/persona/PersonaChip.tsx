import { useState } from "react";
import type { CSSProperties } from "react";
import type { PermissionActor } from "@ai-orchestrator/protocol";
import { resolvePersonaIdentity } from "@/lib/personaIdentity";

/**
 * PersonaChip — 이름 있는 동료(페르소나)를 한 줄로 표시하는 공용 primitive.
 * 원형 아바타(초상화 or 이니셜) + 이름 + 역할 배지 + 상태점. 색상은 CSS 변수만
 * 사용하고, 상태점은 공유 keyframe 없이도 오늘 바로 보이도록 essential 시각(색·halo)을
 * 인라인 스타일로 준다. 상태는 색 하나로만 신호하지 않게 항상 접근성 라벨을 붙인다.
 */

export type PersonaChipSize = 16 | 20 | 24 | 32 | 40;

export type PersonaStatusTone = "idle" | "live" | "thinking" | "done" | "error" | "waiting";

export interface PersonaChipProps {
  personaName?: string;
  role?: string;
  name?: string;
  actor?: PermissionActor;
  size?: PersonaChipSize;
  statusTone?: PersonaStatusTone;
  statusLabel?: string;
  showRoleBadge?: boolean;
  showName?: boolean;
  className?: string;
}

/** 상태점 톤 → 색/halo/한국어 기본 라벨. 색은 CSS 변수만 사용. */
const STATUS_TONE_META: Record<PersonaStatusTone, { color: string; halo: boolean; label: string }> = {
  idle: { color: "var(--fg-muted)", halo: false, label: "유휴" },
  live: { color: "var(--accent)", halo: true, label: "진행 중" },
  thinking: { color: "var(--accent)", halo: true, label: "생각 중" },
  done: { color: "var(--accent)", halo: false, label: "완료" },
  error: { color: "var(--destructive)", halo: true, label: "오류" },
  waiting: { color: "var(--warning)", halo: false, label: "대기" },
};

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

function PersonaAvatar({
  portraitUrl,
  initials,
  displayName,
  size,
}: {
  portraitUrl?: string;
  initials: string;
  displayName: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const base: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 999,
    flex: "0 0 auto",
  };

  if (portraitUrl && !failed) {
    return (
      <img
        className="aol-persona-avatar"
        src={portraitUrl}
        alt={displayName}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        style={{ ...base, objectFit: "cover", display: "block" }}
      />
    );
  }

  return (
    <span
      className="aol-persona-avatar"
      aria-hidden="true"
      style={{
        ...base,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-2)",
        color: "var(--fg)",
        fontSize: Math.max(11, Math.round(size * 0.4)),
        fontWeight: 600,
        lineHeight: 1,
        border: "1px solid var(--border)",
      }}
    >
      {initials}
    </span>
  );
}

export function PersonaChip({
  personaName,
  role,
  name,
  actor,
  size = 24,
  statusTone,
  statusLabel,
  showRoleBadge = false,
  showName = true,
  className,
}: PersonaChipProps) {
  const identity = resolvePersonaIdentity({ personaName, role, name, actor });
  const tone = statusTone ? STATUS_TONE_META[statusTone] : null;
  const label = statusLabel ?? tone?.label;

  return (
    <span
      className={className ? `aol-persona-chip ${className}` : "aol-persona-chip"}
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <span style={{ position: "relative", display: "inline-flex", flex: "0 0 auto" }}>
        <PersonaAvatar
          portraitUrl={identity.portraitUrl}
          initials={identity.initials}
          displayName={identity.displayName}
          size={size}
        />
        {tone ? (
          <span
            className="aol-status-dot"
            data-tone={statusTone}
            aria-hidden="true"
            style={{
              position: "absolute",
              right: -1,
              bottom: -1,
              width: 8,
              height: 8,
              borderRadius: 999,
              background: tone.color,
              opacity: statusTone === "idle" ? 0.55 : 1,
              boxShadow: tone.halo ? "0 0 0 3px var(--accent-dim)" : undefined,
              border: "1px solid var(--surface)",
            }}
          />
        ) : null}
      </span>

      {showName ? (
        <span style={{ color: "var(--fg)", fontSize: 12, lineHeight: 1.2 }}>{identity.displayName}</span>
      ) : null}

      {showRoleBadge && identity.roleSlug ? (
        <span
          style={{
            fontSize: 11,
            color: "var(--fg-muted)",
            background: "var(--surface-2)",
            borderRadius: 999,
            padding: "1px 6px",
            lineHeight: 1.3,
          }}
        >
          {identity.roleSlug}
        </span>
      ) : null}

      {tone && label ? (
        <span data-tone-label={statusTone} title={label} style={VISUALLY_HIDDEN}>
          {label}
        </span>
      ) : null}
    </span>
  );
}

export interface PersonaAvatarStackProps {
  members: Array<{ personaName?: string; role?: string; name?: string }>;
  size?: PersonaChipSize;
  max?: number;
  className?: string;
}

export function PersonaAvatarStack({ members, size = 24, max = 4, className }: PersonaAvatarStackProps) {
  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;
  const identities = shown.map((member) => resolvePersonaIdentity(member));
  const names = members.map((member) => resolvePersonaIdentity(member).displayName);

  return (
    <span
      className={className ? `aol-persona-stack ${className}` : "aol-persona-stack"}
      role="group"
      aria-label={`구성원 ${members.length}명: ${names.join(", ")}`}
      style={{ display: "inline-flex", alignItems: "center" }}
    >
      {identities.map((identity, index) => (
        <span
          key={index}
          className="aol-persona-stack__item"
          style={{
            marginLeft: index === 0 ? 0 : -6,
            display: "inline-flex",
            borderRadius: 999,
            outline: "2px solid var(--surface)",
          }}
        >
          <PersonaAvatar
            portraitUrl={identity.portraitUrl}
            initials={identity.initials}
            displayName={identity.displayName}
            size={size}
          />
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="aol-persona-stack__more"
          aria-hidden="true"
          style={{
            marginLeft: -6,
            width: size,
            height: size,
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface-2)",
            color: "var(--fg-muted)",
            fontSize: 11,
            fontWeight: 600,
            border: "1px solid var(--border)",
          }}
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
