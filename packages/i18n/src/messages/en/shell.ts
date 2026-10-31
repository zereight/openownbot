import { defineMessages } from "../../message";

export const messages = defineMessages("shell", {
  "shell.rail.label": "Servers",
  "shell.rail.add": "Add a server",
  "shell.list.label": "Channels and agents",
  "shell.list.channels": "Channels",
  "shell.list.agents": "Agents",
  "shell.list.unread": { one: "{count} unread message", other: "{count} unread messages" },
  "shell.list.settings": "Settings",
  "shell.members.label": "Agents in this channel",
  "shell.members.count": { one: "{count} agent", other: "{count} agents" },
  "shell.members.hide": "Hide agents",
  "shell.member.idle": "Idle",
  "shell.member.working": "Working",
  "shell.member.waitingApproval": "Waits for your approval",
  "shell.member.waitingAnswer": "Waits for your answer",
  "shell.member.failed": "Failed",
  "shell.member.allow": "Allow once",
  "shell.member.deny": "Deny",
});
