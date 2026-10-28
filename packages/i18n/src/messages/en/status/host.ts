import { defineMessages } from "../../../message";

export const messages = defineMessages("status.host", {
  // Status lines of the WebRTC host.
  "status.host.registered": "Registered this zereight bot for WebRTC access.",
  "status.host.keyRotated": "Server key changed. Paired devices stay paired.",
  "status.host.identityUpdated": "Server identity updated.",
  "status.host.starting": "Starting the WebRTC host…",
  "status.host.ready": "This zereight bot is ready for WebRTC connections.",
  "status.host.stopping": "Making this zereight bot private…",
  "status.host.private": "This zereight bot is private.",
});
