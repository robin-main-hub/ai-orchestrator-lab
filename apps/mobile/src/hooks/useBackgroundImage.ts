import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "mobile.chatBackgroundDataUrl.soul.";
const ACTIVE_BG_VAR = "--chat-bg-image";
const ACTIVE_OVERLAY_VAR = "--chat-bg-overlay";
/**
 * Value the overlay var takes when a SOUL background is loaded. We
 * reference the active gradient defined in styles.css so the actual
 * shading values live in one place (CSS), not split between CSS + JS.
 */
const OVERLAY_VALUE_ACTIVE = "var(--chat-bg-overlay-active)";
const OVERLAY_VALUE_INACTIVE = "transparent";

/**
 * Persists a per-SOUL background image as a data URL in localStorage.
 *
 * Background is intentionally keyed on soulId (persona) rather than agentId
 * (role). A single SOUL can be embodied by several agents; what the user sees
 * is the persona, so the background should follow the persona. Switching
 * SOULs in chat re-applies the corresponding background atomically.
 */
export function useSoulBackground(activeSoulId: string | undefined) {
  const [dataUrl, setDataUrl] = useState<string | undefined>(() =>
    loadFromStorage(activeSoulId),
  );

  useEffect(() => {
    setDataUrl(loadFromStorage(activeSoulId));
  }, [activeSoulId]);

  useEffect(() => {
    const root = document.documentElement;
    if (dataUrl) {
      root.style.setProperty(ACTIVE_BG_VAR, `url("${dataUrl}")`);
      // 살짝 음영처리 — apply the shading gradient so the photo stays
      // visible but bubbles + composer don't get gobbled by vivid
      // colors / bright spots in the user's image.
      root.style.setProperty(ACTIVE_OVERLAY_VAR, OVERLAY_VALUE_ACTIVE);
    } else {
      root.style.setProperty(ACTIVE_BG_VAR, "none");
      // No image → no shading. var(--bg) already covers the chat area.
      root.style.setProperty(ACTIVE_OVERLAY_VAR, OVERLAY_VALUE_INACTIVE);
    }
  }, [dataUrl]);

  const setFromFile = useCallback(
    async (soulId: string, file: File): Promise<void> => {
      const result = await readAsDataUrl(file);
      try {
        localStorage.setItem(STORAGE_PREFIX + soulId, result);
      } catch (err) {
        console.warn("[mobile] failed to persist background (quota?)", err);
      }
      if (soulId === activeSoulId) setDataUrl(result);
    },
    [activeSoulId],
  );

  const clear = useCallback(
    (soulId: string) => {
      try {
        localStorage.removeItem(STORAGE_PREFIX + soulId);
      } catch (err) {
        console.warn("[mobile] failed to clear background", err);
      }
      if (soulId === activeSoulId) setDataUrl(undefined);
    },
    [activeSoulId],
  );

  return { dataUrl, setFromFile, clear };
}

/**
 * Lookup helper for non-active SOULs (e.g., listing all SOULs in the SOUL
 * tab with a thumbnail of each one's background).
 */
export function getSoulBackground(soulId: string): string | undefined {
  return loadFromStorage(soulId);
}

function loadFromStorage(soulId: string | undefined): string | undefined {
  if (!soulId || typeof localStorage === "undefined") return undefined;
  const stored = localStorage.getItem(STORAGE_PREFIX + soulId);
  return stored ?? undefined;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value === "string") resolve(value);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}
