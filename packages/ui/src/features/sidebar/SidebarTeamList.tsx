/**
 * The agents under the teams that the user made, in place of the sections. Like "Needs you" and
 * "Hidden", a team is not a place in the layout: its rows do not drag. An agent in two teams shows
 * under both, and the agents in no team come last.
 */

import { For, Show } from "solid-js";
import { useText } from "../../text";
import { SidebarAgentRow } from "./SidebarAgentRow";
import { useSidebarScope } from "./sidebar-scope";
import { groupAgentsByTeam } from "./sidebar-teams";

export function SidebarTeamList() {
  const { filteredChats, props } = useSidebarScope();
  const { t } = useText();
  const agents = () => filteredChats().flatMap((chat) => (chat.kind === "agent" ? [chat.agent] : []));
  const teams = () => groupAgentsByTeam(props.squads ?? [], agents());
  return (
    <>
      <For each={teams().groups} keyed={(group) => group.id}>
        {(group) => (
          <section class="sidebar-chat-group sidebar-section" aria-label={group().name}>
            <header>
              <h2 class="sidebar-section-name">{group().name}</h2>
            </header>
            <div class="sidebar-section-body">
              <For each={group().agents} keyed={(agent) => agent.id}>
                {(agent) => <SidebarAgentRow agent={agent()} fixed />}
              </For>
            </div>
          </section>
        )}
      </For>
      <Show when={teams().loose.length > 0}>
        <section class="sidebar-chat-group sidebar-section" aria-label={t("sidebar.team.none")}>
          <header>
            <h2 class="sidebar-section-name">{t("sidebar.team.none")}</h2>
          </header>
          <div class="sidebar-section-body">
            <For each={teams().loose} keyed={(agent) => agent.id}>
              {(agent) => <SidebarAgentRow agent={agent()} fixed />}
            </For>
          </div>
        </section>
      </Show>
    </>
  );
}
