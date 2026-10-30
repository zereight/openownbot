/** An agent step: a task that one agent does, with the agent, its model and the effort of the step. */

import { ProviderLogo } from "@robot/brand";
import { AGENT_REASONING_EFFORTS } from "@robot/contracts/ipc";
import { Bot, Button, buttonVariants, ChevronDown, DropdownMenu, Play, Textarea, TriangleAlert } from "@robot/ui";
import { Show, untrack } from "solid-js";
import type { AgentProfile } from "../../data";
import { useText } from "../../text";
import { AgentAvatar } from "../agents/AgentAvatar";
import { PickerMenu, type PickerOption } from "./WorkflowPicker";
import { useBoard } from "./workflow-board";
import type { WorkflowCatalogs } from "./workflow-model";
import { EffortPill, modelOption } from "./workflow-model-pills";
import {
  asString,
  Field,
  NodeShell,
  NodeToolbar,
  oneOf,
  ResultField,
  useField,
  useLocked,
  useStepRun,
  useTextField,
  wfKnownProvider,
} from "./workflow-node-parts";

/* --------------------------------------------------------------- Agent */

/** Each agent with its title and the model that it runs on. */
function agentOptions(catalogs: WorkflowCatalogs): PickerOption<string>[] {
  return catalogs.agents.map((agent) => ({
    value: agent.id,
    label: agent.name,
    tile: () => <AgentAvatar agent={agent} motion="idle" />,
    chips: [
      { text: agent.title },
      {
        icon: () => <ProviderLogo provider={wfKnownProvider(agent.provider)} class="wfn-model-logo" />,
        text: modelOption(catalogs.models, agent.model)?.name ?? agent.model,
      },
    ],
  }));
}

/**
 * The agent of a step. A step with no agent asks for one. An agent that the user deleted shows a
 * warning and opens the same list.
 */
function AgentPill(props: {
  agent: AgentProfile | undefined;
  /** True when the step names an agent that is not in the catalog. */
  removed: boolean;
  disabled?: boolean;
  onChange: (agent: AgentProfile) => void;
}) {
  const board = useBoard();
  const { t } = useText();
  const label = () => {
    if (props.agent) return t("workflow.agent.pill", { name: props.agent.name });
    return props.removed ? t("workflow.agent.removedLabel") : t("workflow.agent.choose");
  };
  return (
    <DropdownMenu.Root placement="bottom-start" gutter={6}>
      <DropdownMenu.Trigger
        class={`${buttonVariants({ variant: "ghost", size: "xs" })} wfn-pill wfn-agent-pill`}
        data-missing={props.removed ? "" : undefined}
        aria-label={label()}
        disabled={props.disabled}
      >
        <Show
          when={props.agent}
          fallback={
            <Show when={props.removed} fallback={<span>{t("workflow.agent.choose")}</span>}>
              <TriangleAlert aria-hidden="true" />
              <span>{t("workflow.agent.removed")}</span>
              <span class="wfn-pill-action">{t("workflow.agent.choose")}</span>
            </Show>
          }
        >
          {(agent) => (
            <>
              <AgentAvatar agent={agent()} class="wfn-avatar" motion="idle" />
              <span>{agent().name}</span>
            </>
          )}
        </Show>
        <ChevronDown aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <PickerMenu
          label={t("workflow.agent.list")}
          search={t("workflow.agent.search")}
          groups={[{ options: agentOptions(board.catalogs()) }]}
          value={props.agent?.id}
          onSelect={(id) => {
            const agent = board.catalogs().agents.find((candidate) => candidate.id === id);
            if (agent) props.onChange(agent);
          }}
        />
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * One step that an agent does. The field holds the task, with the agent, its model and the effort of
 * this step at the bottom, as the Higgsfield LLM Assistant holds its prompt with the model and Effort
 * controls. The model is the model of the agent, so it only shows; the step picks no other model.
 */
export function AgentNode(props: { id: string; agentId?: string; task?: string }) {
  const board = useBoard();
  const { t } = useText();
  const [agentId] = useField(
    () => props.id,
    "agentId",
    untrack(() => props.agentId ?? board.catalogs().agents[0]?.id ?? ""),
    asString,
  );
  const agent = () => board.catalogs().agents.find((candidate) => candidate.id === agentId());
  const model = () => {
    const found = agent();
    return found ? modelOption(board.catalogs().models, found.model) : undefined;
  };
  const efforts = () => model()?.supportedReasoningEfforts ?? [];
  // A step with no effort of its own runs with the effort of the agent, so the field stays absent then.
  const stored = () => oneOf(AGENT_REASONING_EFFORTS)(board.field(props.id, "effort") ?? "");
  const [task, setTask] = useTextField(
    () => props.id,
    "task",
    untrack(() => props.task ?? ""),
  );
  const [locked, setLocked] = useLocked(() => props.id);
  const run = useStepRun(untrack(() => props.id));
  return (
    <NodeShell
      action={
        <Button
          class="wfn-run"
          fullWidth
          loading={run.running()}
          loadingLabel={t("workflow.node.running")}
          disabled={!task().trim() || locked() || !agent()}
          onClick={run.start}
        >
          {t("workflow.agent.run")}
          <Play aria-hidden="true" />
        </Button>
      }
      id={props.id}
      label={t("workflow.agent.title")}
      icon={<Bot aria-hidden="true" />}
      kind="agent"
      inputs={["text", "image", "file"]}
      output="text"
      toolbar={<NodeToolbar id={props.id} name={t("workflow.agent.name")} locked={locked()} onLock={setLocked} />}
    >
      <Field class="wfn-field-task">
        <Textarea
          class="wfn-input"
          aria-label={t("workflow.agent.task")}
          placeholder={t("workflow.agent.taskPlaceholder")}
          readonly={locked()}
          value={task()}
          onValueChange={setTask}
        />
        <div class="wfn-field-foot">
          <AgentPill
            agent={agent()}
            removed={agentId() !== "" && !agent()}
            disabled={locked()}
            onChange={(choice) => {
              const offered = modelOption(board.catalogs().models, choice.model)?.supportedReasoningEfforts ?? [];
              const own = stored();
              // The effort of the step follows the new agent only when the model of that agent offers it.
              board.setFields(props.id, {
                agentId: choice.id,
                ...(own && !offered.includes(own) ? { effort: undefined } : {}),
              });
            }}
          />
          <Show when={agent()}>
            {(found) => {
              // The effort that the step holds, when the model of the agent offers it. A stale one counts as none.
              const own = () => efforts().find((choice) => choice === stored());
              return (
                <>
                  <span class="wfn-pill" data-static="">
                    <ProviderLogo provider={wfKnownProvider(found().provider)} class="wfn-model-logo" />
                    <span>{model()?.name ?? found().model}</span>
                  </span>
                  <EffortPill
                    efforts={efforts()}
                    value={own() ?? found().reasoningEffort}
                    disabled={locked()}
                    agent={{
                      effort: found().reasoningEffort,
                      inherited: own() === undefined,
                      onSelect: () => board.setFields(props.id, { effort: undefined }),
                    }}
                    onChange={(next) => board.setField(props.id, "effort", next)}
                  />
                </>
              );
            }}
          </Show>
        </div>
      </Field>
      <ResultField id={props.id} running={run.running()} />
    </NodeShell>
  );
}
