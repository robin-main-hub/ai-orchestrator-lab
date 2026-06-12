/**
 * 실제 TTS 합성 백엔드 (P2-9, KIMI 브리프 / 서브컬처 축).
 *
 * ttsVoice.ts가 "어떤 엔진에 무엇을 보낼지"를 순수 함수로 결정하면, 이 모듈은
 * 그 TtsRequest를 실제 HTTP 호출로 실행한다. dgx-02의 Kokoro-FastAPI는
 * OpenAI 호환(`POST /v1/audio/speech`, model=kokoro)이라, 로컬·OpenAI 폴백을
 * 같은 요청 형태로 다룬다.
 *
 * 설계 원칙:
 *  - fetch / URL.createObjectURL을 주입 가능하게 두어 브라우저·라이브 서버 없이
 *    단위 테스트한다(순수 페이로드 빌더 + 팩토리).
 *  - Kokoro 서버에 없는 voice가 오면(404/4xx) 확인된 voice(af_bella)로 1회
 *    재시도한다 — voice id 불일치로 합성이 통째로 죽지 않도록.
 *  - Orpheus 엔진 요청인데 Orpheus 서버 미설치면 Kokoro 엔드포인트로 우회한다
 *    (감정 태그는 이미 buildTtsRequest에서 제거됨). 라우팅 단계의
 *    orpheusAvailable=false와 짝을 이루는 2차 안전망.
 */

import type { TtsEngine, TtsRequest, TtsSynthesizer } from "./ttsVoice";

/** OpenAI 호환 /v1/audio/speech 응답 오디오 포맷 */
export type TtsResponseFormat = "mp3" | "wav" | "opus" | "flac";

/** Kokoro 서버에 존재가 확인된 폴백 voice (health 검증된 기본값) */
export const CONFIRMED_KOKORO_FALLBACK_VOICE = "af_bella";

export type OpenAiSpeechBody = {
  model: string;
  input: string;
  voice: string;
  response_format: TtsResponseFormat;
  speed: number;
};

/**
 * TtsRequest → OpenAI 호환 speech 요청 바디. Kokoro-FastAPI와 OpenAI가 동일
 * 스키마를 쓰므로 엔진별 model id만 갈아끼운다.
 */
export function buildSpeechBody(
  request: TtsRequest,
  options: { model: string; responseFormat?: TtsResponseFormat; voiceOverride?: string },
): OpenAiSpeechBody {
  return {
    model: options.model,
    input: request.text,
    voice: options.voiceOverride ?? request.voice,
    response_format: options.responseFormat ?? "mp3",
    speed: request.speed,
  };
}

export type LocalTtsSynthesizerOptions = {
  /** Kokoro(및 호환) 로컬 서버 베이스 URL. 예: "http://dgx-02:8880" */
  localBaseUrl: string;
  /** Kokoro 서버에서 쓰는 model id (기본 "kokoro") */
  kokoroModel?: string;
  /** Orpheus 전용 서버 베이스 URL (없으면 Kokoro로 우회) */
  orpheusBaseUrl?: string;
  /** Orpheus model id (기본 "orpheus") */
  orpheusModel?: string;
  /** 응답 오디오 포맷 (기본 mp3) */
  responseFormat?: TtsResponseFormat;
  /** voice 4xx 시 재시도할 확인된 Kokoro voice (기본 af_bella) */
  fallbackKokoroVoice?: string;
  /** engine==="openai"일 때 위임할 합성기(미설정 시 에러) */
  openaiSynthesize?: TtsSynthesizer;
  /** 주입용 fetch (기본 전역 fetch) */
  fetchImpl?: typeof fetch;
  /** 주입용 object URL 생성기 (기본 URL.createObjectURL) */
  createObjectUrl?: (blob: Blob) => string;
  /** 요청 타임아웃(ms). 기본 20000 */
  timeoutMs?: number;
};

/** 로컬 서버에서 어떤 엔진을 어느 베이스/모델로 칠지 결정 */
function resolveTarget(
  engine: TtsEngine,
  opts: LocalTtsSynthesizerOptions,
): { baseUrl: string; model: string } | null {
  const kokoroModel = opts.kokoroModel ?? "kokoro";
  if (engine === "kokoro") return { baseUrl: opts.localBaseUrl, model: kokoroModel };
  if (engine === "orpheus") {
    if (opts.orpheusBaseUrl) return { baseUrl: opts.orpheusBaseUrl, model: opts.orpheusModel ?? "orpheus" };
    // Orpheus 미설치 → Kokoro로 우회
    return { baseUrl: opts.localBaseUrl, model: kokoroModel };
  }
  return null; // openai는 위임
}

async function postSpeech(
  baseUrl: string,
  body: OpenAiSpeechBody,
  fetchImpl: typeof fetch,
  createObjectUrl: (blob: Blob) => string,
  timeoutMs: number,
): Promise<{ audioUrl?: string; error?: string; status?: number }> {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/audio/speech`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { status: res.status, error: `TTS ${res.status}: ${detail.slice(0, 200)}` };
    }
    const blob = await res.blob();
    return { audioUrl: createObjectUrl(blob) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `TTS 요청 실패: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 로컬 우선 TtsSynthesizer를 만든다. Kokoro/Orpheus는 로컬 서버로, OpenAI 엔진은
 * 주입된 폴백 합성기로 보낸다. voice 4xx면 확인된 voice로 1회 재시도한다.
 */
export function createLocalTtsSynthesizer(options: LocalTtsSynthesizerOptions): TtsSynthesizer {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch);
  const createObjectUrl =
    options.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const responseFormat = options.responseFormat ?? "mp3";
  const fallbackVoice = options.fallbackKokoroVoice ?? CONFIRMED_KOKORO_FALLBACK_VOICE;
  const timeoutMs = options.timeoutMs ?? 20000;

  return async (request: TtsRequest) => {
    if (request.engine === "openai") {
      if (!options.openaiSynthesize) {
        return { error: "OpenAI 합성기가 설정되지 않았습니다(로컬 전용 모드)." };
      }
      return options.openaiSynthesize(request);
    }

    const target = resolveTarget(request.engine, options);
    if (!target) return { error: `알 수 없는 엔진: ${request.engine}` };

    const body = buildSpeechBody(request, { model: target.model, responseFormat });
    const first = await postSpeech(target.baseUrl, body, fetchImpl, createObjectUrl, timeoutMs);
    if (first.audioUrl) return { audioUrl: first.audioUrl };

    // voice 불일치(4xx)면 확인된 voice로 1회 재시도
    const isVoiceError =
      typeof first.status === "number" && first.status >= 400 && first.status < 500 && body.voice !== fallbackVoice;
    if (isVoiceError) {
      const retryBody = { ...body, voice: fallbackVoice };
      const retry = await postSpeech(target.baseUrl, retryBody, fetchImpl, createObjectUrl, timeoutMs);
      if (retry.audioUrl) return { audioUrl: retry.audioUrl };
      return { error: retry.error ?? first.error };
    }
    return { error: first.error };
  };
}
