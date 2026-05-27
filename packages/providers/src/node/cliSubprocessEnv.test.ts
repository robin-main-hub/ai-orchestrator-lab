import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCliSubprocessEnv } from "./cliSubprocessEnv.js";

describe("buildCliSubprocessEnv", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("copies allowed environment variables and filters out unallowed ones", () => {
    process.env = {
      PATH: "/usr/bin",
      HOME: "/home/test",
      MY_SECRET_API_KEY: "super-secret-value",
      OTHER_VAR: "another-value",
    };

    const env = buildCliSubprocessEnv();

    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/test");
    expect(env.MY_SECRET_API_KEY).toBeUndefined();
    expect(env.OTHER_VAR).toBeUndefined();
  });

  it("merges extra environment variables", () => {
    process.env = {
      PATH: "/usr/bin",
      HOME: "/home/test",
    };

    const env = buildCliSubprocessEnv({
      EXTRA_VAR: "extra",
      PATH: "/custom/path",
    });

    expect(env.PATH).toBe("/custom/path");
    expect(env.HOME).toBe("/home/test");
    expect(env.EXTRA_VAR).toBe("extra");
  });

  it("filters out undefined values from both process.env and extraEnv", () => {
    process.env = {
      PATH: "/usr/bin",
      HOME: undefined as unknown as string,
    };

    const env = buildCliSubprocessEnv({
      EXTRA_VAR: undefined,
      OTHER_VAR: "value",
    });

    expect(env.PATH).toBe("/usr/bin");
    expect("HOME" in env).toBe(false);
    expect("EXTRA_VAR" in env).toBe(false);
    expect(env.OTHER_VAR).toBe("value");
  });
});
