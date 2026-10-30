/**
 * The chat panel over a canvas, as the Workflows page uses it: its own texts, an agent picker under the
 * header, a link to the whole conversation, and a reason when it cannot take a message. The agent's
 * answer is simulated on a timer.
 */

import type { AgentProfile } from "@robot/ui/data";
import { DiagramChatAgentPicker, DiagramChatPanel } from "@robot/ui/features/diagrams/DiagramChatPanel";
import type { DiagramChatMessage } from "@robot/ui/features/diagrams/diagram-model";
import { createSignal, onCleanup, Show, untrack } from "solid-js";
import { fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { requireFixture, STORY_AGENTS } from "./fixtures";

const agents: AgentProfile[] = ["chief", "research", "sales"].map((id) =>
  requireFixture(
    STORY_AGENTS.find((agent) => agent.id === id),
    id,
  ),
);

const SAMPLE: DiagramChatMessage[] = [
  { id: "1", author: "user", text: "Add an approval before the Slack post.", createdAt: "2026-10-06T10:00:00.000Z" },
  {
    id: "2",
    author: "agent",
    text: "I added an approval step before the Slack post. The graph before my change is in the version list.",
    createdAt: "2026-10-06T10:00:20.000Z",
  },
];

const openConversation = fn();

function ChatStage(props: { open: boolean; messages?: DiagramChatMessage[]; working?: boolean; unavailable?: string }) {
  const [agentId, setAgentId] = createSignal(agents[0]?.id ?? "");
  const [open, setOpen] = createSignal(untrack(() => props.open));
  const [messages, setMessages] = createSignal(untrack(() => props.messages ?? []));
  const [working, setWorking] = createSignal(untrack(() => props.working ?? false));
  const agent = () => agents.find((entry) => entry.id === agentId());
  const timers: ReturnType<typeof setTimeout>[] = [];
  onCleanup(() => timers.forEach(clearTimeout));
  const send = (text: string) => {
    const now = () => new Date().toISOString();
    setMessages((list) => [...list, { id: `user-${list.length}`, author: "user", text, createdAt: now() }]);
    setWorking(true);
    timers.push(
      setTimeout(() => {
        setMessages((list) => [
          ...list,
          { id: `agent-${list.length}`, author: "agent", text: "Done. The canvas shows the change.", createdAt: now() },
        ]);
        setWorking(false);
      }, 1500),
    );
  };
  return (
    <div style={{ position: "relative", height: "520px", background: "var(--openownbot-bg-frame)" }}>
      <Show when={agent()}>
        {(current) => (
          <div class="diagram-view-chat" data-placement="end">
            <DiagramChatPanel
              agent={current()}
              copy={{
                label: "Workflow assistant",
                title: `Ask ${current().name} about this workflow`,
                empty: `Tell ${current().name} what to change in this workflow, or ask what it does.`,
                placeholder: "Ask or describe a change",
                show: "Ask an agent about this workflow",
                working: `${current().name} is working on the workflow`,
              }}
              agentPicker={<DiagramChatAgentPicker agents={agents} value={agentId()} onChange={setAgentId} />}
              messages={messages()}
              working={working()}
              open={open()}
              onOpenChange={setOpen}
              onSend={send}
              onOpenConversation={openConversation}
              unavailable={props.unavailable}
            />
          </div>
        )}
      </Show>
    </div>
  );
}

const meta = {
  title: "Diagrams/Chat panel",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Folded: Story = {
  render: () => <ChatStage open={false} />,
};

export const OpenWithPicker: Story = {
  name: "Open with an agent picker",
  render: () => <ChatStage open />,
};

export const Conversation: Story = {
  render: () => <ChatStage open messages={SAMPLE} />,
};

export const Working: Story = {
  render: () => <ChatStage open messages={SAMPLE.slice(0, 1)} working />,
};

export const Unavailable: Story = {
  render: () => <ChatStage open unavailable="The agent chat works on this computer's server." />,
};
