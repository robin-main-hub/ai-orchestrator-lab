/**
 * 캐릭터 음성 재생 React 훅 (P2-9, KIMI 브리프 / 서브컬처 축).
 *
 * 순수 라우팅(ttsVoice) + HTTP 합성(ttsSynthesizer)을 묶어, 컴포넌트가
 * `speak(text)` 한 번으로 캐릭터 목소리를 듣게 한다. <audio> 재생/정리와
 * 합성기 메모이즈만 담당하고, 결정 로직은 전부 순수 모듈에 있다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speak as routeAndSpeak, type CharacterVoice } from "./ttsVoice";
import { createLocalTtsSynthesizer } from "./ttsSynthesizer";

export type UseTtsSpeakerOptions = {
  /** Kokoro 로컬 서버 베이스 URL (deriveKokoroBaseUrl 결과) */
  baseUrl: string;
  /** Orpheus 서버가 따로 있으면 지정 (없으면 Kokoro 우회) */
  orpheusBaseUrl?: string;
  /** 로컬 서버 헬스 (false면 OpenAI 폴백 — openaiSynthesize 필요) */
  localAvailable?: boolean;
  /** OpenAI 폴백 합성기 (선택) */
  openaiSynthesize?: Parameters<typeof createLocalTtsSynthesizer>[0]["openaiSynthesize"];
  /** Orpheus 가용 여부 (기본: orpheusBaseUrl 있으면 true) */
  orpheusAvailable?: boolean;
};

export type SpeakOptions = {
  voicePreset?: string;
  voiceOverride?: Partial<CharacterVoice>;
  priority?: "speed" | "quality" | "balanced";
};

export type TtsSpeakerHandle = {
  /** 텍스트를 캐릭터 목소리로 합성·재생 */
  speak: (text: string, options?: SpeakOptions) => Promise<void>;
  /** 현재 재생 중 발화 정지 */
  stop: () => void;
  /** 합성/재생 진행 중 여부 */
  speaking: boolean;
  /** 마지막 오류 메시지 */
  error: string | null;
};

export function useTtsSpeaker(options: UseTtsSpeakerOptions): TtsSpeakerHandle {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const synthesize = useMemo(
    () =>
      createLocalTtsSynthesizer({
        localBaseUrl: options.baseUrl,
        orpheusBaseUrl: options.orpheusBaseUrl,
        openaiSynthesize: options.openaiSynthesize,
      }),
    [options.baseUrl, options.orpheusBaseUrl, options.openaiSynthesize],
  );

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      try {
        URL.revokeObjectURL(urlRef.current);
      } catch {
        /* 무시 */
      }
      urlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setSpeaking(false);
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  const speak = useCallback(
    async (text: string, speakOptions: SpeakOptions = {}) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setError("읽을 내용이 없습니다.");
        return;
      }
      cleanup();
      setError(null);
      setSpeaking(true);
      try {
        const result = await routeAndSpeak(trimmed, {
          voicePreset: speakOptions.voicePreset,
          voiceOverride: speakOptions.voiceOverride,
          priority: speakOptions.priority,
          localAvailable: options.localAvailable,
          orpheusAvailable: options.orpheusAvailable ?? Boolean(options.orpheusBaseUrl),
          synthesize,
        });
        if (result.error || !result.audioUrl) {
          setError(result.error ?? "합성 결과가 비어 있습니다.");
          setSpeaking(false);
          return;
        }
        const audio = new Audio(result.audioUrl);
        audioRef.current = audio;
        urlRef.current = result.audioUrl;
        audio.onended = () => {
          setSpeaking(false);
          cleanup();
        };
        audio.onerror = () => {
          setError("오디오 재생 실패");
          setSpeaking(false);
          cleanup();
        };
        await audio.play();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setSpeaking(false);
        cleanup();
      }
    },
    [cleanup, options.localAvailable, options.orpheusAvailable, options.orpheusBaseUrl, synthesize],
  );

  return { speak, stop, speaking, error };
}
