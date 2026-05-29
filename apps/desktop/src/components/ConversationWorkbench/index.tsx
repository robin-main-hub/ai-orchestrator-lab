import React, { useState, useEffect, useRef, useCallback } from "react";
import type {
  ApprovalQueueItem,
  BranchExperiment,
  ContextPackTier,
  ConversationMessage,
  ModelDescriptor,
  PermissionMatrixSnapshot,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
import {
  attachmentAcceptForModel,
  createDefaultPersonaSettings,
  modelSupportsAnyAttachment,
} from "../../lib/helpers";
import { getConversationWorkbenchVisibility } from "../../lib/conversationWorkbenchVisibility";
import type {
  AgentConfigFile,
  AgentConfigTab,
  AgentPersonaSettings,
  DraftAttachment,
  PendingProviderRetry,
  WorkbenchAgent,
  AgentVisualSettings,
  AgentActivityStatus,
} from "../../types";
import { AgentConfigDrawer } from "../AgentConfigDrawer";

// Sub-components
import { WorkbenchHeader } from "./WorkbenchHeader";
import { MessageThread } from "./MessageThread";
import { ActionStrip } from "./ActionStrip";
import { Composer } from "./Composer";
import { InboxApprovalStrip } from "./ApprovalQueue";

export function ConversationWorkbench({
  activeSessionId,
  agentConfigPanel,
  configFiles,
  agentPersona,
  agents,
  branchExperiments,
  contextPackTier,
  draftAttachments,
  draftMessage,
  maxDraftAttachments,
  messages,
  onAddDraftAttachments,
  onAdoptBranch,
  onApprovePermission,
  onBackupProjection,
  onContextPackTierChange,
  onCreateBranch,
  onCreateAgentRun,
  onCreateCodingPacket,
  onDraftMessageChange,
  onImportTelegram,
  onPromoteToDebate,
  onRejectPermission,
  onRemoveDraftAttachment,
  onSelectAgent,
  onSendMessage,
  onCloseAgentConfig,
  onCloseAgentConfig: _unusedClose, // preserve interface signatures if needed
  onOpenAgentConfig,
  onUpdateAgentConfig,
  onUpdateAgentPersona,
  pendingProviderRetry,
  permissionSnapshot,
  selectedAgent,
  selectedAgentId,
  selectedModel,
  selectedProvider,
  agentVisualsById,
  agentActivityById,
  isStreaming = false,
  onCancelStream,
}: {
  activeSessionId: string;
  agentConfigPanel: { open: boolean; tab: AgentConfigTab };
  configFiles: AgentConfigFile[];
  agentPersona?: AgentPersonaSettings;
  agents: WorkbenchAgent[];
  branchExperiments: BranchExperiment[];
  contextPackTier: ContextPackTier;
  draftAttachments: DraftAttachment[];
  draftMessage: string;
  maxDraftAttachments: number;
  messages: ConversationMessage[];
  onAddDraftAttachments: (files: FileList | null) => void;
  onAdoptBranch: () => void;
  onApprovePermission: (sourceItemId: string) => void;
  onBackupProjection: () => void;
  onContextPackTierChange: (tier: ContextPackTier) => void;
  onCreateBranch: () => void;
  onCreateAgentRun: () => void;
  onCreateCodingPacket: () => void;
  onDraftMessageChange: (value: string) => void;
  onImportTelegram: () => void;
  onPromoteToDebate: () => void;
  onRejectPermission: (sourceItemId: string) => void;
  onRemoveDraftAttachment: (attachmentId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onSendMessage: (replyTo?: { id: string; role: string; content: string; senderLabel: string }) => void;
  onCloseAgentConfig: () => void;
  onOpenAgentConfig: (tab: AgentConfigTab) => void;
  onUpdateAgentConfig: (patch: Partial<Pick<WorkbenchAgent, "configSource" | "soulMode">>) => void;
  onUpdateAgentPersona: (patch: Partial<AgentPersonaSettings>) => void;
  pendingProviderRetry?: PendingProviderRetry;
  permissionSnapshot: PermissionMatrixSnapshot;
  selectedAgent?: WorkbenchAgent;
  selectedAgentId?: string;
  selectedModel?: ModelDescriptor;
  selectedProvider?: ProviderProfile;
  agentVisualsById?: Record<string, AgentVisualSettings>;
  agentActivityById?: Record<string, AgentActivityStatus>;
  isStreaming?: boolean;
  onCancelStream?: () => void;
}) {
  const [replyingToMessage, setReplyingToMessage] = useState<ConversationMessage | undefined>(undefined);
  const [reactions, setReactions] = useState<Record<string, { emoji: string; count: number; users: string[] }[]>>(() => {
    try {
      const stored = localStorage.getItem(`chat_reactions_${activeSessionId}`);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem("chat_audio_muted") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`chat_reactions_${activeSessionId}`, JSON.stringify(reactions));
    } catch (e) {
      console.error(e);
    }
  }, [reactions, activeSessionId]);

  const toggleMute = () => {
    setIsMuted((prev) => {
      const newVal = !prev;
      try {
        localStorage.setItem("chat_audio_muted", String(newVal));
      } catch (e) {
        console.error(e);
      }
      return newVal;
    });
  };

  const prevMessagesCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessagesCount.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg) {
        if (lastMsg.role === "user") {
          if (!isMuted) playHapticSound("send");
        } else {
          if (!isMuted) playHapticSound("receive");
        }
      }
    }
    prevMessagesCount.current = messages.length;
  }, [messages, isMuted]);

  const handleToggleReaction = React.useCallback((messageId: string, emoji: string) => {
    setReactions((prev) => {
      const msgReactions = prev[messageId] || [];
      const existing = msgReactions.find((r) => r.emoji === emoji);
      let updated;
      if (existing) {
        if (existing.users.includes("user")) {
          const nextUsers = existing.users.filter((u) => u !== "user");
          if (nextUsers.length === 0) {
            updated = msgReactions.filter((r) => r.emoji !== emoji);
          } else {
            updated = msgReactions.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count - 1, users: nextUsers } : r
            );
          }
        } else {
          updated = msgReactions.map((r) =>
            r.emoji === emoji ? { ...r, count: r.count + 1, users: [...r.users, "user"] } : r
          );
        }
      } else {
        updated = [...msgReactions, { emoji, count: 1, users: ["user"] }];
      }

      const isUserReacting = !existing || !existing.users.includes("user");
      if (isUserReacting && agents.length > 0) {
        const activeAgents = agents.filter(a => a.id !== selectedAgentId);
        if (activeAgents.length > 0) {
          const swarmCount = Math.min(2, Math.floor(Math.random() * 2) + 1);
          const chosenAgents: string[] = [];
          for (let i = 0; i < swarmCount; i++) {
            const randAgent = activeAgents[Math.floor(Math.random() * activeAgents.length)];
            if (randAgent && randAgent.name && !chosenAgents.includes(randAgent.name)) {
              chosenAgents.push(randAgent.name);
            }
          }
          
          setTimeout(() => {
            setReactions((currentReactions) => {
              const currentMsgReactions = currentReactions[messageId] || [];
              let newMsgReactions = [...currentMsgReactions];

              chosenAgents.forEach((agentName) => {
                const randomEmoji = ["👍", "❤️", "🔥", "😮"][Math.floor(Math.random() * 4)] || "👍";
                const reactNode = newMsgReactions.find((r) => r.emoji === randomEmoji);
                if (reactNode) {
                  if (!reactNode.users.includes(agentName)) {
                    newMsgReactions = newMsgReactions.map((r) =>
                      r.emoji === randomEmoji ? { ...r, count: r.count + 1, users: [...r.users, agentName] } : r
                    );
                  }
                } else {
                  newMsgReactions.push({ emoji: randomEmoji, count: 1, users: [agentName] });
                }
              });

              if (!isMuted) playHapticSound("receive");
              return {
                ...currentReactions,
                [messageId]: newMsgReactions,
              };
            });
          }, 800 + Math.random() * 1200);
        }
      }

      return {
        ...prev,
        [messageId]: updated,
      };
    });
  }, [agents, selectedAgentId, isMuted]);

  const handleSendMessage = () => {
    const replyPayload = replyingToMessage
      ? {
          id: replyingToMessage.id,
          role: replyingToMessage.role,
          content: replyingToMessage.content,
          senderLabel: replyingToMessage.role === "user" ? "사용자" : (selectedAgent?.name ?? "봇"),
        }
      : undefined;

    onSendMessage(replyPayload);
    setReplyingToMessage(undefined);
  };

  const persona = agentPersona ?? (selectedAgent ? createDefaultPersonaSettings(selectedAgent) : undefined);
  const memoryMode = selectedProvider?.trustLevel === "trusted" ? "auto" : "manual";
  const attachmentEnabled = Boolean(selectedAgent && modelSupportsAnyAttachment(selectedModel));
  const attachmentAccept = attachmentAcceptForModel(selectedModel);
  const attachmentLimitReached = draftAttachments.length >= maxDraftAttachments;
  const adoptedBranchCount = branchExperiments.filter((branch) => branch.status === "adopted").length;
  const latestBranch = branchExperiments[0];
  const canDelegate =
    selectedAgent?.role === "companion" || selectedAgent?.role === "orchestrator";
  
  const delegationCount = messages.filter(
    (m) => m.role === "assistant" && (m.metadata?.delegationTags || m.metadata?.delegations)
  ).length;

  const workbenchVisibility = getConversationWorkbenchVisibility({
    delegationItemCount: delegationCount,
    pendingApprovalCount: permissionSnapshot.queue.length,
    pendingProviderRetry: Boolean(pendingProviderRetry),
  });

  return (
    <section className="conversation-workbench flex h-full flex-col bg-background">
      {/* ── Header ───────────────────────────────────────────────── */}
      <WorkbenchHeader
        agents={agents}
        contextPackTier={contextPackTier}
        memoryMode={memoryMode}
        onContextPackTierChange={onContextPackTierChange}
        onOpenAgentConfig={onOpenAgentConfig}
        onSelectAgent={onSelectAgent}
        persona={persona}
        selectedAgent={selectedAgent}
        selectedAgentId={selectedAgentId}
        selectedModel={selectedModel}
        selectedProvider={selectedProvider}
        sessionId={activeSessionId}
        agentVisualsById={agentVisualsById}
        agentActivityById={agentActivityById}
        isMuted={isMuted}
        onToggleMute={toggleMute}
      />

      {agentConfigPanel.open && selectedAgent && persona ? (
        <AgentConfigDrawer
          activeTab={agentConfigPanel.tab}
          agent={selectedAgent}
          configFiles={configFiles}
          memoryMode={memoryMode}
          onClose={onCloseAgentConfig}
          onUpdateAgentConfig={onUpdateAgentConfig}
          onUpdatePersona={onUpdateAgentPersona}
          persona={persona}
          provider={selectedProvider}
        />
      ) : null}

      {/* ── Message thread + inline panels ───────────────────────── */}
      <MessageThread
        messages={messages}
        selectedAgent={selectedAgent}
        workbenchVisibility={workbenchVisibility}
        permissionSnapshotQueue={permissionSnapshot.queue}
        pendingProviderRetry={pendingProviderRetry}
        onApprovePermission={onApprovePermission}
        onRejectPermission={onRejectPermission}
        agents={agents}
        agentVisualsById={agentVisualsById}
        agentActivityById={agentActivityById}
        reactions={reactions}
        onToggleReaction={handleToggleReaction}
        replyingToMessage={replyingToMessage}
        onSetReplyingToMessage={setReplyingToMessage}
      />

      {/* ── Action strip ─────────────────────────────────────────── */}
      <ActionStrip
        adoptedBranchCount={adoptedBranchCount}
        branchExperiments={branchExperiments}
        canDelegate={canDelegate}
        latestBranch={latestBranch}
        onAdoptBranch={onAdoptBranch}
        onBackupProjection={onBackupProjection}
        onCreateAgentRun={onCreateAgentRun}
        onCreateBranch={onCreateBranch}
        onCreateCodingPacket={onCreateCodingPacket}
        onImportTelegram={onImportTelegram}
        onPromoteToDebate={onPromoteToDebate}
        showOverflowBranchControls={workbenchVisibility.showOverflowBranchControls}
      />

      {/* ── Composer ─────────────────────────────────────────────── */}
      <Composer
        attachmentAccept={attachmentAccept}
        attachmentEnabled={attachmentEnabled}
        attachmentLimitReached={attachmentLimitReached}
        draftAttachments={draftAttachments}
        draftMessage={draftMessage}
        maxDraftAttachments={maxDraftAttachments}
        onAddDraftAttachments={onAddDraftAttachments}
        onDraftMessageChange={onDraftMessageChange}
        onRemoveDraftAttachment={onRemoveDraftAttachment}
        onSendMessage={handleSendMessage}
        selectedAgent={selectedAgent}
        selectedModel={selectedModel}
        showDelegationChips={workbenchVisibility.showComposerDelegationChips}
        replyingToMessage={replyingToMessage}
        onCancelReply={() => setReplyingToMessage(undefined)}
        isStreaming={isStreaming}
        onCancelStream={onCancelStream}
      />

      {/* ── Assistant Inbox approval strip ───────────────────────── */}
      <InboxApprovalStrip queue={permissionSnapshot.queue} />
    </section>
  );
}

function playHapticSound(type: "send" | "receive") {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    if (type === "send") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(750, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.06);
      
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.12);
      
      gain.gain.setValueAtTime(0.10, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    }
  } catch (err) {
    console.warn("Failed to play haptic sound:", err);
  }
}
