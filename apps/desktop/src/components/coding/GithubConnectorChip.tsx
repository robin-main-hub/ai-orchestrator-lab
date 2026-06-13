import { useEffect, useState } from "react";
import { Github } from "lucide-react";
import {
  fetchGithubConnectorStatus,
  githubConnectorChipLabel,
  type GithubConnectorView,
} from "../../lib/githubConnector";

/**
 * 코딩 메뉴의 GitHub 읽기 전용 커넥터 상태 칩. 마운트 시 서버에 상태만 물어본다
 * (미설정이면 서버가 GitHub를 호출하지 않으므로 라이브 연결이 아니다). 토큰은 서버
 * env에만 있고 여기로 오지 않는다. 모든 판정은 테스트된 lib에 위임한다.
 */
export function GithubConnectorChip({ serverBaseUrl }: { serverBaseUrl?: string | string[] }) {
  const [view, setView] = useState<GithubConnectorView>({ state: "unknown" });

  useEffect(() => {
    let cancelled = false;
    void fetchGithubConnectorStatus(serverBaseUrl).then((next) => {
      if (!cancelled) setView(next);
    });
    return () => {
      cancelled = true;
    };
  }, [serverBaseUrl]);

  const label = githubConnectorChipLabel(view);
  return (
    <span className={`coding-gh-chip coding-gh-chip--${label.tone}`} title={label.title}>
      <Github size={11} aria-hidden />
      {label.text}
    </span>
  );
}
