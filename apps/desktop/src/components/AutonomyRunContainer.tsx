import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { loadPersona, type LoadedPersona } from "@ai-orchestrator/agents";
import type { CodingPacket, EventEnvelope, TerminalHostKind } from "@ai-orchestrator/protocol";
import { runAutonomousPersonaTask } from "../lib/autonomousRun";
import { createAutonomyRunEvents, type AutonomyRunEventContext } from "../lib/autonomyRunEvents";
import { projectAutonomyRunHistory } from "../lib/autonomyRunHistory";
import { rosterFromRegistry } from "../lib/autonomyRoster";
import { createAutonomyRunMemoryCandidate } from "../lib/autonomyRunMemory";
import type { DebateDecisionReadiness } from "../lib/debateDecisionReadiness";
import { evaluateExecutionHandoffGate } from "../lib/executionHandoffGate";
import type { MemoryCuratorCandidate } from "../lib/memoryCuratorApproval";
import type { SummonRegistry } from "../lib/personaSummon";
import {
  buildAutonomyRunInput,
  DEFAULT_AUTONOMY_FORM,
  headerOnlyPersona,
  isRunnable,
  type AutonomyRunForm,
} from "../lib/autonomyRunForm";
import { codingPacketToAutonomyForm } from "../lib/codingPacketToAutonomyForm";
import { approvalWaitNoteFromLog, autonomyRunStore, resolveInitialAutonomyForm } from "../lib/autonomyRunStore";
import { stepRowFromReduce, type AutonomyStepRow } from "../lib/autonomyTimeline";
import { bundledPersonaNames, personaFileSource } from "../lib/personaBundleSource";
import { personaAvatars, personaSprites } from "../lib/personaAvatarSource";
import { DEFAULT_HERMES_RESET_COMMAND, resolvePersonaAgentSet } from "../lib/personaAgentSet";
import { acquireHermesSlot } from "../lib/hermesSlotPool";
import { loadHermesPool, saveHermesPool } from "../lib/hermesPoolStore";
import { classifyExpression } from "../lib/expressionClassifier";
import { ExpressionStateMachine } from "../lib/expressionStateMachine";
import type { PersonaTaskOutcome } from "../lib/personaTaskRunner";
import { useTtsSpeaker } from "../lib/useTtsSpeaker";
import { deriveKokoroBaseUrl, voicePresetForRole } from "../lib/ttsConfig";
import { buildRunSpeechText } from "../lib/autonomyRunSpeech";
import { AutonomyRunPanel } from "./AutonomyRunPanel";

async function loadPersonaOrHeader(personaName: string): Promise<LoadedPersona> {
  try {
    return await loadPersona(personaName, "soul_plus_agents", personaFileSource);
  } catch {
    // Persona has no bundled SOUL.md/AGENTS.md — fall back to a header-only identity.
    return headerOnlyPersona(personaName);
  }
}

/**
 * Stateful container that owns the Autonomy Run form and the run lifecycle, and
 * delegates rendering to the (tested) presentational panel. Kept thin: all the
 * input-assembly logic lives in `autonomyRunForm`, so this is just React glue.
 */
export function AutonomyRunContainer({
  sessionId = "session_desktop_001",
  serverBaseUrl,
  host = "dgx_02",
  tmuxSessionName = "ai-swarm",
  seedPacket,
  onRunEvents,
  historyEvents,
  decisionReadiness,
  onOpenDebate,
  onOpenApprovalQueue,
  onRunMemory,
  registry,
  onRegistryChange,
  seedPersonaName,
}: {
  sessionId?: string;
  serverBaseUrl?: string | string[];
  host?: TerminalHostKind;
  tmuxSessionName?: string;
  /** prefill the form from a CodingPacket (e.g. the current debate/conversation packet) */
  seedPacket?: CodingPacket;
  /** receives the audit/replay event envelopes for a finished run */
  onRunEvents?: (events: EventEnvelope[]) => void;
  /** event log to project past autonomy runs from (for the history view) */
  historyEvents?: ReadonlyArray<EventEnvelope>;
  /** debate decision readiness — gates/forces the handoff mode when provided
   *  (전체 객체를 받아 차단 사유·다음 행동까지 패널 콜아웃에 보여준다) */
  decisionReadiness?: DebateDecisionReadiness;
  /** 게이트가 막혔을 때 토론 화면으로 이동하는 딥링크 */
  onOpenDebate?: () => void;
  /** 사람 승인이 필요할 때 승인 드로어를 (탭 이동 없이) 여는 핸들러 */
  onOpenApprovalQueue?: () => void;
  /** receives a long-term memory candidate summarizing a finished run */
  onRunMemory?: (candidate: MemoryCuratorCandidate) => void;
  /** persistent shared pane pool; when provided, runs allocate from and update it */
  registry?: SummonRegistry;
  onRegistryChange?: (registry: SummonRegistry) => void;
  /** 도감 소환: 폼에 이 페르소나를 프리필 */
  seedPersonaName?: string;
}) {
  const [form, setForm] = useState<AutonomyRunForm>(() => {
    const base = seedPacket ? codingPacketToAutonomyForm(seedPacket) : DEFAULT_AUTONOMY_FORM;
    const seeded = (() => {
      if (!seedPersonaName) return base;
      const set = resolvePersonaAgentSet(seedPersonaName);
      return { ...base, personaName: seedPersonaName, role: set.preferredPaneRole ?? base.role };
    })();
    // 탭을 떠났다 돌아와도 편집하던 폼이 살아 있게 — 도감 소환만 시드가 우선
    return resolveInitialAutonomyForm({ draft: autonomyRunStore.get().formDraft, seeded, seedPersonaName });
  });
  // 미션 라이브 상태는 외부 스토어 구독 — 탭 이동으로 언마운트돼도 실행이 사라지지 않는다
  const live = useSyncExternalStore(autonomyRunStore.subscribe, autonomyRunStore.get);
  const { running, outcome, error, steps } = live;
  useEffect(() => {
    autonomyRunStore.set({ formDraft: form });
  }, [form]);
  // P2-8: 표정 전환을 히스테리시스/쿨다운으로 안정화 (작업 상태가 빠르게 바뀌어도 깜빡임 방지)
  const expressionSmRef = useRef(new ExpressionStateMachine());

  // P2-9: 캐릭터 음성(TTS). Kokoro 서버는 같은 dgx 호스트의 8880 포트.
  const kokoroBaseUrl = useMemo(() => deriveKokoroBaseUrl(serverBaseUrl), [serverBaseUrl]);
  const speaker = useTtsSpeaker({ baseUrl: kokoroBaseUrl });
  const speechText = buildRunSpeechText({ personaName: form.personaName, outcome, running });
  const onSpeak = () => {
    if (!speechText) return;
    void speaker.speak(speechText, { voicePreset: voicePresetForRole(form.role) });
  };

  const gate =
    decisionReadiness !== undefined
      ? evaluateExecutionHandoffGate({ readiness: decisionReadiness.state, requestedMode: form.mode })
      : undefined;

  const baseRunnable = isRunnable(form);
  const runnable = gate && !gate.allowed ? { ok: false, reason: gate.reason } : baseRunnable;
  const notice = gate && gate.allowed && gate.modeDowngraded ? gate.reason : undefined;

  const onRun = async () => {
    if (running || !runnable.ok) {
      return;
    }
    const stamp = Date.now();
    const runId = `desktop_${stamp}`;
    const startedAt = new Date().toISOString();
    const controller = new AbortController();
    autonomyRunStore.set({
      running: true,
      error: null,
      outcome: null,
      steps: [],
      approvalWaitNote: null,
      runId,
      goal: form.goal.trim(),
      startedAt,
      cancelling: false,
      // 홈 "현재 작업" 카드의 중지 버튼이 이 핸들을 부른다 — 협조적 취소라
      // 진행 중인 fetch 한 번은 마저 끝나고 다음 루프 경계에서 "cancelled"로 끝난다.
      abort: () => {
        autonomyRunStore.set({ cancelling: true });
        controller.abort();
      },
    });
    const collected: AutonomyStepRow[] = [];
    // The handoff gate may downgrade the mode (e.g. needs_review -> human).
    const effectiveForm = gate ? { ...form, mode: gate.effectiveMode } : form;
    try {
      const personaName = effectiveForm.personaName.trim();
      const persona = await loadPersonaOrHeader(personaName);
      // Sticky Hermes slot: the persona keeps her own agent across runs; a
      // reset is dispatched only when a recycled slot changes characters.
      const slotAcquisition = acquireHermesSlot(loadHermesPool(), personaName);
      saveHermesPool(slotAcquisition.pool);
      const input = buildAutonomyRunInput(effectiveForm, {
        sessionId,
        persona,
        agentSet: resolvePersonaAgentSet(personaName, {
          slotId: slotAcquisition.slot.id,
          bootSteps: slotAcquisition.requiresBoot ? [DEFAULT_HERMES_RESET_COMMAND] : [],
        }),
        ctx: {
          now: startedAt,
          makeSessionId: (personaName, paneId) => `as_${personaName}_${paneId}_${stamp}`,
        },
        server: { serverBaseUrl, host, tmuxSessionName },
        runId,
        registry,
        onStep: (result) => {
          const row = stepRowFromReduce(result, collected.length + 1);
          collected.push(row);
          autonomyRunStore.set({ steps: [...autonomyRunStore.get().steps, row] });
        },
      });
      // 자동승인 불가 명령이 조용히 승인 대기에 빠질 때 패널에 안내를 띄운다
      input.logger = (message: string) => {
        const note = approvalWaitNoteFromLog(message);
        if (note) {
          autonomyRunStore.set({ approvalWaitNote: note });
        } else if (message.includes("auto-approved")) {
          autonomyRunStore.set({ approvalWaitNote: null });
        }
      };
      // 홈 중지 버튼 → AbortController → 루프 경계에서 "cancelled"로 종료 (감사 이벤트는 그대로 기록)
      input.signal = controller.signal;
      const result = await runAutonomousPersonaTask(input);
      autonomyRunStore.set({ outcome: result });
      if (onRegistryChange && result.ok) {
        onRegistryChange(result.registry);
      }
      if (onRunEvents) {
        const ctx: AutonomyRunEventContext = {
          sessionId,
          runId,
          personaName: effectiveForm.personaName.trim(),
          role: effectiveForm.role,
          mode: effectiveForm.mode,
          goal: effectiveForm.goal.trim(),
          now: startedAt,
        };
        onRunEvents(createAutonomyRunEvents(ctx, collected, result));
      }
      if (onRunMemory && result.ok && result.loopStatus !== "cancelled") {
        onRunMemory(
          createAutonomyRunMemoryCandidate({
            runId,
            sessionId,
            personaName: effectiveForm.personaName.trim(),
            role: effectiveForm.role,
            goal: effectiveForm.goal.trim(),
            loopStatus: result.loopStatus,
            stepCount: collected.length,
            createdAt: startedAt,
          }),
        );
      }
    } catch (caught) {
      autonomyRunStore.set({ error: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      autonomyRunStore.set({
        running: false,
        approvalWaitNote: null,
        runId: null,
        goal: null,
        startedAt: null,
        abort: null,
        cancelling: false,
      });
    }
  };

  return (
    <AutonomyRunPanel
      error={error}
      form={form}
      onFieldChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      onRun={onRun}
      history={historyEvents ? projectAutonomyRunHistory(historyEvents) : undefined}
      expression={
        expressionSmRef.current.update({
          candidate: classifyExpression({
            outcome: running ? steps[steps.length - 1]?.outcome : undefined,
            loopStatus: outcome?.ok ? outcome.loopStatus : undefined,
            running,
          }),
          nowMs: Date.now(),
        }).expression
      }
      notice={notice}
      approvalWaitNote={live.approvalWaitNote ?? undefined}
      gateDetail={gate && !gate.allowed ? decisionReadiness : undefined}
      onOpenDebate={onOpenDebate}
      onOpenApprovalQueue={onOpenApprovalQueue}
      personaAvatars={personaAvatars}
      personaSprites={personaSprites}
      roster={registry ? rosterFromRegistry(registry) : undefined}
      onLoadFromPacket={seedPacket ? () => setForm(codingPacketToAutonomyForm(seedPacket)) : undefined}
      outcome={outcome}
      personaOptions={bundledPersonaNames}
      runnable={runnable}
      running={running}
      steps={steps}
      onSpeak={onSpeak}
      speaking={speaker.speaking}
      speakDisabledReason={speechText ? undefined : "읽을 결과가 없습니다"}
    />
  );
}
