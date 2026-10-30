// The fast decision model that picks the member for a channel request. Keys enter main here and stay in main.

import type { DecisionModelState, DecisionModelTestResult } from "@robot/contracts/ipc";
import { DECISION_TIMEOUT_MS, type DecisionMember, decideMember } from "../../backend/channel-decision";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { DecisionModelStore } from "../decision-model-store";
import { parseSaveDecisionModel } from "./decision-model-inputs";
import { handler, type IpcGroupHandlers, payloadHandler } from "./define-ipc-group";

export interface DecisionModelIpcDependencies {
  decisionModel: DecisionModelStore;
}

const SAMPLE_MEMBERS: readonly DecisionMember[] = [
  { id: "designer", name: "Mina", title: "Designer", description: "Designs screens and icons" },
  { id: "engineer", name: "Joon", title: "Engineer", description: "Fixes bugs and writes code" },
  { id: "writer", name: "Sora", title: "Writer", description: "Writes announcements and docs" },
];

/** One real request with made-up members, so that the user sees the key and the account work. */
async function trial(decisionModel: DecisionModelStore): Promise<DecisionModelTestResult> {
  const backend = decisionModel.resolve();
  if (!backend) return { ok: false, reason: "not-set-up", picked: null, milliseconds: 0 };
  const startedAt = Date.now();
  const result = await decideMember(
    backend,
    {
      title: "Trial",
      instructions: "",
      members: [...SAMPLE_MEMBERS],
      recent: [],
      request: "The login button crashes the app when it is clicked. Please fix the bug.",
    },
    { fetch: (url, init) => fetch(url, init), timeoutMs: DECISION_TIMEOUT_MS },
  );
  const milliseconds = Date.now() - startedAt;
  if (!result.ok) return { ok: false, reason: result.reason, picked: null, milliseconds };
  const picked = SAMPLE_MEMBERS.find((member) => member.id === result.agentId)?.name ?? null;
  return { ok: true, reason: null, picked, milliseconds };
}

export function decisionModelIpcHandlers({
  decisionModel,
}: DecisionModelIpcDependencies): Pick<IpcGroupHandlers, "decisionModel"> {
  return {
    decisionModel: {
      get: handler((): DecisionModelState => decisionModel.state()),
      test: handler((): Promise<DecisionModelTestResult> => trial(decisionModel)),
      save: payloadHandler(
        parseSaveDecisionModel,
        (input): Promise<DecisionModelState> => runCauseEffect(decisionModel.save(input)),
      ),
    },
  };
}
