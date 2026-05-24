import { useState } from "react";
import { Chat } from "./screens/Chat";
import { Souls } from "./screens/Souls";
import { System } from "./screens/System";
import { More } from "./screens/More";
import { TabBar } from "./components/TabBar";
import { useViewportInsets } from "./hooks/useViewportInsets";
import { seedSouls } from "./seeds";
import type { MobileTab } from "./types";

const ACTIVE_SOUL_STORAGE = "mobile.activeSoulId";

function loadActiveSoulId(): string {
  if (typeof localStorage === "undefined") return seedSouls[0]!.id;
  const stored = localStorage.getItem(ACTIVE_SOUL_STORAGE);
  if (stored && seedSouls.some((s) => s.id === stored)) return stored;
  return seedSouls[0]!.id;
}

export default function App() {
  const [tab, setTab] = useState<MobileTab>("chat");
  const [activeSoulId, setActiveSoulIdRaw] = useState<string>(() => loadActiveSoulId());

  useViewportInsets();

  const setActiveSoulId = (soulId: string) => {
    setActiveSoulIdRaw(soulId);
    try {
      localStorage.setItem(ACTIVE_SOUL_STORAGE, soulId);
    } catch (err) {
      console.warn("[mobile] failed to persist active SOUL", err);
    }
  };

  const handleSignOut = () => {
    // Wired to real auth in a follow-up PR.
    console.info("[mobile] sign out requested (not yet wired)");
  };

  return (
    <div className="app">
      <div className="app__body">
        {tab === "chat" ? (
          <Chat
            souls={seedSouls}
            activeSoulId={activeSoulId}
            onChangeSoul={setActiveSoulId}
          />
        ) : tab === "souls" ? (
          <Souls
            activeSoulId={activeSoulId}
            onSelectSoul={setActiveSoulId}
            onStartChatWith={(soulId) => {
              setActiveSoulId(soulId);
              setTab("chat");
            }}
          />
        ) : tab === "system" ? (
          <System />
        ) : (
          <More onSignOut={handleSignOut} />
        )}
      </div>
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
