// Slug to guide body, on the same terms as the news bodies: eager, so the prose
// is in the server's HTML rather than arriving after hydration.

import type { ArticleBody } from "../body";
import { AgenticAIDefinition } from "./agentic-ai-definition";
import { AIAgentsExamples } from "./ai-agents-examples";
import { AIAgentsVsAgenticAI } from "./ai-agents-vs-agentic-ai";
import { ImportGrokBotAgents } from "./import-grok-bot-agents";
import { ImportHermesAgents } from "./import-hermes-agents";
import { OpenOwnBot101 } from "./openownbot-101";
import { OpenOwnBotHostedServers } from "./openownbot-hosted-servers";
import { OpenOwnBotMarketplace } from "./openownbot-marketplace";
import { WhatAreAIAgents } from "./what-are-ai-agents";
import { WtfIsOpenOwnBot } from "./wtf-is-openownbot";

export const GUIDE_BODIES: Readonly<Record<string, ArticleBody>> = {
  "import-hermes-agents": ImportHermesAgents,
  "import-grok-bot-agents": ImportGrokBotAgents,
  "ai-agents-examples": AIAgentsExamples,
  "ai-agents-vs-agentic-ai": AIAgentsVsAgenticAI,
  "agentic-ai-definition": AgenticAIDefinition,
  "what-are-ai-agents": WhatAreAIAgents,
  "openownbot-101": OpenOwnBot101,
  "openownbot-hosted-servers": OpenOwnBotHostedServers,
  "openownbot-marketplace": OpenOwnBotMarketplace,
  "wtf-is-openownbot": WtfIsOpenOwnBot,
};
