// The fast decision model that picks the member for a channel request. Keys enter main here and stay in main.

import type { DecisionModelState } from "@openbot/contracts/ipc";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { DecisionModelStore } from "../decision-model-store";
import { parseSaveDecisionModel } from "./decision-model-inputs";
import { handler, type IpcGroupHandlers, payloadHandler } from "./define-ipc-group";

export interface DecisionModelIpcDependencies {
  decisionModel: DecisionModelStore;
}

export function decisionModelIpcHandlers({
  decisionModel,
}: DecisionModelIpcDependencies): Pick<IpcGroupHandlers, "decisionModel"> {
  return {
    decisionModel: {
      get: handler((): DecisionModelState => decisionModel.state()),
      save: payloadHandler(
        parseSaveDecisionModel,
        (input): Promise<DecisionModelState> => runCauseEffect(decisionModel.save(input)),
      ),
    },
  };
}
