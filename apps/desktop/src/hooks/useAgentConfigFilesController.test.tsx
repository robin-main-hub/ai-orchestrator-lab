// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import { useAgentConfigFilesController } from "./useAgentConfigFilesController";
import { selectAgentRuntimeConfigFiles } from "../lib/agentRuntimeConfig";
import type { WorkbenchAgent } from "../types";

afterEach(() => cleanup());

const architect: WorkbenchAgent = {
  id: "agent_architect",
  name: "Architect",
  kind: "virtual",
  role: "architect",
  soulMode: "summary",
  configSource: "internal",
  enabled: true,
};

function makeAppendEvent() {
  return vi.fn(<T,>(type: string, payload: T): EventEnvelope<T> => ({
    id: `event_${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
  }) as unknown as EventEnvelope<T>);
}

function setup() {
  const appendEvent = makeAppendEvent();
  const rendered = renderHook(() => useAgentConfigFilesController({ appendEvent }));
  return { appendEvent, rendered };
}

describe("useAgentConfigFilesController — CFG-D semantics", () => {
  it("duplicates a config file as a fresh v1 copy (not source.version + 1)", () => {
    const { appendEvent, rendered } = setup();
    const source = rendered.result.current.agentConfigFiles[0]!;

    act(() => rendered.result.current.handleDuplicateConfigFile(source.id));

    const duplicated = rendered.result.current.agentConfigFiles[0]!;
    expect(duplicated.id).not.toBe(source.id);
    expect(duplicated.label).toBe(`${source.label} 복사본`);
    expect(duplicated.version).toBe(1);

    // 이벤트 payload shape 불변(필드 4종 그대로).
    const call = appendEvent.mock.calls.find(([type]) => type === "agent.config_file.duplicated");
    expect(call).toBeDefined();
    expect(Object.keys(call![1] as Record<string, unknown>).sort()).toEqual(
      ["configFileId", "kind", "rawSecretPersisted", "sourceConfigFileId"].sort(),
    );
  });

  it("save records a checkpoint: version +1, updatedAt bumped, same event payload shape", () => {
    const { appendEvent, rendered } = setup();
    const source = rendered.result.current.agentConfigFiles[0]!;
    expect(source.version).toBe(1);

    act(() => rendered.result.current.handleSaveConfigFile(source.id));

    const saved = rendered.result.current.agentConfigFiles.find((file) => file.id === source.id)!;
    expect(saved.version).toBe(2);
    expect(Date.parse(saved.updatedAt)).toBeGreaterThanOrEqual(Date.parse(source.updatedAt));

    const call = appendEvent.mock.calls.find(([type]) => type === "agent.config_file.saved");
    expect(call).toBeDefined();
    const payload = call![1] as Record<string, unknown>;
    // payload shape 불변(필드 6종), version 값만 새 체크포인트 버전.
    expect(Object.keys(payload).sort()).toEqual(
      ["configFileId", "kind", "label", "path", "rawSecretPersisted", "version"].sort(),
    );
    expect(payload.version).toBe(2);

    // 체크포인트 반복 시 단조 증가.
    act(() => rendered.result.current.handleSaveConfigFile(source.id));
    expect(rendered.result.current.agentConfigFiles.find((file) => file.id === source.id)!.version).toBe(3);
  });

  it("keeps runtime injection consistent with UI wear edits (agentRuntimeConfig untouched)", () => {
    const { rendered } = setup();
    const file = rendered.result.current.agentConfigFiles.find(
      (candidate) => candidate.id === "config_soul_orchestrator_direct_v1",
    )!;
    // 초기: architect 는 이 SOUL 파일을 입고 있지 않다.
    expect(
      selectAgentRuntimeConfigFiles(architect, rendered.result.current.agentConfigFiles).map((f) => f.id),
    ).not.toContain(file.id);

    // UI 착용 편집과 동일 경로: onUpdateConfigFile(id, { linkedAgentIds }).
    act(() =>
      rendered.result.current.handleUpdateConfigFile(file.id, {
        linkedAgentIds: [...file.linkedAgentIds, architect.id],
      }),
    );

    // 런타임 주입 셀렉터가 UI 표시(착용 스택)와 같은 결과를 낸다.
    const runtimeFiles = selectAgentRuntimeConfigFiles(architect, rendered.result.current.agentConfigFiles);
    expect(runtimeFiles.map((f) => f.id)).toContain(file.id);

    // 해제도 동일 경로로 반영된다.
    act(() =>
      rendered.result.current.handleUpdateConfigFile(file.id, {
        linkedAgentIds: file.linkedAgentIds,
      }),
    );
    expect(
      selectAgentRuntimeConfigFiles(architect, rendered.result.current.agentConfigFiles).map((f) => f.id),
    ).not.toContain(file.id);
  });
});
