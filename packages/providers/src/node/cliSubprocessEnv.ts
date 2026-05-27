export function buildCliSubprocessEnv(extraEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowedKeys = [
    "PATH",
    "HOME",
    "USER",
    "USERNAME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "SHELL",
    "TERM",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SystemRoot",
    "ComSpec",
  ];

  const env: NodeJS.ProcessEnv = {};

  for (const key of allowedKeys) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }

  for (const [key, value] of Object.entries(extraEnv ?? {})) {
    if (value !== undefined) env[key] = value;
  }

  return env;
}
