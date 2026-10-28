// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { runCauseEffect } from "./effect-boundary";
import { MailboxStore } from "./mailbox-store";
import { OpenBotDatabase } from "./openbot-database";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "mailbox-answer-test-"));
  roots.push(root);
  const database = new OpenBotDatabase(root);
  await runCauseEffect(database.initialize());
  return new MailboxStore(root, join(root, "shared"), database);
}

describe("MailboxStore.isAnswerTo", () => {
  it("is true only for a message that the recipient sent and the sender received", async () => {
    const mailbox = await setup();
    const receipt = await Effect.runPromise(
      mailbox.enqueue({
        sender: { kind: "agent", agentId: "boss" },
        recipientAgentIds: ["worker"],
        text: "please do this",
        replyToMessageId: null,
        idempotencyKey: "request-1",
      }),
    );
    const requestId = receipt.messageId;
    expect(mailbox.isAnswerTo("worker", requestId, "boss")).toBe(true);
    // The boss did not receive its own request, so a message from the boss is not an answer.
    expect(mailbox.isAnswerTo("boss", requestId, "worker")).toBe(false);
    // Another agent did not receive it either.
    expect(mailbox.isAnswerTo("other", requestId, "boss")).toBe(false);
    expect(mailbox.isAnswerTo("worker", "missing", "boss")).toBe(false);
  });

  it("is false for a request that came from the user", async () => {
    const mailbox = await setup();
    const receipt = await Effect.runPromise(
      mailbox.enqueue({
        sender: { kind: "user" },
        recipientAgentIds: ["worker"],
        text: "hello",
        replyToMessageId: null,
        idempotencyKey: "request-2",
      }),
    );
    expect(mailbox.isAnswerTo("worker", receipt.messageId, "boss")).toBe(false);
  });
});
