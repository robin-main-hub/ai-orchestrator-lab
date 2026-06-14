import { useState } from "react";
import { Hammer, Sparkles, X, Loader2, GitBranch, ArrowRight, Plus, Trash2, Rocket } from "lucide-react";
import type { DesignBlueprintInput, DesignScreenInput, ServerMissionRecord } from "@ai-orchestrator/protocol";
import { StatusBadge } from "@/ui/status-badge";
import {
  createDgxBlueprintDraft as defaultFillDraft,
  createDgxMissionFromBlueprint as defaultCreateMission,
} from "../../runtime/stage47MissionServer";
import {
  appBuildModeCaption,
  appBuildSubmitPlan,
  buildBlueprintDraftRequest,
  draftSourceBadge,
  initialAppBuildMode,
  type AppBuildMode,
  type AppBuildSeed,
} from "../../lib/appBuildModel";

/**
 * App Builder 검토 패널(3순위) — 대화에서 도출한 DesignBlueprint 초안을 **검토·편집한 뒤**
 * 미션으로 승격한다. 초안 합성은 절대 자동으로 4~16 LLM을 쏘지 않는다 — 결정적 stub(즉시) +
 * 선택적 "AI로 초안 채우기"(단발 LLM, 실패 시 stub 폴백). 큰 변경은 토론으로 넘긴다.
 *
 * 정직성: 초안은 AI가 만들었어도 planned일 뿐 observed가 아니다(배지로 명시). preview/검증을
 * 통과해야 observed가 된다(미션 보드에서).
 */
export function AppBuildContainer({
  seed,
  model,
  serverBaseUrl,
  onClose,
  onCreated,
  onHandoffToDebate,
  fillDraft = defaultFillDraft,
  createMission = defaultCreateMission,
}: {
  seed: AppBuildSeed;
  /** 사용자가 고른 모델 — 있으면 "AI로 초안 채우기" 활성(id+providerProfileId) */
  model?: { id: string; providerProfileId: string };
  serverBaseUrl?: string | string[];
  onClose: () => void;
  onCreated?: (mission: ServerMissionRecord) => void;
  /**
   * 토론 모드에서 "토론으로 보내기" — 편집한 blueprint를 실어 보낸다(토론 런타임이
   * blueprintContext로 실제 검토·반박·개선). 미제공이면 토론 핸드오프 비활성.
   */
  onHandoffToDebate?: (blueprint: DesignBlueprintInput) => void;
  fillDraft?: typeof defaultFillDraft;
  createMission?: typeof defaultCreateMission;
}) {
  const [title, setTitle] = useState(seed.blueprint.title);
  const [userIntent, setUserIntent] = useState(seed.blueprint.userIntent);
  const [screens, setScreens] = useState<DesignScreenInput[]>(seed.blueprint.screens);
  const [acceptance, setAcceptance] = useState(seed.blueprint.acceptanceCriteria.join("\n"));
  const [mode, setMode] = useState<AppBuildMode>(initialAppBuildMode(seed.blueprint));
  const [badge, setBadge] = useState(draftSourceBadge({ source: "stub", degraded: false }));
  const [aiBusy, setAiBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [created, setCreated] = useState<ServerMissionRecord | undefined>();

  const currentBlueprint = (): DesignBlueprintInput => ({
    title: title.trim() || "새 앱 초안",
    userIntent: userIntent.trim() || title.trim() || "새 앱 초안",
    targetSurface: seed.blueprint.targetSurface,
    screens,
    designTokens: seed.blueprint.designTokens,
    acceptanceCriteria: acceptance
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  });

  const onFillWithAi = async () => {
    if (!model || aiBusy) return;
    setAiBusy(true);
    setError(undefined);
    try {
      const response = await fillDraft({
        request: buildBlueprintDraftRequest({
          messages: seed.messages,
          draft: seed.draft,
          sessionId: seed.sourceSessionId,
          targetSurface: seed.blueprint.targetSurface,
          model,
        }),
        serverBaseUrl,
      });
      // AI 보강이 성공했을 때만 편집 필드를 AI 초안으로 교체한다. degraded(=AI 실패→서버 stub
      // 폴백)면 사용자가 지금까지 편집한 초안을 **보존**하고 경고 배지만 띄운다(편집 손실 방지·정직).
      if (!response.degraded) {
        setTitle(response.blueprint.title);
        setUserIntent(response.blueprint.userIntent);
        setScreens(response.blueprint.screens);
        setAcceptance(response.blueprint.acceptanceCriteria.join("\n"));
        setMode(initialAppBuildMode(response.blueprint));
      }
      setBadge(draftSourceBadge({ source: response.source, degraded: response.degraded, note: response.note }));
    } catch (err) {
      setError(`AI 초안 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAiBusy(false);
    }
  };

  const onCreate = async () => {
    if (submitting) return;
    const plan = appBuildSubmitPlan({ mode, blueprint: currentBlueprint(), sourceSessionId: seed.sourceSessionId });
    if (plan.kind === "debate") {
      // 큰 변경: 편집한 초안을 토론으로 실어 보낸다(여기서 LLM 자동발사 안 함 — 토론 화면의
      // 명시적 시작이 엔진을 돌린다). 토론은 이 초안을 검토·반박·개선한다.
      onHandoffToDebate?.(plan.blueprint);
      onClose();
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const { mission } = await createMission({ request: plan.request, serverBaseUrl });
      setCreated(mission);
      onCreated?.(mission);
    } catch (err) {
      setError(`미션 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="앱 빌드 초안 검토">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <Hammer className="h-4 w-4 text-cyan-300" />
          <strong className="text-sm text-zinc-100">앱 빌드 — 초안 검토</strong>
          <StatusBadge size="sm" variant={badge.tone}>
            {badge.label}
          </StatusBadge>
          <button aria-label="닫기" className="ml-auto rounded-lg p-1 text-zinc-500 hover:text-zinc-200" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </header>

        {created ? (
          <div className="flex flex-col items-start gap-2 p-5">
            <StatusBadge size="sm" variant="success">미션 생성됨</StatusBadge>
            <p className="text-sm text-zinc-200">{created.mission.title}</p>
            <p className="text-xs text-zinc-500">
              상태 {created.status} · truth {created.truthStatus} — 미션 보드에서 검증/머지를 진행하세요. (지금은 planned —
              검증을 통과해야 observed)
            </p>
            <button className="mt-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10" onClick={onClose} type="button">
              닫기
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {/* 정직성 안내 — 이 화면이 "초안 검토"라는 사실을 분명히. provenance는 분리해서 작게. */}
              <div className="space-y-1">
                <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] leading-snug text-zinc-400">
                  {badge.detail ? `${badge.detail} · ` : ""}이 화면은 <span className="text-zinc-200">앱 빌드 초안</span>입니다 —
                  아직 미션이 만들어지지 않았고 상태는 <span className="text-zinc-200">planned</span>입니다. 미션 생성 후 preview/검증을
                  통과해야 observed가 됩니다.
                </p>
                <p className="px-1 text-[10px] text-zinc-500" data-testid="appbuild-provenance">
                  출처 세션: <span className="font-mono text-zinc-400">{seed.sourceSessionId}</span>
                </p>
              </div>

              {/* title */}
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">제목</span>
                <input
                  aria-label="제목"
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus-visible:border-cyan-400/50"
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </label>

              {/* userIntent */}
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">사용자 의도 (대화 요지)</span>
                <textarea
                  aria-label="사용자 의도"
                  className="min-h-[64px] w-full resize-y rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none focus-visible:border-cyan-400/50"
                  onChange={(event) => setUserIntent(event.target.value)}
                  value={userIntent}
                />
              </label>

              {/* screens */}
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">화면 ({screens.length})</span>
                  <button
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10"
                    onClick={() =>
                      setScreens((prev) => [
                        ...prev,
                        { name: `화면 ${prev.length + 1}`, purpose: "", primaryAction: "주요 작업", secondaryActions: [], dataNeeded: [], emptyState: "데이터 없음", errorState: "오류 상태" },
                      ])
                    }
                    type="button"
                  >
                    <Plus className="h-3 w-3" /> 화면 추가
                  </button>
                </div>
                <ul className="space-y-2">
                  {screens.map((screen, index) => (
                    <li className="rounded-lg border border-white/10 bg-zinc-900/60 p-2" key={index}>
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`화면 ${index + 1} 이름`}
                          className="flex-1 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[13px] text-zinc-100 outline-none focus-visible:border-cyan-400/40"
                          onChange={(event) => setScreens((prev) => prev.map((s, i) => (i === index ? { ...s, name: event.target.value } : s)))}
                          value={screen.name}
                        />
                        {screens.length > 1 ? (
                          <button
                            aria-label={`화면 ${index + 1} 삭제`}
                            className="shrink-0 rounded-md p-1 text-zinc-500 hover:text-red-300"
                            onClick={() => setScreens((prev) => prev.filter((_, i) => i !== index))}
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                      <input
                        aria-label={`화면 ${index + 1} 주요 액션`}
                        className="mt-1.5 w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-300 outline-none focus-visible:border-cyan-400/40"
                        onChange={(event) => setScreens((prev) => prev.map((s, i) => (i === index ? { ...s, primaryAction: event.target.value } : s)))}
                        placeholder="주요 액션"
                        value={screen.primaryAction}
                      />
                    </li>
                  ))}
                </ul>
              </div>

              {/* acceptance */}
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">수용 기준 (줄바꿈으로 구분)</span>
                <textarea
                  className="min-h-[48px] w-full resize-y rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-[13px] leading-6 text-zinc-100 outline-none focus-visible:border-cyan-400/50"
                  onChange={(event) => setAcceptance(event.target.value)}
                  placeholder="예) 드래그로 카드 이동"
                  value={acceptance}
                />
              </label>

              {/* 단순 ↔ 토론 토글 */}
              <div>
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">진행 방식</span>
                <div className="inline-flex overflow-hidden rounded-lg border border-white/10" role="tablist">
                  <button
                    aria-selected={mode === "simple"}
                    className={`px-3 py-1 text-[12px] ${mode === "simple" ? "bg-cyan-500/20 font-semibold text-cyan-100" : "text-zinc-500 hover:text-zinc-300"}`}
                    onClick={() => setMode("simple")}
                    role="tab"
                    type="button"
                  >
                    단순 — 바로 미션
                  </button>
                  <button
                    aria-selected={mode === "debate"}
                    className={`inline-flex items-center gap-1 px-3 py-1 text-[12px] ${mode === "debate" ? "bg-violet-500/20 font-semibold text-violet-100" : "text-zinc-500 hover:text-zinc-300"}`}
                    onClick={() => setMode("debate")}
                    role="tab"
                    type="button"
                  >
                    <GitBranch className="h-3 w-3" /> 큰 변경 — 토론 먼저
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">{appBuildModeCaption(currentBlueprint())}</p>
                {mode === "debate" && onHandoffToDebate ? (
                  <p className="mt-1 text-[11px] text-zinc-500">
                    <span className="text-zinc-300">편집한 이 초안</span>을 캐릭터 팀이 검토·반박·개선합니다(초안은 planned). 토론 화면에서
                    시작하며, 결정을 본 뒤 미션으로 승격하세요.
                  </p>
                ) : null}
                {mode === "debate" && !onHandoffToDebate ? (
                  <p className="mt-1 text-[11px] text-amber-300">토론 연결이 없어요 — 단순으로 전환하거나 토론 기능에서 진행하세요.</p>
                ) : null}
              </div>

              {error ? <p className="text-[12px] text-red-300">{error}</p> : null}
            </div>

            {/* footer actions */}
            <footer className="flex shrink-0 items-center gap-2 border-t border-white/10 px-4 py-3">
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-[12px] text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
                disabled={!model || aiBusy}
                onClick={() => void onFillWithAi()}
                title={model ? "단발 LLM으로 화면/수용기준을 보강(실패 시 결정적 초안 유지)" : "모델을 먼저 선택하세요"}
                type="button"
              >
                {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiBusy ? "채우는 중…" : "AI로 초안 채우기"}
              </button>
              <button
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-[13px] font-medium text-white hover:from-cyan-400 hover:to-violet-400 disabled:opacity-50"
                disabled={submitting || (mode === "debate" && !onHandoffToDebate)}
                onClick={() => void onCreate()}
                type="button"
              >
                {mode === "debate" ? (
                  <>
                    <ArrowRight className="h-4 w-4" /> 이 초안을 토론으로 보내기
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" /> {submitting ? "생성 중…" : "이 초안으로 미션 만들기"}
                  </>
                )}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
