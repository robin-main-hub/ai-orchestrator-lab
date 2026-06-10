import { Bot } from "lucide-react";
import type { VnLine } from "../lib/debateVnScript";

/**
 * Visual-novel "debate battle" view: each line is a VN dialogue box with a
 * speaker name plate (+ portrait when available), objections get a counter
 * flash, and the final-decision line gets a FINISH banner. Presentational +
 * static-markup tested; character sprites/portraits are optional (slots).
 */
export function DebateVnView({
  lines,
  displayNameFor,
  portraitFor,
}: {
  lines: ReadonlyArray<VnLine>;
  displayNameFor?: (speaker: string) => string;
  portraitFor?: (speaker: string) => string | undefined;
}) {
  if (lines.length === 0) {
    return <p className="debate-vn-empty">아직 대사가 없습니다 — 토론이 진행되면 VN으로 흐릅니다.</p>;
  }
  return (
    <ol className="debate-vn">
      {lines.map((line, index) => {
        const name = displayNameFor?.(line.speaker) ?? line.speaker;
        const portrait = portraitFor?.(line.speaker);
        return (
          <li key={index} className={`debate-vn-line vn-${line.effect}`}>
            {line.effect === "finish" ? <div className="debate-vn-finish" aria-hidden="true">FINISH</div> : null}
            <div className="debate-vn-box">
              <span className="debate-vn-portrait" aria-hidden="true">
                {portrait ? <img src={portrait} alt="" width={36} height={36} /> : <Bot size={20} />}
              </span>
              <div className="debate-vn-body">
                <span className="debate-vn-name">
                  {name}
                  {line.effect === "counter" ? <em className="debate-vn-counter-tag">COUNTER</em> : null}
                </span>
                <p className="debate-vn-text">{line.text}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
