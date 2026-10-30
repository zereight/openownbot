import type { HostReleaseStatus, HostUpdateStatus } from "@robot/contracts/ipc";
import { onSettled, snapshot } from "solid-js";
import { fn } from "storybook/test";
import { ServerSettingsModal, type ServerSettingsModalProps } from "../src/features/servers/ServerSettingsModal";
import { STORY_HOST_STATUS, STORY_SERVERS } from "../src/preview/fixtures";
import { createMockOpenOwnBot } from "./mock-openownbot";
import { SettingsPageStory } from "./settings-page-story";

function storyServer(kind: (typeof STORY_SERVERS)[number]["kind"]) {
  const server = STORY_SERVERS.find((item) => item.kind === kind);
  if (!server) throw new Error(`Story server fixtures need a ${kind} server.`);
  return server;
}

export const STORY_LOCAL_SERVER = storyServer("local");
export const STORY_REMOTE_SERVER = storyServer("remote");

/** The props of the real Server settings for this computer, without its optional sections. */
export const serverSettingsArgs = () =>
  ({
    open: true,
    platform: "darwin",
    server: STORY_LOCAL_SERVER,
    hostStatus: STORY_HOST_STATUS,
    loading: false,
    loadError: null,
    onRetry: fn(async () => undefined),
    onSaveIdentity: fn(async () => undefined),
    onSetPublished: fn(async () => undefined),
    onSetMuted: fn(async () => undefined),
    onOpenScreenRecordingSettings: fn(async () => undefined),
    onRecheckScreenRecording: fn(async () => undefined),
  }) satisfies Omit<ServerSettingsModalProps, "page">;

/** The real Server settings page, with a preview `window.openownbot` for the panels that read it. */
export function ServerSettingsStory(props: {
  settings: Omit<ServerSettingsModalProps, "page">;
  hostUpdate?: HostUpdateStatus;
  hostRelease?: HostReleaseStatus;
}) {
  const previous = window.openownbot;
  // Storybook passes the args as a store, and the mock copies its options with `structuredClone`.
  const hostStatus = props.settings.hostStatus;
  const mock = createMockOpenOwnBot({
    ...(hostStatus ? { hostStatus: snapshot(hostStatus) } : {}),
    ...(props.hostUpdate ? { hostUpdate: props.hostUpdate } : {}),
    ...(props.hostRelease ? { hostRelease: props.hostRelease } : {}),
  });
  window.openownbot = mock.api;
  onSettled(() => () => {
    mock.dispose();
    window.openownbot = previous;
  });
  return (
    <SettingsPageStory title="Server settings">
      {(page) => <ServerSettingsModal {...props.settings} page={page()} />}
    </SettingsPageStory>
  );
}
