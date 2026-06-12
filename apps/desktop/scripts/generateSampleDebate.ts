/**
 * 실제 토론을 한 번 돌려 시드 샘플로 캡처한다.
 *
 *   pnpm --filter desktop exec vite-node scripts/generateSampleDebate.ts
 *
 * vite-node로 실행해야 하는 이유: 데스크톱 vite 설정의 워크스페이스 별칭,
 * persona 번들(import.meta.glob), `.env.local`의 오케스트레이터 토큰이 모두
 * 브라우저와 동일하게 동작해야 실제 앱과 같은 경로(dgx-02 프록시 → vLLM)로
 * 토론이 실행되기 때문. 결과는 src/seeds/sampleDebate.ts 로 기록된다.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runStage3DebateSession } from "../src/runtime/stage3Runtime";
import { seededAgentProfiles } from "../src/seeds/agents";
import { seededProviderProfiles } from "../src/seeds/providers";
import { initialConversationMessages, initialEventLog } from "../src/seeds/conversation";
import { runtimeSnapshot } from "../src/seeds/runtime";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 읽기 좋은 샘플을 위해 핵심 4역만 무대에 올린다.
const CAST = new Set(["agent_orchestrator", "agent_architect", "agent_reviewer", "agent_skeptic"]);

const vllm = seededProviderProfiles.find((profile) => profile.id === "provider_dgx02_vllm");
if (!vllm) {
  throw new Error("provider_dgx02_vllm seed not found");
}

const agents = seededAgentProfiles
  .filter((agent) => CAST.has(agent.id))
  .map((agent) => ({
    ...agent,
    enabled: true,
    providerProfileId: vllm.id,
    modelId: vllm.defaultModel ?? "qwen36-gio-lora-v5-prisma",
  }));

console.log(`[debate] cast: ${agents.map((agent) => `${agent.name}(${agent.role})`).join(", ")}`);
console.log(`[debate] provider: ${vllm.name} · ${vllm.baseUrl} · ${vllm.defaultModel}`);
console.log("[debate] running real stage3 debate...");
const startedAt = Date.now();

const session = await runStage3DebateSession({
  messages: initialConversationMessages,
  agents,
  providers: seededProviderProfiles,
  events: initialEventLog,
  runtime: runtimeSnapshot,
  perAgentTimeoutMs: 120_000,
});

session.runState = "live";

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
const utteranceCount = session.rounds.reduce((sum, round) => sum + round.utterances.length, 0);
console.log(`[debate] done in ${elapsed}s — rounds: ${session.rounds.length}, utterances: ${utteranceCount}`);
for (const round of session.rounds) {
  console.log(`  - ${round.title}: ${round.status}, ${round.utterances.length}발언`);
}

const outPath = path.resolve(__dirname, "../src/seeds/sampleDebate.ts");
const banner = `// 자동 생성 파일 — 직접 수정하지 말 것.
// 실제 dgx-02 vLLM(${vllm.defaultModel})으로 돌린 토론 캡처.
// 재생성: pnpm --filter desktop exec vite-node scripts/generateSampleDebate.ts
import type { Stage3DebateSession } from "../runtime/stage3Runtime";

export const sampleDebateSession: Stage3DebateSession = `;

writeFileSync(outPath, `${banner}${JSON.stringify(session, null, 2)};\n`, "utf8");
console.log(`[debate] sample written: ${outPath}`);
