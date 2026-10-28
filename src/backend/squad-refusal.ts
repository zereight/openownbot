import type { SquadMessageCheck } from "@openbot/contracts/squads";
import { sourceText } from "@openbot/i18n/source";

const KEYS = {
  leavesSquad: "error.backend.squadLeaves",
  entersSquad: "error.backend.squadEnters",
  skipsRank: "error.backend.squadSkipsRank",
} as const;

/** What an agent reads when a team rule refuses its message. `agent` is who it tried to reach. */
export function squadRefusalText(refusal: Extract<SquadMessageCheck, { ok: false }>, agent: string): string {
  return sourceText(KEYS[refusal.reason], { agent, squad: refusal.squad });
}
