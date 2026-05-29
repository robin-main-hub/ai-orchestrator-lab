// OAuth authentication browser launcher for Tauri / Web environments
export async function triggerReauth(slot: string = "grok-oauth-1") {
  // 백엔드 세션 갱신 API 또는 OAuth 로그인 URL로 연결
  // (실제 포트는 DGX Endpoint 규칙에 맞춰 4317 기본값으로 지정)
  const isGrok2 = slot === "grok-oauth-2";
  const homeEnv = isGrok2 ? "C:\\Users\\Robin\\.grok2" : "C:\\Users\\Robin\\.grok";
  
  // xAI Auth URL 또는 로컬 백엔드 서버의 oauth trigger 엔드포인트
  const authUrl = `https://auth.x.ai/oauth2/authorize?client_id=b1a00492-073a-47ea-816f-4c329264a828&redirect_uri=http%3A%2F%2F127.0.0.1%3A6963%2Fcallback&scope=openid%20profile%20email%20offline_access%20grok-cli%3Aaccess%20api%3Aaccess&state=${slot}`;

  // Tauri 환경인지 식별
  const isTauri = typeof window !== "undefined" && (window as any).__TAURI__ !== undefined;

  console.info(`[Auth Helper] Triggering OAuth re-auth flow for ${slot}. isTauri: ${isTauri}`);

  if (isTauri) {
    try {
      // Tauri 1.x / 2.x API 호환성을 고려한 dynamic import 구조
      const apiPath = "@tauri-apps/api";
      const tauriApi = (await import(/* @vite-ignore */ apiPath)) as any;
      if (tauriApi.shell && typeof tauriApi.shell.open === "function") {
        await tauriApi.shell.open(authUrl);
      } else {
        // Tauri 2.x 스타일 또는 plugin-shell
        const pluginShellPath = "@tauri-apps/plugin-shell";
        const { open } = await import(/* @vite-ignore */ pluginShellPath) as any;
        await open(authUrl);
      }
    } catch (err) {
      console.warn("[Auth Helper] Tauri shell import/open failed, falling back to window.open:", err);
      window.open(authUrl, "_blank", "width=600,height=800");
    }
  } else {
    // 일반 웹/브라우저 환경에서는 새 창 열기
    window.open(authUrl, "_blank", "width=600,height=800");
  }
}
