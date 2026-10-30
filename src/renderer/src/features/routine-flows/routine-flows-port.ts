import type { OpenOwnBotDesktopApi, TestRoutineInput, UpdateRoutineInput } from "@robot/contracts/ipc";
import { type AgentChatPort, desktopAgentChatPort } from "../../agent-chat-port";
import { desktopEventRoutinesApi, type EventRoutinesApi } from "../conversation/routine-webhooks-api";

/**
 * What the routine canvas reaches on one host: the flows, the routines it runs and edits, the
 * events that make it stale, the open agent's conversation for the assistant, and the links in its
 * answers. The desktop app reaches this computer or a joined server through main; the web client
 * reaches its connected host over the Team API.
 */
export interface RoutineFlowsHost extends AgentChatPort {
  /** Called without a server: the host already names one. */
  flows: OpenOwnBotDesktopApi["routineFlows"];
  routines: {
    update(input: UpdateRoutineInput): Promise<unknown>;
    test(input: TestRoutineInput): Promise<unknown>;
  };
  /**
   * Webhook routines: their config, signing secret, relay status and a test run. Absent for an
   * account that may not manage them; the canvas then hides the config and refuses their edits.
   */
  readonly webhooks: Pick<EventRoutinesApi, "getStatus" | "saveRoutine" | "rotateSecret" | "testRoutine"> | undefined;
  openUrl(url: string): Promise<void>;
}

/**
 * The desktop adapter for one server. `window.openownbot` is read on each call: tests and stories
 * replace it per case. `webhooks` is read when the canvas asks, so a role change reaches it.
 */
export function desktopRoutineFlowsHost(serverId: string, webhooks: () => boolean): RoutineFlowsHost {
  const flows = () => window.openownbot.routineFlows;
  const agent = () => window.openownbot.agent;
  return {
    flows: {
      canvas: (agentId) => flows().canvas(agentId, serverId),
      savePosition: (input) => flows().savePosition(input, serverId),
      removePosition: (input) => flows().removePosition(input, serverId),
      connect: (input) => flows().connect(input, serverId),
      disconnect: (input) => flows().disconnect(input, serverId),
      updateLink: (input) => flows().updateLink(input, serverId),
    },
    routines: {
      update: (input) => agent().updateRoutine(input, serverId),
      test: (input) => agent().testRoutine(input, serverId),
    },
    get webhooks() {
      return webhooks() ? desktopEventRoutinesApi(serverId) : undefined;
    },
    ...desktopAgentChatPort(serverId),
    openUrl: (url) => window.openownbot.openUrl(url),
  };
}
