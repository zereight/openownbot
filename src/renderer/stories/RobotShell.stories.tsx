import type { AvatarHue } from "@robot/contracts/ipc";
import { UserAvatar } from "@robot/ui";
import { MemberPanel } from "@robot/ui/features/shell/MemberPanel";
import { PlaceList } from "@robot/ui/features/shell/PlaceList";
import { ServerRail } from "@robot/ui/features/shell/ServerRail";
import { ShellFrame } from "@robot/ui/features/shell/ShellFrame";
import type {
  ShellAgentIdentity,
  ShellMember,
  ShellPlace,
  ShellPlaceKey,
  ShellServer,
} from "@robot/ui/features/shell/shell-types";
import { createSignal, Show } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { StoryConversation } from "./conversation-story-support";

const meta = {
  title: "Shell/RobotShell",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const USER = { name: "Alex Kim", email: "alex@example.com", avatarUrl: null };
const SERVERS: ShellServer[] = [
  { id: "local", name: "This computer" },
  { id: "studio", name: "Studio Mac mini" },
  { id: "team", name: "Team server" },
];
const agent = (id: string, name: string, hue: AvatarHue): ShellAgentIdentity => ({
  id,
  name,
  avatarSeed: id,
  avatarHue: hue,
  avatarUrl: null,
});
const CHIEF = agent("chief", "Chief", 215);
const RESEARCH = agent("research", "Research", 150);
const BUILDER = agent("builder", "Builder", 30);
const LAUNCH = agent("launch", "Launch", 280);
const REVIEWER = agent("reviewer", "Pull request reviewer with a very long name", 0);
const MEMBERS: ShellMember[] = [
  {
    agent: CHIEF,
    state: { kind: "working", step: "Reviewing the draft" },
    plan: [
      { id: "pricing", label: "Pricing table", state: "done" },
      { id: "draft", label: "Draft post", state: "running" },
      { id: "changelog", label: "Changelog page with a very long name that does not fit", state: "todo" },
      { id: "review", label: "Review with you", state: "failed" },
    ],
  },
  { agent: RESEARCH, state: { kind: "working", step: "web_search · pricing pages" } },
  { agent: BUILDER, state: { kind: "waiting", reason: "approval", detail: "bun run build:changelog" } },
  { agent: REVIEWER, state: { kind: "failed", reason: "Claude usage limit until 14:00" } },
  { agent: LAUNCH, state: { kind: "idle" } },
];
const PLACES: ShellPlace[] = [
  { kind: "channel", id: "general", name: "general", unread: 0 },
  { kind: "channel", id: "research", name: "research", unread: 3 },
  { kind: "channel", id: "release", name: "release-0-51", unread: 12 },
  ...MEMBERS.map(
    (member): ShellPlace => ({
      kind: "agent",
      id: member.agent.id,
      agent: member.agent,
      state: member.state,
      unread: 0,
    }),
  ),
];

function ShellStory(props: { members?: boolean }) {
  const [server, setServer] = createSignal("local");
  const [place, setPlace] = createSignal<ShellPlaceKey | null>({ kind: "channel", id: "general" });
  const [members, setMembers] = createSignal(props.members ?? true);
  const [states, setStates] = createSignal(MEMBERS);
  const settle = (agentId: string) =>
    setStates((current) =>
      current.map((member) =>
        member.agent.id === agentId ? { ...member, state: { kind: "working", step: null } } : member,
      ),
    );
  return (
    <div style={{ height: "100vh" }}>
      <ShellFrame
        rail={<ServerRail servers={SERVERS} selectedId={server()} onSelect={setServer} onAdd={() => undefined} />}
        list={
          <PlaceList
            serverName={SERVERS.find((candidate) => candidate.id === server())?.name ?? ""}
            places={PLACES}
            selected={place()}
            onSelect={setPlace}
            onSettings={() => undefined}
            you={
              <>
                <UserAvatar user={USER} />
                <span>{USER.name}</span>
              </>
            }
          />
        }
        side={
          <Show when={members()}>
            <MemberPanel members={states()} onHide={() => setMembers(false)} onAllow={settle} onDeny={settle} />
          </Show>
        }
      >
        <StoryConversation />
      </ShellFrame>
    </div>
  );
}

/** A channel with its agents: working, waiting for an approval, failed and idle. */
export const Channel: Story = { render: () => <ShellStory /> };
/** The member panel hidden: the chat takes its width. */
export const MembersHidden: Story = { render: () => <ShellStory members={false} /> };
