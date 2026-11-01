import { Dynamic } from "@solidjs/web";
import { For, Match, Show, Switch } from "solid-js";
import { Button } from "../../button";
import { Activity, Circle, CircleCheck, CircleX, LoaderCircle, X } from "../../icons";
import { useText } from "../../text";
import { ShellStatusAvatar } from "./ShellStatusAvatar";
import type { ShellMember, ShellPlanStep } from "./shell-types";

const PLAN_ICON = { todo: Circle, running: LoaderCircle, done: CircleCheck, failed: CircleX } as const;
const PLAN_STATE = {
  todo: "shell.plan.todo",
  running: "shell.plan.running",
  done: "shell.plan.done",
  failed: "shell.plan.failed",
} as const;

/** The parts of an agent's work that it gave to others, each with its state. */
function PlanSteps(props: { steps: readonly ShellPlanStep[] }) {
  const { t } = useText();
  return (
    <ul class="shell-plan" aria-label={t("shell.plan.label")}>
      <For each={props.steps}>
        {(step) => (
          <li class={`shell-plan-step shell-plan-step-${step.state}`}>
            <Dynamic component={PLAN_ICON[step.state]} aria-hidden="true" />
            <span class="shell-plan-label">{step.label}</span>
            <span class="sr-only">{t(PLAN_STATE[step.state])}</span>
          </li>
        )}
      </For>
    </ul>
  );
}

/**
 * The agents of the open channel with what each one does now, as one card each. An approval is
 * answered in its card, a failed agent shows why, and an agent that split its work shows the parts as
 * a checklist, so the user does not open each chat to find the agent that waits.
 */
export function MemberPanel(props: {
  members: readonly ShellMember[];
  onHide: () => void;
  onAllow: (agentId: string) => void;
  onDeny: (agentId: string) => void;
}) {
  const { t } = useText();
  return (
    <aside class="shell-side" aria-label={t("shell.members.label")}>
      <header class="shell-side-header">
        <Activity aria-hidden="true" class="shell-side-icon" />
        <h2 class="shell-side-title">{t("shell.now.title")}</h2>
        <Button
          variant="ghost"
          class="shell-icon-button"
          aria-label={t("shell.members.hide")}
          title={t("shell.members.hide")}
          onClick={() => props.onHide()}
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <ul class="shell-members">
        <For each={props.members}>
          {(member) => (
            <li class={`shell-member shell-member-${member.state.kind}`}>
              <ShellStatusAvatar agent={member.agent} state={member.state} />
              <div class="shell-member-text">
                <span class="shell-member-name">{member.agent.name}</span>
                <Switch>
                  <Match when={member.state.kind === "working" ? member.state : null}>
                    {(state) => <span class="shell-member-state">{state().step ?? t("shell.member.working")}</span>}
                  </Match>
                  <Match when={member.state.kind === "waiting" ? member.state : null}>
                    {(state) => (
                      <>
                        <span class="shell-member-state">
                          {state().reason === "approval"
                            ? t("shell.member.waitingApproval")
                            : t("shell.member.waitingAnswer")}
                        </span>
                        <span class="shell-member-detail">{state().detail}</span>
                      </>
                    )}
                  </Match>
                  <Match when={member.state.kind === "failed" ? member.state : null}>
                    {(state) => (
                      <>
                        <span class="shell-member-state">{t("shell.member.failed")}</span>
                        <span class="shell-member-detail">{state().reason}</span>
                      </>
                    )}
                  </Match>
                  <Match when={member.state.kind === "idle"}>
                    <span class="shell-member-state">{t("shell.member.idle")}</span>
                  </Match>
                </Switch>
                <Show when={member.plan?.length ? member.plan : null}>{(steps) => <PlanSteps steps={steps()} />}</Show>
                <Show when={member.state.kind === "waiting" && member.state.reason === "approval"}>
                  <div class="shell-member-actions">
                    <Button size="sm" onClick={() => props.onAllow(member.agent.id)}>
                      {t("shell.member.allow")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => props.onDeny(member.agent.id)}>
                      {t("shell.member.deny")}
                    </Button>
                  </div>
                </Show>
              </div>
            </li>
          )}
        </For>
      </ul>
    </aside>
  );
}
