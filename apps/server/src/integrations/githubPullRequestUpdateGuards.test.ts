import { describe, expect, it } from "vitest";
import { evaluatePrUpdateGate } from "./githubPullRequestUpdateGuards";

describe("evaluatePrUpdateGate", () => {
  const baseOK = {
    repoFullName: "robin/lab",
    pullNumber: 7,
    allowlist: ["robin/lab"],
    tokenPresent: true,
  };

  it("token/allowlist 없으면 blocked", () => {
    expect(evaluatePrUpdateGate({ ...baseOK, newTitle: "x", tokenPresent: false }).kind).toBe("blocked");
    expect(evaluatePrUpdateGate({ ...baseOK, newTitle: "x", allowlist: [] }).kind).toBe("blocked");
    expect(evaluatePrUpdateGate({ ...baseOK, newTitle: "x", repoFullName: "evil/repo" }).kind).toBe("blocked");
  });

  it("title/body 둘 다 없으면 empty_change", () => {
    const v = evaluatePrUpdateGate({ ...baseOK });
    expect(v.kind).toBe("blocked");
    if (v.kind === "blocked") expect(v.reason).toBe("empty_change");
  });

  it("title에 제어문자(개행/CR/NUL/DEL/TAB)가 있으면 차단 — W5d 라벨 가드와 parity(회귀)", () => {
    // 드리프트 버그: newTitle은 단일 라인 필드로 plan store·응답 excerpt·GitHub PATCH로 흘러가는데,
    // W5d 라벨 가드는 같은 이유로 제어문자를 막던 반면 이 update 경로는 schema(bare z.string())·런타임
    // 어디서도 막지 않아 개행 주입(로그/응답 인젝션)이 통과했다(실측 kind=ok). body는 markdown이라
    // 개행이 정당 — title만 막는다.
    for (const bad of ["fix\ninjected", "fix\rinjected", "fix\u0000nul", "fix\u007fdel", "tab\tfield"]) {
      const v = evaluatePrUpdateGate({ ...baseOK, newTitle: bad });
      expect(v.kind, `should block: ${JSON.stringify(bad)}`).toBe("blocked");
      if (v.kind === "blocked") expect(v.reason).toBe("title_control_char");
    }
    // body의 개행은 정당 — 통과해야 함(오탐 방지)
    expect(evaluatePrUpdateGate({ ...baseOK, newBody: "line1\nline2\n" }).kind).toBe("ok");
    // 정상 title 단독 변경은 통과
    const okTitle = evaluatePrUpdateGate({ ...baseOK, newTitle: "Update title" });
    expect(okTitle.kind).toBe("ok");
    if (okTitle.kind === "ok") expect(okTitle.newTitle).toBe("Update title");
  });
});
