export type ControlQueueRefreshStatus = "idle" | "loading" | "error" | "ready";

export function shouldRefreshControlQueueOnOpen({
  isOpen,
  previousOpen,
  status,
}: {
  isOpen: boolean;
  previousOpen: boolean;
  status: ControlQueueRefreshStatus;
}) {
  return isOpen && !previousOpen && status !== "loading";
}
