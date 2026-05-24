import { useState } from "react";
import { Chat } from "./screens/Chat";
import { Settings } from "./screens/Settings";
import { OptionDrawer } from "./components/OptionDrawer";
import { useViewportInsets } from "./hooks/useViewportInsets";
import type { MobileScreen } from "./types";

export default function App() {
  const [screen, setScreen] = useState<MobileScreen>("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);

  useViewportInsets();

  const handleNewConversation = () => {
    setChatKey((k) => k + 1);
    setDrawerOpen(false);
    setScreen("chat");
  };

  const handleOpenSettings = () => {
    setDrawerOpen(false);
    setScreen("settings");
  };

  const handleSignOut = () => {
    setDrawerOpen(false);
    // Wired to real auth in a follow-up PR.
    console.info("[mobile] sign out requested (not yet wired)");
  };

  return (
    <div className="app">
      {screen === "chat" ? (
        <Chat key={chatKey} onOpenDrawer={() => setDrawerOpen(true)} />
      ) : (
        <Settings onBack={() => setScreen("chat")} />
      )}
      <OptionDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNewConversation={handleNewConversation}
        onOpenSettings={handleOpenSettings}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
