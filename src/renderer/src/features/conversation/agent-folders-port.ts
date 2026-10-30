// The bridge calls behind an agent's Folders row, the Folders page and the chat's folder drop. Only
// the local server has them: the Team API does not carry an agent's folders.

import type { AgentFolderCalls } from "@openownbot/ui/features/conversation/AgentFolders";

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function agentFolderCalls(): AgentFolderCalls {
  return {
    list: (agentId) => window.openownbot.agent.listAgentFolders(agentId),
    choose: (agentId, replace) =>
      window.openownbot.agent.chooseAgentFolder(replace === undefined ? { agentId } : { agentId, replace }),
    add: (agentId, path) => window.openownbot.agent.addAgentFolder({ agentId, path }),
    remove: (agentId, path) => window.openownbot.agent.removeAgentFolder({ agentId, path }),
    drop: (agentId, folder) => window.openownbot.agent.addDroppedAgentFolder(agentId, folder),
    exclude: (agentId) => window.openownbot.agent.chooseAgentExclusion(agentId),
    addExclusion: (agentId, path) => window.openownbot.agent.addAgentExclusion({ agentId, path }),
    include: (agentId, path) => window.openownbot.agent.removeAgentExclusion({ agentId, path }),
  };
}
