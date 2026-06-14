import { useMemo, useState } from "react";
import { Wand2, Copy, ClipboardPaste, ArrowDownToLine, CircleCheck, CircleAlert, Sparkles } from "lucide-react";
import type { AppFixDraft } from "../lib/appFixDraft";
import type { MissionScaffoldFile } from "../lib/missionPublishPrefill";
import {
  buildTurboEditPrompt,
  validateTurboEditOutput,
  type TurboEditPromptIssue,
} from "../lib/turboEditPrompt";
import type { TurboEditGenerator, TurboEditGenerationResult } from "../lib/turboEditGenerator";
import { Card, CardHeader, CardContent, CardFooter } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

/**
 * Turbo Edits Draft — SEARCH/REPLACE 블록을 만드는 producer surface.
 *
 *   - 사용자가 focusPaths(어떤 파일) + 짧은 instruction을 고르면, prompt를 결정적으로 빌드.
 *   - "프롬프트 복사" 클릭 → 클립보드. 사용자가 외부 LLM(Claude/ChatGPT/Codex)에 붙여넣고 응답을 받음.
 *   - 응답을 paste 영역에 붙여넣으면 validate.
 *   - valid면 "초안으로 보내기" 클릭 → 부모가 SearchReplaceEditCard textarea로 주입.
 *
 * 자동 실행 0:
 *   - LLM 호출 0(이 카드는 prompt 빌드 + validate만 — 호출은 사용자가 외부에서).
 *   - 자동 overlay 0, 자동 preview 0.
 *
 * shadcn Card/Badge/Button(MIT, src/components/ui/LICENSE.md) 재사용.
 */

const COPY_OK_MS = 1800;

export function TurboEditDraftCard({
  missionId,
  appName,
  files,
  appFixDraft,
  extraIssues,
  onSendDraft,
  onContextEvent,
  onGenerate,
  providerLabel,
}: {
  missionId: string;
  appName?: string;
  files: ReadonlyArray<MissionScaffoldFile> | undefined;
  appFixDraft?: AppFixDraft;
  extraIssues?: ReadonlyArray<TurboEditPromptIssue>;
  /** "초안으로 보내기" 클릭 — 부모(MissionBoardPanel)가 SearchReplaceEditCard text로 주입. */
  onSendDraft: (text: string) => void;
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
  /** OSS-H6: in-app provider 호출. 부모가 active provider/model로 만든 generator를 주입.
   *  undefined면 카드는 외부 LLM 복붙 경로만 노출(가짜 버튼 X). */
  onGenerate?: TurboEditGenerator;
  /** "AI 수정 초안 생성" 버튼 옆에 표시할 provider/model 라벨(있을 때만). */
  providerLabel?: string;
}) {
  const [selectedPaths, setSelectedPaths] = useState<ReadonlyArray<string>>(() => {
    // 기본 선택: appFixDraft.fileSuggestions의 파일들 + scaffold 첫 3개.
    const fromDraft = appFixDraft?.fileSuggestions.map((s) => s.file) ?? [];
    const fromScaffold = (files ?? []).slice(0, 3).map((f) => f.path);
    return Array.from(new Set([...fromDraft, ...fromScaffold])).slice(0, 6);
  });
  const [userInstruction, setUserInstruction] = useState("");
  const [pasted, setPasted] = useState("");
  const [copyAt, setCopyAt] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [lastGenerationKind, setLastGenerationKind] = useState<
    "idle" | "ok_injected" | "ok_invalid" | "no_edits" | "failed"
  >("idle");

  const prompt = useMemo(() => {
    if (!files) return null;
    return buildTurboEditPrompt({
      appName,
      scaffoldFiles: files,
      focusPaths: selectedPaths,
      appFixDraft,
      extraIssues,
      userInstruction: userInstruction.trim() || undefined,
    });
  }, [appName, files, selectedPaths, appFixDraft, extraIssues, userInstruction]);

  const validation = useMemo(() => validateTurboEditOutput(pasted), [pasted]);

  const onTogglePath = (path: string) => {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };

  const onCopyPrompt = async () => {
    if (!prompt) return;
    const text = `${prompt.systemPrompt}\n\n---\n\n${prompt.userPrompt}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyAt(Date.now());
      onContextEvent?.("mission.turbo_edits.prompt_copied", {
        missionId,
        includedFiles: prompt.includedFiles.length,
        skippedFiles: prompt.skippedFiles.length,
        promptBytes: text.length,
        ts: new Date().toISOString(),
      });
      window.setTimeout(() => setCopyAt(null), COPY_OK_MS);
    } catch {
      // 클립보드 권한 없거나 환경 제약 — 사용자에게 직접 선택해서 복사하도록 textarea에 prompt 표시 외엔 손쓸 게 없다.
    }
  };

  const onSend = () => {
    if (!validation.ok || (validation.ok && validation.noConfidentEdits)) return;
    onSendDraft(pasted);
    onContextEvent?.("mission.turbo_edits.draft_sent", {
      missionId,
      blockCount: validation.blockCount,
      filePaths: validation.filePaths,
      ts: new Date().toISOString(),
    });
  };

  const onClickGenerate = async () => {
    if (!onGenerate || !prompt || prompt.empty || generating) return;
    setGenerating(true);
    setGenerationError(null);
    setLastGenerationKind("idle");
    onContextEvent?.("mission.turbo_edits.generate_clicked", {
      missionId,
      promptBytes: prompt.userPrompt.length,
      includedFiles: prompt.includedFiles.length,
      ts: new Date().toISOString(),
    });
    let result: TurboEditGenerationResult;
    try {
      result = await onGenerate({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
      });
    } catch (e) {
      // generator는 보통 throw하지 않지만(자체적으로 reason으로 변환), 그래도 가드.
      const reason = e instanceof Error ? e.message : String(e);
      setGenerationError(reason);
      setLastGenerationKind("failed");
      setGenerating(false);
      return;
    }
    if (!result.ok) {
      setGenerationError(result.reason);
      setLastGenerationKind("failed");
      setGenerating(false);
      return;
    }
    // 응답 텍스트를 paste 영역에 채워 — useMemo가 자동 validate.
    setPasted(result.text);
    // 검증 — valid면 SearchReplaceEditCard로 자동 주입(루프 단축).
    const v = validateTurboEditOutput(result.text);
    if (v.ok && !v.noConfidentEdits) {
      onSendDraft(result.text);
      setLastGenerationKind("ok_injected");
      onContextEvent?.("mission.turbo_edits.generate_injected", {
        missionId,
        blockCount: v.blockCount,
        filePaths: v.filePaths,
        ts: new Date().toISOString(),
      });
    } else if (v.ok && v.noConfidentEdits) {
      setLastGenerationKind("no_edits");
      onContextEvent?.("mission.turbo_edits.generate_no_edits", {
        missionId,
        ts: new Date().toISOString(),
      });
    } else {
      setLastGenerationKind("ok_invalid");
      onContextEvent?.("mission.turbo_edits.generate_invalid", {
        missionId,
        reason: v.reason,
        ts: new Date().toISOString(),
      });
    }
    setGenerating(false);
  };

  if (!files) {
    return (
      <Card
        className="turbo-edits-draft"
        data-testid={`turbo-edits-draft-${missionId}`}
        data-state="disabled"
      >
        <CardHeader className="flex flex-row items-center gap-2">
          <Wand2 size={14} /> <span className="font-semibold">AI 수정 초안</span>
        </CardHeader>
        <CardContent>
          <p
            className="text-muted-foreground text-xs"
            data-testid={`turbo-edits-draft-disabled-${missionId}`}
          >
            스캐폴드 없음 — preview 실행 또는 scaffold refresh가 먼저 필요합니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="turbo-edits-draft"
      data-testid={`turbo-edits-draft-${missionId}`}
      data-state={prompt?.empty ? "empty" : "ready"}
    >
      <CardHeader className="flex flex-row items-center gap-2 flex-wrap">
        <Wand2 size={14} />
        <span className="font-semibold">AI 수정 초안</span>
        <span className="text-muted-foreground text-xs">
          SEARCH/REPLACE 블록을 만들 프롬프트 — 외부 LLM에 붙여넣고 응답을 가져오세요
        </span>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* focus paths picker */}
        <div data-testid={`turbo-edits-paths-${missionId}`}>
          <p className="text-xs text-muted-foreground mb-1">초점 파일 (선택해서 prompt에 포함)</p>
          <ul className="flex flex-wrap gap-1">
            {files.map((f) => {
              const checked = selectedPaths.includes(f.path);
              return (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => onTogglePath(f.path)}
                    className={`rounded-md border px-2 py-0.5 text-xs ${
                      checked ? "bg-primary text-primary-foreground" : "bg-muted/40"
                    }`}
                    data-testid={`turbo-edits-path-${missionId}-${f.path}`}
                    aria-pressed={checked}
                  >
                    {f.path}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* user instruction */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">짧은 수정 요청 (선택)</p>
          <input
            className="w-full rounded-md border bg-input/40 p-2 text-xs"
            placeholder="예: 헤더 글씨를 더 크게, primary 버튼을 강조"
            value={userInstruction}
            onChange={(e) => setUserInstruction(e.target.value)}
            data-testid={`turbo-edits-instruction-${missionId}`}
            aria-label="짧은 수정 요청"
          />
        </div>

        {/* prompt preview + copy */}
        {prompt ? (
          <div data-testid={`turbo-edits-prompt-preview-${missionId}`}>
            <div className="flex items-center gap-1 flex-wrap text-xs mb-1">
              <Badge variant="secondary">
                포함 {prompt.includedFiles.length}
              </Badge>
              {prompt.skippedFiles.length > 0 ? (
                <Badge variant="destructive">
                  스킵 {prompt.skippedFiles.length}
                </Badge>
              ) : null}
              <span className="text-muted-foreground">
                {prompt.userPrompt.length}자
              </span>
            </div>
            <pre
              className="text-xs bg-muted/40 rounded-md p-2 overflow-auto max-h-48"
              data-testid={`turbo-edits-prompt-body-${missionId}`}
            >
              {prompt.userPrompt}
            </pre>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCopyPrompt}
              disabled={prompt.empty}
              className="mt-1"
              data-testid={`turbo-edits-copy-${missionId}`}
            >
              <Copy size={11} /> 프롬프트 복사
            </Button>
            {copyAt ? (
              <span
                className="ml-2 text-xs text-emerald-400"
                data-testid={`turbo-edits-copy-ok-${missionId}`}
              >
                복사됨
              </span>
            ) : null}
          </div>
        ) : null}

        {/* response paste + validation */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            <ClipboardPaste size={10} className="inline" /> LLM 응답 붙여넣기
          </p>
          <textarea
            className="w-full min-h-[100px] rounded-md border bg-input/40 p-2 font-mono text-xs"
            placeholder="응답을 붙여넣으면 검증합니다 (자동 실행 X)"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            data-testid={`turbo-edits-paste-${missionId}`}
            aria-label="LLM 응답"
          />
          {pasted.trim().length > 0 ? (
            <ValidationSummary
              missionId={missionId}
              validation={validation}
            />
          ) : null}
        </div>
      </CardContent>

      <CardFooter className="flex items-center gap-2 flex-wrap">
        {/* OSS-H6: in-app provider 생성 — onGenerate 주입된 경우만 노출. */}
        {onGenerate ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onClickGenerate}
            disabled={!prompt || prompt.empty || generating}
            data-testid={`turbo-edits-generate-${missionId}`}
          >
            <Sparkles size={11} /> {generating ? "생성 중..." : "AI 수정 초안 생성"}
          </Button>
        ) : (
          <span
            className="text-xs text-muted-foreground"
            data-testid={`turbo-edits-generate-unavailable-${missionId}`}
          >
            provider 미설정 — 위 "프롬프트 복사"로 외부 LLM 경로를 쓰세요
          </span>
        )}
        {providerLabel && onGenerate ? (
          <span
            className="text-xs text-muted-foreground"
            data-testid={`turbo-edits-provider-label-${missionId}`}
          >
            {providerLabel}
          </span>
        ) : null}
        {lastGenerationKind === "ok_injected" ? (
          <span
            className="text-xs text-emerald-400"
            data-testid={`turbo-edits-generate-injected-${missionId}`}
          >
            <CircleCheck size={10} className="inline" /> 자동 주입됨 — 아래에서 검토하고 Apply
          </span>
        ) : null}
        {lastGenerationKind === "ok_invalid" ? (
          <span
            className="text-xs text-red-400"
            data-testid={`turbo-edits-generate-invalid-${missionId}`}
          >
            <CircleAlert size={10} className="inline" /> 응답이 유효한 SEARCH/REPLACE 형식이 아님 — 직접 수정 필요
          </span>
        ) : null}
        {lastGenerationKind === "no_edits" ? (
          <span
            className="text-xs text-amber-400"
            data-testid={`turbo-edits-generate-no-edits-${missionId}`}
          >
            모델이 NO_CONFIDENT_EDITS로 답함 — 안전한 수정안을 못 만듦
          </span>
        ) : null}
        {lastGenerationKind === "failed" && generationError ? (
          <span
            className="text-xs text-red-400"
            data-testid={`turbo-edits-generate-failed-${missionId}`}
          >
            생성 실패: {generationError}
          </span>
        ) : null}

        <Button
          type="button"
          size="sm"
          onClick={onSend}
          disabled={!validation.ok || (validation.ok && validation.noConfidentEdits)}
          data-testid={`turbo-edits-send-${missionId}`}
        >
          <ArrowDownToLine size={11} /> 초안으로 보내기
        </Button>
        <span className="text-xs text-muted-foreground">
          SearchReplaceEditCard로 주입 — 적용은 거기서 직접
        </span>
      </CardFooter>
    </Card>
  );
}

function ValidationSummary({
  missionId,
  validation,
}: {
  missionId: string;
  validation: ReturnType<typeof validateTurboEditOutput>;
}) {
  if (!validation.ok) {
    const label =
      validation.reason === "empty"
        ? "비어 있음"
        : validation.reason === "no_blocks"
          ? "SEARCH/REPLACE 블록이 없음"
          : "filepath 라벨이 없음";
    return (
      <p
        className="text-xs text-red-400 mt-1"
        data-testid={`turbo-edits-validation-error-${missionId}`}
        data-reason={validation.reason}
      >
        <CircleAlert size={10} className="inline" /> 적용 불가 — {label}
      </p>
    );
  }
  if (validation.noConfidentEdits) {
    return (
      <p
        className="text-xs text-amber-400 mt-1"
        data-testid={`turbo-edits-validation-no-edits-${missionId}`}
      >
        모델이 NO_CONFIDENT_EDITS로 응답 — 안전한 수정안을 못 만듦. 입력을 다듬어 다시 시도하세요.
      </p>
    );
  }
  return (
    <p
      className="text-xs text-emerald-400 mt-1"
      data-testid={`turbo-edits-validation-ok-${missionId}`}
    >
      <CircleCheck size={10} className="inline" /> 블록 {validation.blockCount}개 ·{" "}
      {validation.filePaths.join(", ")}
    </p>
  );
}
