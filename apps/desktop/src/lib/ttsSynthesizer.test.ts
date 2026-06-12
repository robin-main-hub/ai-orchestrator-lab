import { describe, expect, it, vi } from "vitest";
import {
  buildSpeechBody,
  createLocalTtsSynthesizer,
  CONFIRMED_KOKORO_FALLBACK_VOICE,
} from "./ttsSynthesizer";
import { buildTtsRequest, resolveCharacterVoice, type TtsRequest } from "./ttsVoice";

const kokoroReq: TtsRequest = { engine: "kokoro", voice: "af_sky", text: "완료했습니다", speed: 1.05 };

function fakeAudioResponse(): Response {
  return {
    ok: true,
    status: 200,
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }),
    text: async () => "",
  } as unknown as Response;
}

function fakeErrorResponse(status: number, detail = "voice not found"): Response {
  return {
    ok: false,
    status,
    blob: async () => new Blob([]),
    text: async () => detail,
  } as unknown as Response;
}

describe("buildSpeechBody", () => {
  it("TtsRequest를 OpenAI 호환 speech 바디로 변환", () => {
    const body = buildSpeechBody(kokoroReq, { model: "kokoro" });
    expect(body).toEqual({
      model: "kokoro",
      input: "완료했습니다",
      voice: "af_sky",
      response_format: "mp3",
      speed: 1.05,
    });
  });
  it("voiceOverride와 responseFormat을 반영", () => {
    const body = buildSpeechBody(kokoroReq, { model: "kokoro", voiceOverride: "af_bella", responseFormat: "wav" });
    expect(body.voice).toBe("af_bella");
    expect(body.response_format).toBe("wav");
  });
});

describe("createLocalTtsSynthesizer — Kokoro 로컬 합성", () => {
  it("kokoro 요청을 /v1/audio/speech로 POST하고 blob URL을 반환", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => fakeAudioResponse());
    const createObjectUrl = vi.fn(() => "blob://audio-1");
    const synth = createLocalTtsSynthesizer({
      localBaseUrl: "http://dgx-02:8880",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      createObjectUrl,
    });
    const out = await synth(kokoroReq);
    expect(out.audioUrl).toBe("blob://audio-1");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://dgx-02:8880/v1/audio/speech");
    const body = JSON.parse(String((init as unknown as RequestInit).body));
    expect(body.model).toBe("kokoro");
    expect(body.voice).toBe("af_sky");
    expect(body.input).toBe("완료했습니다");
  });

  it("voice 4xx면 확인된 voice(af_bella)로 1회 재시도", async () => {
    const fetchImpl = vi
      .fn(async (_url: string, _init?: RequestInit) => fakeAudioResponse())
      .mockResolvedValueOnce(fakeErrorResponse(400))
      .mockResolvedValueOnce(fakeAudioResponse());
    const synth = createLocalTtsSynthesizer({
      localBaseUrl: "http://dgx-02:8880",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      createObjectUrl: () => "blob://retry",
    });
    const out = await synth(kokoroReq);
    expect(out.audioUrl).toBe("blob://retry");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String((fetchImpl.mock.calls[1]![1] as unknown as RequestInit).body));
    expect(retryBody.voice).toBe(CONFIRMED_KOKORO_FALLBACK_VOICE);
  });

  it("폴백 voice 자체가 4xx면 재시도 없이 에러", async () => {
    const fetchImpl = vi.fn(async () => fakeErrorResponse(400));
    const synth = createLocalTtsSynthesizer({
      localBaseUrl: "http://dgx-02:8880",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      createObjectUrl: () => "blob://x",
    });
    const out = await synth({ ...kokoroReq, voice: CONFIRMED_KOKORO_FALLBACK_VOICE });
    expect(out.audioUrl).toBeUndefined();
    expect(out.error).toContain("400");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("orpheus 엔진인데 Orpheus 서버 미설정이면 Kokoro 엔드포인트로 우회", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => fakeAudioResponse());
    const synth = createLocalTtsSynthesizer({
      localBaseUrl: "http://dgx-02:8880",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      createObjectUrl: () => "blob://orph",
    });
    const out = await synth({ engine: "orpheus", voice: "tara", text: "좋네", speed: 1 });
    expect(out.audioUrl).toBe("blob://orph");
    const body = JSON.parse(String((fetchImpl.mock.calls[0]![1] as unknown as RequestInit).body));
    expect(body.model).toBe("kokoro"); // 우회된 모델
  });

  it("orpheusBaseUrl이 있으면 Orpheus 서버로 보냄", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => fakeAudioResponse());
    const synth = createLocalTtsSynthesizer({
      localBaseUrl: "http://dgx-02:8880",
      orpheusBaseUrl: "http://dgx-02:8881",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      createObjectUrl: () => "blob://orph2",
    });
    await synth({ engine: "orpheus", voice: "tara", text: "좋네", speed: 1 });
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://dgx-02:8881/v1/audio/speech");
  });

  it("openai 엔진은 위임 합성기로, 미설정이면 에러", async () => {
    const openaiSynthesize = vi.fn(async () => ({ audioUrl: "blob://oa" }));
    const withOpenai = createLocalTtsSynthesizer({
      localBaseUrl: "http://dgx-02:8880",
      openaiSynthesize,
      fetchImpl: (async () => fakeAudioResponse()) as unknown as typeof fetch,
      createObjectUrl: () => "x",
    });
    const oaReq: TtsRequest = { engine: "openai", voice: "sage", text: "안녕", speed: 1 };
    expect((await withOpenai(oaReq)).audioUrl).toBe("blob://oa");
    expect(openaiSynthesize).toHaveBeenCalledOnce();

    const noOpenai = createLocalTtsSynthesizer({
      localBaseUrl: "http://dgx-02:8880",
      fetchImpl: (async () => fakeAudioResponse()) as unknown as typeof fetch,
      createObjectUrl: () => "x",
    });
    expect((await noOpenai(oaReq)).error).toContain("OpenAI");
  });

  it("실제 buildTtsRequest 출력과 연결 — calm 프리셋 발화", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => fakeAudioResponse());
    const synth = createLocalTtsSynthesizer({
      localBaseUrl: "http://dgx-02:8880",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      createObjectUrl: () => "blob://calm",
    });
    const voice = resolveCharacterVoice("calm");
    const req = buildTtsRequest("작업을 정리했습니다", "kokoro", voice)!;
    const out = await synth(req);
    expect(out.audioUrl).toBe("blob://calm");
    const body = JSON.parse(String((fetchImpl.mock.calls[0]![1] as unknown as RequestInit).body));
    expect(body.voice).toBe("af_bella");
  });
});
