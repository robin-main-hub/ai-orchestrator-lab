import { useCallback, useMemo, useState } from "react";
import type { ProviderCompletionAttachment } from "@ai-orchestrator/protocol";
import type { DraftAttachment } from "../types";
import { createAttachmentProcessingPlan, type AttachmentProcessingPlan } from "./attachmentProcessing";
import { createDraftAttachment } from "./helpers";
import { readAttachmentContent, toProviderAttachments } from "./attachmentContent";

/**
 * Headless draft-attachment controller. Composes the SAME pure helpers the
 * conversation composer uses (capability planning, draft record creation,
 * content hydration) — the only thing it owns is the React state wiring, so the
 * coding composer can reuse the honest accept/reject/hydrate pipeline without
 * copy-pasting it.
 *
 * Hydration mirrors the conversation path: accepted files start metadata-only
 * and have their bytes read in the background (images → data URL, text → inline
 * body). A read failure degrades to metadata-only; sending is never blocked.
 */
export type UseDraftAttachments = {
  attachments: DraftAttachment[];
  rejectedPlans: AttachmentProcessingPlan[];
  add: (fileList: FileList | File[] | null) => void;
  remove: (id: string) => void;
  clearRejected: () => void;
  /** drop all draft + rejection state (call after a successful send) */
  reset: () => void;
  /** snapshot the current (hydrated-so-far) attachments as provider riders; does not clear */
  toProvider: () => ProviderCompletionAttachment[] | undefined;
};

export function useDraftAttachments(options: {
  modelModalities: string[];
  maxCount: number;
}): UseDraftAttachments {
  const { modelModalities, maxCount } = options;
  const modalityKey = useMemo(() => modelModalities.join(","), [modelModalities]);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [rejectedPlans, setRejectedPlans] = useState<AttachmentProcessingPlan[]>([]);

  const add = useCallback(
    (fileList: FileList | File[] | null) => {
      if (!fileList) return;
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const plans = createAttachmentProcessingPlan({
        currentAttachmentCount: attachments.length,
        files,
        maxAttachmentCount: maxCount,
        modelModalities: modalityKey ? modalityKey.split(",") : [],
      });
      const acceptedPairs = files.flatMap((file, index) => {
        const plan = plans[index];
        if (!plan || plan.status !== "accepted") return [];
        return [
          {
            file,
            attachment: {
              ...createDraftAttachment(file),
              processingMode: plan.processingMode,
              processingStatus: plan.status,
              processingReason: plan.reason,
            } satisfies DraftAttachment,
          },
        ];
      });

      setRejectedPlans(plans.filter((plan) => plan.status === "rejected"));
      if (acceptedPairs.length === 0) return;

      setAttachments((current) => [...current, ...acceptedPairs.map((pair) => pair.attachment)].slice(0, maxCount));
      for (const pair of acceptedPairs) {
        void readAttachmentContent(pair.file, pair.attachment).then((hydrated) => {
          if (hydrated === pair.attachment) return;
          setAttachments((current) =>
            current.map((entry) => (entry.id === pair.attachment.id ? { ...entry, ...hydrated } : entry)),
          );
        });
      }
    },
    [attachments, maxCount, modalityKey],
  );

  const remove = useCallback((id: string) => {
    setAttachments((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const clearRejected = useCallback(() => setRejectedPlans([]), []);

  const reset = useCallback(() => {
    setAttachments([]);
    setRejectedPlans([]);
  }, []);

  const toProvider = useCallback(() => toProviderAttachments(attachments), [attachments]);

  return { attachments, rejectedPlans, add, remove, clearRejected, reset, toProvider };
}
