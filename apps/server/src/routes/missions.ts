import type { IncomingMessage } from "node:http";
import {
  missionCreateRequestSchema,
  missionEventAppendRequestSchema,
  missionMergeRequestSchema,
  missionVerifyRequestSchema,
  type MissionCreateRequest,
  type MissionEventAppendRequest,
  type ServerMissionRecord,
} from "@ai-orchestrator/protocol";
import { MissionEventValidationError, type MissionStore } from "../missions/missionStore.js";

/**
 * Mission routes — 기존 tmux/approval route와 같은 DI 관용구.
 *
 *   POST /missions                    미션 생성(+초기 워커, capability 서버 재계산)
 *   GET  /missions                    materialized index 전체
 *   GET  /missions/:id                단일 미션
 *   POST /missions/:id/events         worker/artifact/verification/closed append
 *
 * append 창구를 /events 하나로 열어 route 폭발을 막는다.
 */
export type MissionRouteDependencies = {
  store: MissionStore;
  request: IncomingMessage;
  pathname: string;
  method?: string;
  readJsonBody: (request: IncomingMessage) => Promise<unknown>;
  isRequestBodyTooLargeError: (error: unknown) => error is { limit: number };
  respondJson: (statusCode: number, payload: unknown) => void;
};

const MISSION_PATH = /^\/missions\/([^/]+)$/;
const MISSION_EVENTS_PATH = /^\/missions\/([^/]+)\/events$/;
const MISSION_VERIFY_PATH = /^\/missions\/([^/]+)\/verify$/;
const MISSION_MERGE_PATH = /^\/missions\/([^/]+)\/merge$/;

export async function handleMissionRoute({
  store,
  request,
  pathname,
  method,
  readJsonBody,
  isRequestBodyTooLargeError,
  respondJson,
}: MissionRouteDependencies): Promise<boolean> {
  if (pathname === "/missions" && method === "POST") {
    let payload: MissionCreateRequest;
    try {
      payload = missionCreateRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_mission_create_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }

    try {
      const mission = await store.create(payload);
      respondJson(201, { mission });
    } catch (error) {
      respondJson(500, {
        error: "mission_create_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/missions" && method === "GET") {
    const missions: ServerMissionRecord[] = await store.list();
    respondJson(200, { missions });
    return true;
  }

  const eventsMatch = MISSION_EVENTS_PATH.exec(pathname);
  if (eventsMatch && method === "POST") {
    const missionId = decodeURIComponent(eventsMatch[1]!);
    let payload: MissionEventAppendRequest;
    try {
      payload = missionEventAppendRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_mission_event_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }

    try {
      const mission = await store.appendEvent(missionId, payload);
      if (!mission) {
        respondJson(404, { error: "mission_not_found", missionId });
        return true;
      }
      respondJson(202, { mission });
    } catch (error) {
      if (error instanceof MissionEventValidationError) {
        respondJson(400, { error: "invalid_mission_event_payload", message: error.message });
        return true;
      }
      respondJson(500, {
        error: "mission_event_append_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  const verifyMatch = MISSION_VERIFY_PATH.exec(pathname);
  if (verifyMatch && method === "POST") {
    const missionId = decodeURIComponent(verifyMatch[1]!);
    let payload;
    try {
      payload = missionVerifyRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_mission_verify_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
    try {
      const mission = await store.verify(missionId, payload);
      if (!mission) {
        respondJson(404, { error: "mission_not_found", missionId });
        return true;
      }
      respondJson(202, { mission });
    } catch (error) {
      if (error instanceof MissionEventValidationError) {
        respondJson(400, { error: "mission_verify_rejected", message: error.message });
        return true;
      }
      respondJson(500, {
        error: "mission_verify_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  const mergeMatch = MISSION_MERGE_PATH.exec(pathname);
  if (mergeMatch && method === "POST") {
    const missionId = decodeURIComponent(mergeMatch[1]!);
    let payload;
    try {
      payload = missionMergeRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_mission_merge_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
    try {
      const mission = await store.merge(missionId, payload);
      if (!mission) {
        respondJson(404, { error: "mission_not_found", missionId });
        return true;
      }
      respondJson(202, { mission });
    } catch (error) {
      if (error instanceof MissionEventValidationError) {
        respondJson(400, { error: "mission_merge_rejected", message: error.message });
        return true;
      }
      respondJson(500, {
        error: "mission_merge_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  const missionMatch = MISSION_PATH.exec(pathname);
  if (missionMatch && method === "GET") {
    const missionId = decodeURIComponent(missionMatch[1]!);
    const mission = await store.get(missionId);
    if (!mission) {
      respondJson(404, { error: "mission_not_found", missionId });
      return true;
    }
    respondJson(200, { mission });
    return true;
  }

  return false;
}
