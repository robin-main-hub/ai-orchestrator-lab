import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mobile.chatBackgroundDataUrl";

/**
 * Persists a user-uploaded chat background image as a data URL in localStorage,
 * and applies it to a CSS custom property (--chat-bg-image) on :root so any
 * surface that reads it (chat screen, settings preview) updates atomically.
 */
export function useBackgroundImage() {
  const [dataUrl, setDataUrl] = useState<string | undefined>(() => {
    if (typeof localStorage === "undefined") return undefined;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ?? undefined;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dataUrl) {
      root.style.setProperty("--chat-bg-image", `url("${dataUrl}")`);
    } else {
      root.style.setProperty("--chat-bg-image", "none");
    }
  }, [dataUrl]);

  const setFromFile = useCallback(async (file: File): Promise<void> => {
    const reader = new FileReader();
    const result = await new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const value = reader.result;
        if (typeof value === "string") resolve(value);
        else reject(new Error("FileReader returned non-string result"));
      };
      reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
      reader.readAsDataURL(file);
    });
    setDataUrl(result);
    try {
      localStorage.setItem(STORAGE_KEY, result);
    } catch (err) {
      console.warn("[mobile] failed to persist background image (quota?)", err);
    }
  }, []);

  const clear = useCallback(() => {
    setDataUrl(undefined);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn("[mobile] failed to clear background image", err);
    }
  }, []);

  return { dataUrl, setFromFile, clear };
}
