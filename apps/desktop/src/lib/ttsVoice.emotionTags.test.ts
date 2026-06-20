import { describe, expect, it } from "vitest";
import {
  EMOTION_TAGS,
  buildTtsRequest,
  parseEmotionTags,
  resolveCharacterVoice,
  type EmotionTag,
} from "./ttsVoice";

// Characterization tests (no behavior change) for EMOTION_TAGS, the only export
// in ttsVoice.ts the existing ttsVoice.test.ts leaves directly unasserted (it
// pins parseEmotionTags/selectTtsEngine/resolveCharacterVoice/buildTtsRequest/
// speak via hand-picked tags, but never iterates the canonical list). EMOTION_TAGS
// is the source of truth for the inline tags Orpheus supports; two sibling
// constructs must stay in lockstep with it and are module-private, so we pin them
// through their observable seams:
//   - the parse regex alternation in parseEmotionTags (every declared tag must be
//     extracted and stripped — a tag the regex forgot would silently pass through)
//   - the EMOTION_TAG_DESC map used by the OpenAI prosody path in buildTtsRequest
//     (every declared tag must yield a non-empty natural-language instruction —
//     a missing desc would .filter(Boolean) the tag out, dropping the emotion)

describe("EMOTION_TAGS", () => {
  it("is a frozen list of 8 distinct angle-bracketed emotion tags", () => {
    expect([...EMOTION_TAGS]).toEqual([
      "<laugh>",
      "<chuckle>",
      "<sigh>",
      "<gasp>",
      "<groan>",
      "<yawn>",
      "<cough>",
      "<sniffle>",
    ]);
    expect(new Set(EMOTION_TAGS).size).toBe(EMOTION_TAGS.length);
    for (const tag of EMOTION_TAGS) {
      expect(tag, tag).toMatch(/^<[a-z]+>$/);
    }
  });

  it("every declared tag is extracted and stripped by parseEmotionTags (regex parity)", () => {
    for (const tag of EMOTION_TAGS) {
      const parsed = parseEmotionTags(`잠깐 ${tag} 들어봐`);
      expect(parsed.tags, tag).toEqual([tag]);
      expect(parsed.cleanText, tag).toBe("잠깐 들어봐");
    }
  });

  it("every declared tag yields a non-empty OpenAI prosody instruction (desc parity)", () => {
    const voice = resolveCharacterVoice("direct");
    for (const tag of EMOTION_TAGS) {
      const request = buildTtsRequest(`안녕 ${tag} 반가워`, "openai", voice);
      expect(request, tag).not.toBeNull();
      expect(request!.instructions, tag).toBeTruthy();
      expect(request!.instructions!.endsWith("말하세요."), tag).toBe(true);
    }
  });

  it("typed EmotionTag is assignable from a list member (compile-level pin)", () => {
    const first: EmotionTag = EMOTION_TAGS[0];
    expect(first).toBe("<laugh>");
  });
});
