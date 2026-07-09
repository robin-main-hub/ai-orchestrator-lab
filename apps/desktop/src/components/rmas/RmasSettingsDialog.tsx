import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ProviderProfile, RmasAgentSlotConfig, RmasPattern, RmasSlotKind } from "@ai-orchestrator/protocol";
import type { ModelCatalog } from "../../types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { Switch } from "../../ui/switch";
import { Badge } from "../../ui/badge";
import { generateSlotId, PATTERN_LABEL, RMAS_PATTERNS, type RmasSettings } from "./rmasViewModel";

const KIND_LABEL: Record<RmasSlotKind, string> = {
  planner: "플래너",
  critic: "비평가",
  solver: "해결사",
  aggregator: "취합자",
  producer: "생산자",
  distiller: "증류자",
  custom: "커스텀",
};
const KIND_OPTIONS = Object.keys(KIND_LABEL) as RmasSlotKind[];

const selectClass =
  "w-full rounded border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";
const inputClass = selectClass;
const fieldLabel = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";

/**
 * Settings dialog (Radix Dialog + inner Tabs): API 키 / 에이전트 설정 / 파이프라인.
 * Edits a local draft; 저장 commits it up to the view (which persists to
 * localStorage). Provider/model choices come from the app's `providerProfiles`
 * + `modelCatalog` (the same discovery source CodingWorkbench uses — there is
 * no separate RMAS discovery endpoint); off-allowlist picks fail honestly as
 * `rmas.agent.error` at run time.
 */
export function RmasSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
  providers,
  modelCatalog,
  serverBaseUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: RmasSettings;
  onSave: (settings: RmasSettings) => void;
  providers: ReadonlyArray<ProviderProfile>;
  modelCatalog: ModelCatalog;
  serverBaseUrl: string;
}) {
  const [draft, setDraft] = useState<RmasSettings>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const patchSlot = (slotId: string, patch: Partial<RmasAgentSlotConfig>) => {
    setDraft((current) => ({
      ...current,
      agents: current.agents.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)),
    }));
  };

  const addSlot = () => {
    const provider = providers.find((candidate) => candidate.enabled) ?? providers[0];
    setDraft((current) => ({
      ...current,
      agents: [
        ...current.agents,
        {
          id: generateSlotId(),
          name: `에이전트 ${current.agents.length + 1}`,
          kind: "custom",
          providerProfileId: provider?.id ?? "provider_dgx02_vllm",
          modelId: provider?.defaultModel ?? "",
          systemPrompt: "",
          enabled: true,
        },
      ],
    }));
  };

  const removeSlot = (slotId: string) => {
    setDraft((current) => ({
      ...current,
      agents: current.agents.filter((slot) => slot.id !== slotId),
      judgeSlotId: current.judgeSlotId === slotId ? undefined : current.judgeSlotId,
    }));
  };

  const patchBudget = (patch: Partial<RmasSettings["budgets"]>) =>
    setDraft((current) => ({ ...current, budgets: { ...current.budgets, ...patch } }));

  const save = () => {
    onSave(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>목표 루프 설정</DialogTitle>
          <DialogDescription>에이전트·파이프라인·수용 기준을 구성합니다. 키는 서버에 보관됩니다.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="agents" className="flex min-h-0 flex-col">
          <TabsList className="w-full">
            <TabsTrigger value="apikeys" className="flex-1">
              API 키
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex-1">
              에이전트 설정
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="flex-1">
              파이프라인
            </TabsTrigger>
          </TabsList>

          {/* ── API 키 ── */}
          <TabsContent value="apikeys" className="max-h-[55vh] overflow-y-auto pr-1">
            <div className="flex flex-col gap-3 py-2">
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                API 키는 <strong>서버 측(.env / 시크릿 볼트)</strong>에만 보관됩니다. 클라이언트에는 어떤 키도 저장하지
                않으며, 실행 루프는 서버 프록시를 통해 모델을 호출합니다.
              </p>
              <div className="text-xs">
                <div className="mb-1 font-medium text-muted-foreground">서버</div>
                <div className="rounded-md border border-border bg-card px-3 py-2 font-mono text-foreground">{serverBaseUrl}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">등록된 프로바이더 ({providers.length})</div>
                <ul className="flex flex-col gap-1">
                  {providers.map((profile) => (
                    <li key={profile.id} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                      <span className="truncate text-foreground">{profile.name}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant="secondary">{profile.kind}</Badge>
                        <span className={profile.enabled ? "text-emerald-500" : "text-muted-foreground"}>
                          {profile.enabled ? "활성" : "비활성"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </TabsContent>

          {/* ── 에이전트 설정 ── */}
          <TabsContent value="agents" className="max-h-[55vh] overflow-y-auto pr-1">
            <div className="flex flex-col gap-3 py-2">
              {draft.agents.map((slot) => {
                const catalog = modelCatalog[slot.providerProfileId] ?? [];
                const defaultModel = providers.find((profile) => profile.id === slot.providerProfileId)?.defaultModel;
                const modelIds = Array.from(
                  new Set(
                    [...catalog.map((model) => model.id), defaultModel, slot.modelId || undefined].filter(
                      (value): value is string => Boolean(value),
                    ),
                  ),
                );
                const modelLabel = (id: string) => catalog.find((model) => model.id === id)?.name ?? id;
                return (
                  <div key={slot.id} className="flex flex-col gap-2 rounded-md border border-border bg-card/60 p-3">
                    <div className="flex items-center gap-2">
                      <label className={`${fieldLabel} flex-1`}>
                        이름
                        <input
                          className={inputClass}
                          value={slot.name}
                          onChange={(event) => patchSlot(slot.id, { name: event.target.value })}
                        />
                      </label>
                      <div className="flex items-center gap-1.5 pt-4">
                        <Switch
                          checked={slot.enabled}
                          onCheckedChange={(checked) => patchSlot(slot.id, { enabled: checked })}
                          aria-label={`${slot.name} 사용`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSlot(slot.id)}
                          disabled={draft.agents.length <= 1}
                          aria-label={`${slot.name} 삭제`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className={fieldLabel}>
                        역할
                        <select
                          className={selectClass}
                          value={slot.kind}
                          onChange={(event) => patchSlot(slot.id, { kind: event.target.value as RmasSlotKind })}
                        >
                          {KIND_OPTIONS.map((kind) => (
                            <option key={kind} value={kind}>
                              {KIND_LABEL[kind]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={fieldLabel}>
                        프로바이더
                        <select
                          className={selectClass}
                          value={slot.providerProfileId}
                          onChange={(event) => patchSlot(slot.id, { providerProfileId: event.target.value })}
                        >
                          {providers.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={fieldLabel}>
                        모델
                        <select
                          className={selectClass}
                          value={slot.modelId}
                          onChange={(event) => patchSlot(slot.id, { modelId: event.target.value })}
                        >
                          <option value="">모델 선택…</option>
                          {modelIds.map((id) => (
                            <option key={id} value={id}>
                              {modelLabel(id)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className={fieldLabel}>
                      시스템 프롬프트
                      <Textarea
                        value={slot.systemPrompt}
                        onChange={(event) => patchSlot(slot.id, { systemPrompt: event.target.value })}
                        className="min-h-[60px] resize-y text-sm"
                      />
                    </label>
                  </div>
                );
              })}
              <Button type="button" variant="outline" onClick={addSlot} className="gap-1.5" disabled={draft.agents.length >= 12}>
                <Plus className="h-4 w-4" />
                에이전트 추가
              </Button>
            </div>
          </TabsContent>

          {/* ── 파이프라인 ── */}
          <TabsContent value="pipeline" className="max-h-[55vh] overflow-y-auto pr-1">
            <div className="flex flex-col gap-4 py-2">
              <label className={fieldLabel}>
                패턴
                <select
                  className={selectClass}
                  value={draft.pattern}
                  onChange={(event) => setDraft((current) => ({ ...current, pattern: event.target.value as RmasPattern }))}
                >
                  {RMAS_PATTERNS.map((pattern) => (
                    <option key={pattern} value={pattern}>
                      {PATTERN_LABEL[pattern]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-3 gap-2">
                <label className={fieldLabel}>
                  최대 반복
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className={inputClass}
                    value={draft.budgets.maxIterations}
                    onChange={(event) => patchBudget({ maxIterations: clampInt(event.target.value, 1, 50, 5) })}
                  />
                </label>
                <label className={fieldLabel}>
                  최대 토큰
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    className={inputClass}
                    value={draft.budgets.maxTotalTokens}
                    onChange={(event) => patchBudget({ maxTotalTokens: clampInt(event.target.value, 1_000, 5_000_000, 200_000) })}
                  />
                </label>
                <label className={fieldLabel}>
                  제한 시간(분)
                  <input
                    type="number"
                    min={1}
                    max={360}
                    className={inputClass}
                    value={draft.budgets.wallClockMinutes}
                    onChange={(event) => patchBudget({ wallClockMinutes: clampInt(event.target.value, 1, 360, 30) })}
                  />
                </label>
              </div>

              <label className={fieldLabel}>
                판정 담당 슬롯
                <select
                  className={selectClass}
                  value={draft.judgeSlotId ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, judgeSlotId: event.target.value || undefined }))
                  }
                >
                  <option value="">자동 (비평가 → 마지막 슬롯)</option>
                  {draft.agents.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.name}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">수용 기준</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        acceptanceCriteria: [
                          ...current.acceptanceCriteria,
                          { id: generateSlotId("crit"), text: "" },
                        ],
                      }))
                    }
                    disabled={draft.acceptanceCriteria.length >= 40}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    추가
                  </Button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {draft.acceptanceCriteria.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      기준이 없으면 판정은 목표 전반에 대한 종합 판단으로 이뤄집니다.
                    </p>
                  ) : (
                    draft.acceptanceCriteria.map((criterion, index) => (
                      <div key={criterion.id} className="flex items-center gap-2">
                        <input
                          className={inputClass}
                          placeholder={`기준 ${index + 1}`}
                          value={criterion.text}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              acceptanceCriteria: current.acceptanceCriteria.map((entry) =>
                                entry.id === criterion.id ? { ...entry, text: event.target.value } : entry,
                              ),
                            }))
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`기준 ${index + 1} 삭제`}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              acceptanceCriteria: current.acceptanceCriteria.filter((entry) => entry.id !== criterion.id),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" onClick={save}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
