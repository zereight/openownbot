// @vitest-environment node

import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sortConversationMessages } from "@openownbot/contracts/conversation-order";
import type { AgentSummary, ConversationMessage, ConversationSnapshot } from "@openownbot/contracts/ipc";
import {
  hostedSiteConversationEventItemType,
  hostedSiteConversationEventText,
  ROUTINE_QUIET_ANSWER_ITEM_TYPE,
  routineConversationEventItemType,
  routineRunConversationEventItemType,
} from "@openownbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openownbot/contracts/runtime-values";
import { sourceText } from "@openownbot/i18n/source";
import { afterEach, assert, describe, expect, it } from "vitest";
import { ConversationReadStore } from "./conversation-read-store";
import { runCauseEffect } from "./effect-boundary";
import { OpenOwnBotDatabase } from "./openownbot-database";
import { SCHEMA_VERSION } from "./openownbot-database-schema";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OpenOwnBotDatabase", () => {
  it("configures a private WAL database with every required projection", async () => {
    const database = await createDatabase();
    const tables = database.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => {
        if (!isDynamicRecord(row) || !isString(row.name)) throw new Error("Invalid table row.");
        return row.name;
      });

    expect(tables).toEqual(
      expect.arrayContaining([
        "database_info",
        "orchestration_events",
        "orchestration_command_receipts",
        "projection_agents",
        "projection_agent_memories",
        "projection_agent_routines",
        "projection_routine_triggers",
        "projection_routine_runs",
        "projection_threads",
        "projection_provider_sessions",
        "projection_turns",
        "projection_thread_messages",
        "provider_history_imports",
        "provider_history_turns",
        "provider_history_staging",
        "projection_thread_activities",
        "projection_mailbox_messages",
        "projection_deliveries",
        "projection_queue_state",
        "projection_reactions",
        "projection_attachments",
        "projection_thread_summaries",
        "projection_direct_threads",
        "projection_direct_messages",
        "projection_direct_reads",
        "projection_channel_memories",
        "projection_channel_routines",
        "projection_channel_routine_triggers",
        "projection_channel_routine_runs",
        "projection_routine_webhooks",
        "projection_channel_routine_webhooks",
        "projection_webhook_route_revocations",
        "projection_webhook_receipts",
        "file_deletion_outbox",
      ]),
    );
    expect(database.connection.prepare("PRAGMA journal_mode").get()).toMatchObject({
      journal_mode: "wal",
    });
    expect((await stat(database.path)).mode & 0o777).toBe(0o600);
    expect(database.connection.prepare("SELECT schema_version FROM database_info").all()).toEqual([
      { schema_version: SCHEMA_VERSION },
    ]);
    database.close();
  });

  it("commits bounded provider pages with attachment preservation and retry markers", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("provider-history-agent", [agent], "agents.imported");
    if (!agent.threadId) throw new Error("The test agent has no thread.");
    const session = database.bindProviderSession({
      threadId: agent.threadId,
      provider: "codex",
      externalSessionId: "provider-history-thread",
      model: agent.model,
      effort: agent.reasoningEffort,
    });
    const stored: ConversationSnapshot = {
      agentId: agent.id,
      threadId: agent.threadId,
      activeTurnId: null,
      revision: 0,
      messages: [
        {
          id: "provider-answer",
          turnId: "provider-turn",
          author: "assistant",
          text: "Before",
          createdAt: "2026-09-01T12:00:00.000Z",
          status: "completed",
          attachments: [
            {
              id: "kept-attachment",
              name: "notes.txt",
              size: 5,
              kind: "file",
              mimeType: "text/plain",
              previewKind: "text",
              previewUrl: null,
            },
          ],
        },
      ],
    };
    const storedMessage = stored.messages[0];
    assert(storedMessage);
    database.persistConversation(stored, "conversation.seeded");
    database.ensureProviderHistoryImport({
      sessionId: session.id,
      threadId: agent.threadId,
      provider: "codex",
      externalSessionId: session.externalSessionId,
    });
    const item = { id: "provider-answer", type: "agentMessage", text: "After" };
    database.stageProviderHistoryFragment({
      sessionId: session.id,
      fragment: { turnId: "provider-turn", status: "completed", items: [item], complete: false },
    });
    database.importProviderHistoryMessages({
      sessionId: session.id,
      turnId: "provider-turn",
      agentId: agent.id,
      threadId: agent.threadId,
      messages: [withoutAttachments({ ...storedMessage, text: "After" })],
      throughItemIndex: 0,
      complete: false,
    });
    expect(database.providerHistoryImport(session.id)?.state).toBe("active");
    expect(database.stagedProviderHistoryItems({ sessionId: session.id, turnId: "provider-turn" })).toEqual([
      expect.objectContaining({ itemIndex: 0, imported: true }),
    ]);

    database.stageProviderHistoryFragment({
      sessionId: session.id,
      fragment: { turnId: "provider-turn", status: "completed", items: [item], complete: true },
    });
    database.importProviderHistoryMessages({
      sessionId: session.id,
      turnId: "provider-turn",
      agentId: agent.id,
      threadId: agent.threadId,
      messages: [withoutAttachments({ ...storedMessage, text: "After" })],
      throughItemIndex: 0,
      complete: true,
    });
    database.importProviderHistoryMessages({
      sessionId: session.id,
      turnId: "provider-turn",
      agentId: agent.id,
      threadId: agent.threadId,
      messages: [withoutAttachments({ ...storedMessage, text: "After" })],
      complete: true,
    });

    expect(database.providerHistoryImport(session.id)?.state).toBe("active");
    expect(database.stagedProviderHistoryTurns(session.id)).toEqual([
      expect.objectContaining({ turnId: "provider-turn", complete: true, imported: true }),
    ]);
    expect(database.readConversation(agent.id, agent.threadId).messages).toEqual([
      expect.objectContaining({
        id: "provider-answer",
        text: "After",
        attachments: [expect.objectContaining({ id: "kept-attachment" })],
      }),
    ]);
    expect(database.readConversation(agent.id, agent.threadId).messages).toHaveLength(1);
    database.close();
  });

  it("rolls back events, projections, and receipts as one transaction", async () => {
    const database = await createDatabase();
    expect(() =>
      database.dispatch(
        "broken-command",
        [
          {
            aggregateType: "test",
            aggregateId: "one",
            eventType: "test.started",
            payload: {},
          },
        ],
        () => {
          throw new Error("projection failed");
        },
      ),
    ).toThrow("projection failed");

    expect(eventCount(database)).toBe(0);
    expect(
      database.connection
        .prepare("SELECT COUNT(*) AS count FROM orchestration_command_receipts WHERE command_id = ?")
        .get("broken-command"),
    ).toMatchObject({ count: 0 });
    database.close();
  });

  it("keeps a terminal hosted-site outcome pending until its marker command is durable", async () => {
    const database = await createDatabase();
    const pending = {
      agentId: "chief",
      threadId: "thread-chief",
      turnId: "turn-1",
      operationId: "operation-1",
      action: "publish" as const,
      status: "succeeded" as const,
      details: {
        siteId: "site-1",
        title: "Launch page",
        hostname: "launch-page-23456789ab.openbot.site",
        url: "https://launch-page-23456789ab.openbot.site",
      },
      markerCommandId: "hosted-site-event:chief:operation-1:succeeded",
      createdAt: "2026-09-01T12:00:00.000Z",
    };

    database.recordPendingHostedSiteTerminalEvent(pending);
    database.recordPendingHostedSiteTerminalEvent(pending);
    expect(database.pendingHostedSiteTerminalEvents()).toEqual([pending]);
    expect(
      database.connection
        .prepare(
          "SELECT aggregate_type, aggregate_id FROM orchestration_events WHERE event_type = 'hosted-site.terminal-pending'",
        )
        .get(),
    ).toEqual({ aggregate_type: "hosted-site-terminal", aggregate_id: pending.agentId });

    // The real marker command appends the outcome message to the thread. A command with no event keeps
    // no receipt.
    database.dispatch(
      pending.markerCommandId,
      [
        {
          aggregateType: "thread",
          aggregateId: pending.threadId,
          eventType: "hosted-site.publish-succeeded",
          payload: {},
        },
      ],
      () => ({ recorded: true }),
    );
    expect(database.pendingHostedSiteTerminalEvents()).toEqual([]);
    database.deletePendingHostedSiteTerminalEvent(pending.agentId, pending.operationId, pending.status);
    expect(
      database.connection
        .prepare("SELECT COUNT(*) AS count FROM orchestration_events WHERE event_type = 'hosted-site.terminal-pending'")
        .get(),
    ).toMatchObject({ count: 0 });
    expect(
      database.connection
        .prepare(
          "SELECT COUNT(*) AS count FROM orchestration_command_receipts WHERE command_id LIKE 'hosted-site-terminal-pending:%'",
        )
        .get(),
    ).toMatchObject({ count: 0 });
    database.close();
  });

  it("stores only active hosted-site operations for restart reconciliation", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-running-sites", [agent], "agents.imported");
    if (!agent.threadId) throw new Error("The test agent needs a thread.");
    const threadId = agent.threadId;
    const details = {
      siteId: "site-1",
      title: "Launch page",
      hostname: "launch-page-23456789ab.openbot.site",
      url: "https://launch-page-23456789ab.openbot.site",
    };
    const recordActive = (operationId: string, createdAt: string) => {
      database.recordActiveHostedSiteConversationEvent({
        agentId: agent.id,
        threadId,
        turnId: `turn-${operationId}`,
        createdAt,
        event: { action: "replace", status: "running", operationId, ...details },
      });
    };

    recordActive("operation-complete", "2026-09-01T12:00:00.000Z");
    database.deleteActiveHostedSiteConversationEvent(agent.id, "operation-complete");
    recordActive("operation-running", "2026-09-01T12:00:02.000Z");

    expect(database.activeHostedSiteConversationEvents()).toEqual([
      expect.objectContaining({
        agentId: agent.id,
        threadId: agent.threadId,
        turnId: "turn-operation-running",
        event: expect.objectContaining({ operationId: "operation-running", status: "running" }),
      }),
    ]);
    database.close();
  });

  it("returns the durable command receipt without running a command twice", async () => {
    const database = await createDatabase();
    let projections = 0;
    const run = () =>
      database.dispatch(
        "stable-command",
        [
          {
            aggregateType: "test",
            aggregateId: "one",
            eventType: "test.completed",
            payload: { value: 42 },
          },
        ],
        () => ({ projections: ++projections }),
      );

    expect(run()).toEqual({ projections: 1 });
    expect(run()).toEqual({ projections: 1 });
    expect(projections).toBe(1);
    expect(eventCount(database)).toBe(1);
    database.close();
  });

  it("reads a completed conversation after a database restart without a provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "openownbot-db-restart-"));
    roots.push(root);
    const database = new OpenOwnBotDatabase(root);
    await runCauseEffect(database.initialize());
    const agent = testAgent();
    if (!agent.threadId) throw new Error("The test agent has no thread.");
    const threadId = agent.threadId;
    database.replaceAgents("agents-import", [agent], "agents.imported");
    const snapshot: ConversationSnapshot = {
      agentId: agent.id,
      threadId,
      activeTurnId: null,
      revision: 0,
      messages: [
        {
          id: "user-1",
          author: "user",
          text: "Return 42",
          createdAt: "2026-08-18T10:00:00.000Z",
          status: "completed",
        },
        {
          id: "assistant-1",
          turnId: "turn-1",
          author: "assistant",
          text: "42",
          createdAt: "2026-08-18T10:00:01.000Z",
          status: "completed",
        },
      ],
    };
    const saved = database.persistConversation(snapshot, "turn.completed", {
      turnId: "turn-1",
      status: "completed",
    });
    database.connection.prepare("DELETE FROM projection_thread_messages WHERE thread_id = ?").run(agent.threadId);
    expect(database.readConversation(agent.id, agent.threadId).messages).toEqual([]);
    if (!agent.threadId) throw new Error("The test agent has no thread.");
    expect(database.rebuildThreadProjection(agent.threadId).messages).toMatchObject([
      { text: "Return 42", status: "completed" },
      { text: "42", status: "completed" },
    ]);
    database.close();

    const restored = new OpenOwnBotDatabase(root);
    await runCauseEffect(restored.initialize());
    expect(restored.readConversation(agent.id, agent.threadId)).toMatchObject({
      revision: saved.revision,
      messages: [
        { text: "Return 42", status: "completed" },
        { text: "42", status: "completed" },
      ],
    });
    restored.close();
  });

  it("appends one conversation marker and replays it without another full snapshot", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-append-marker", [agent], "agents.imported");
    if (!agent.threadId) throw new Error("The test agent has no thread.");
    const saved = database.persistConversation(
      {
        agentId: agent.id,
        threadId: agent.threadId,
        activeTurnId: "turn-1",
        revision: 0,
        messages: [
          {
            id: "user-before-marker",
            author: "user",
            text: "Run the routine",
            createdAt: "2026-08-18T10:00:00.000Z",
            status: "completed",
          },
        ],
      },
      "turn.started",
    );
    const marker: ConversationMessage = {
      id: "routine-marker",
      author: "system",
      source: "system",
      text: "Morning brief",
      createdAt: "2026-08-18T10:00:01.000Z",
      status: "completed",
      itemType: "routine-run-event:running:routine-1:run-1",
    };

    const revision = database.appendConversationMessage({
      agentId: agent.id,
      threadId: agent.threadId,
      activeTurnId: "turn-1",
      message: marker,
      eventType: "routine.run-running",
      detail: { routineId: "routine-1", runId: "run-1", status: "running" },
    });

    expect(revision).toBeGreaterThan(saved.revision);
    expect(database.readConversation(agent.id, agent.threadId)).toMatchObject({
      revision,
      messages: [{ id: "user-before-marker" }, { id: marker.id, itemType: marker.itemType }],
    });
    const event = database.connection
      .prepare("SELECT payload_json FROM orchestration_events WHERE event_type = 'routine.run-running'")
      .get();
    if (!isDynamicRecord(event) || !isString(event.payload_json)) throw new Error("The marker event is invalid.");
    const eventPayload = JSON.parse(event.payload_json);
    expect(eventPayload).toMatchObject({ appendedMessage: { id: marker.id } });
    expect(eventPayload).not.toHaveProperty("snapshot");

    database.connection.prepare("DELETE FROM projection_thread_messages WHERE thread_id = ?").run(agent.threadId);
    expect(database.rebuildThreadProjection(agent.threadId)).toMatchObject({
      revision,
      messages: [{ id: "user-before-marker" }, { id: marker.id, itemType: marker.itemType }],
    });
    database.close();
  });

  it("reads bounded runtime metadata without loading a full conversation", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-runtime", [agent], "agents.imported");
    database.persistConversation(
      {
        agentId: agent.id,
        threadId: agent.threadId,
        activeTurnId: "turn-active",
        revision: 0,
        messages: [
          {
            id: "assistant-latest",
            author: "assistant",
            text: "Latest answer",
            createdAt: "2026-08-29T10:00:00.000Z",
            status: "completed",
          },
          {
            id: "user-after",
            author: "user",
            text: "Follow-up",
            createdAt: "2026-08-29T10:01:00.000Z",
            status: "completed",
          },
          {
            id: "commentary-after",
            author: "assistant",
            text: "Checking the sources",
            createdAt: "2026-08-29T10:02:00.000Z",
            status: "completed",
            itemType: "commentary",
          },
          {
            id: "question-after",
            author: "assistant",
            text: "Which source should I use?",
            createdAt: "2026-08-29T10:03:00.000Z",
            status: "completed",
            itemType: "question_prompt",
          },
          {
            id: "attachment-after",
            author: "assistant",
            text: "",
            createdAt: "2026-08-29T10:04:00.000Z",
            status: "completed",
            itemType: "agent_attachment",
          },
        ],
      },
      "turn.started",
      { turnId: "turn-active" },
    );

    expect(database.readConversationRuntime(agent.id, agent.threadId)).toEqual({
      activeTurnId: "turn-active",
      latestMessage: expect.objectContaining({ id: "assistant-latest", text: "Latest answer" }),
    });
    database.close();
  });

  it("pages and searches a 1,000-message conversation without gaps", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-large-history", [agent], "agents.imported");
    const messages: ConversationMessage[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `message-${index.toString().padStart(5, "0")}`,
      author: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: index === 234 || index === 235 ? "A unique pagination needle" : `Message ${index}`,
      ...(index === 235 ? { itemType: "commentary" } : {}),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, index)).toISOString(),
      status: "completed" as const,
    }));
    database.persistConversation(
      { agentId: agent.id, threadId: agent.threadId, activeTurnId: null, revision: 0, messages },
      "conversation.large-history",
    );

    const latest = database.readConversationPage(agent.id, agent.threadId, { type: "latest" }, 50);
    expect(latest.messages).toHaveLength(50);
    expect(latest.messages[0]?.id).toBe("message-00950");
    expect(latest.messages.at(-1)?.id).toBe("message-00999");
    expect(latest.pageInfo.hasOlder).toBe(true);

    const seen = new Set(latest.messages.map((message) => message.id));
    let page = latest;
    while (page.pageInfo.olderCursor) {
      page = database.readConversationPage(
        agent.id,
        agent.threadId,
        { type: "before", cursor: page.pageInfo.olderCursor },
        50,
      );
      for (const message of page.messages) expect(seen.has(message.id)).toBe(false);
      page.messages.forEach((message) => {
        seen.add(message.id);
      });
    }
    expect(seen.size).toBe(1_000);

    const around = database.readConversationPage(
      agent.id,
      agent.threadId,
      { type: "around", messageId: "message-00500" },
      50,
    );
    expect(around.messages).toHaveLength(50);
    expect(around.messages.some((message) => message.id === "message-00500")).toBe(true);
    expect(database.readConversationPage(agent.id, agent.threadId, { type: "latest" }, 1_000).messages).toHaveLength(
      100,
    );

    const search = database.searchConversationMessages("pagination needle", agent.id, undefined, 100);
    expect(search.total).toBe(1);
    expect(search.results.map((result) => result.message.id)).toEqual(["message-00234"]);
    expect(search.nextCursor).toBeNull();
    expect(database.searchConversationMessages("pagination needle")).toEqual(search);
    database.close();
  });

  it("pages a conversation in the order the live conversation shows it (#1540)", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-acp-order", [agent], "agents.imported");
    const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
    const message = (id: string, seconds: number, fields: Partial<ConversationMessage> = {}): ConversationMessage => ({
      id,
      author: "assistant",
      text: id,
      createdAt: at(seconds),
      status: "completed",
      ...fields,
    });
    const messages: ConversationMessage[] = [];
    for (let turn = 0; turn < 12; turn += 1) {
      const start = turn * 100;
      const turnId = `turn-${turn}`;
      messages.push(
        // Each later question was queued while the turn before it ran.
        message(`${turnId}-question`, turn === 0 ? 0 : start - 50, { author: "user", turnId }),
        message(`${turnId}-thought`, start + 1, { turnId, itemType: "commentary" }),
        message(`${turnId}-tie`, start + 1, { turnId, itemType: "commentary" }),
        // An ACP agent sends its answer only when the turn ends.
        message(`${turnId}-answer`, start + 90, { turnId }),
      );
    }
    // Grok refuses a steer and answers it in the same turn, after the first answer.
    messages.push(
      message("steered-question", 2_000, { author: "user", turnId: "steered" }),
      message("steered-thought", 2_001, { turnId: "steered", itemType: "commentary" }),
      message("steer", 2_010, { author: "user", turnId: "steered" }),
      message("steered-first-answer", 2_020, { turnId: "steered" }),
      message("steered-second-thought", 2_021, { turnId: "steered", itemType: "commentary" }),
      message("steered-second-answer", 2_030, { turnId: "steered" }),
      message("marker", 2_015),
    );
    // The shared order puts a turn's question first even when its answer has an earlier time.
    messages.push(
      message("skewed-answer", 1_500, { turnId: "skewed" }),
      message("skewed-thought", 1_501, { turnId: "skewed", itemType: "commentary" }),
      message("skewed-question", 1_502, { author: "user", turnId: "skewed" }),
    );
    // Two messages alone at one time keep the order they were stored in.
    messages.push(message("tie-z", 1_600), message("tie-a", 1_600));
    // A turn larger than a page, with a steer on its last page.
    messages.push(
      message("large-question", 2_999, { author: "user", turnId: "large" }),
      message("large-answer", 3_200, { turnId: "large" }),
    );
    for (let index = 0; index < 120; index += 1) {
      const id = `large-${index.toString().padStart(3, "0")}`;
      messages.push(
        index === 110
          ? message(id, 3_000 + index, { author: "user", turnId: "large" })
          : message(id, 3_000 + index, { turnId: "large", itemType: "commentary" }),
      );
    }
    // The live runtime sorts a snapshot before it stores it.
    sortConversationMessages(messages);
    const expected = messages.map(({ id }) => id);
    database.persistConversation(
      {
        agentId: agent.id,
        threadId: agent.threadId,
        activeTurnId: null,
        revision: 0,
        messages: messages.map((item) =>
          item.id === "steer"
            ? { ...item, createdAt: at(2_000), delivery: { id: "steer", status: "queued", position: 1 } }
            : item,
        ),
      },
      "conversation.acp-order",
    );

    // A queued message gets its conversation time when it is steered (#1746). Live writes and
    // event replay must both replace the original queue time before SQL pages are read.
    const steer = messages.find((item) => item.id === "steer");
    if (!steer || !agent.threadId) throw new Error("The steered message needs a thread.");
    database.persistConversationChanges({
      agentId: agent.id,
      threadId: agent.threadId,
      activeTurnId: null,
      changedMessages: [{ ...steer, delivery: { id: "steer", status: "completed", position: null } }],
      eventType: "queue.message-steered",
    });
    expect(
      database.readConversation(agent.id, agent.threadId).messages.find((item) => item.id === "steer")?.createdAt,
    ).toBe(at(2_010));
    database.upsertProviderHistoryMessage({
      agentId: agent.id,
      threadId: agent.threadId,
      activeTurnId: null,
      message: { ...steer, createdAt: at(2_000) },
    });
    database.rebuildThreadProjection(agent.threadId);
    expect(
      database.readConversation(agent.id, agent.threadId).messages.find((item) => item.id === "steer")?.createdAt,
    ).toBe(at(2_010));
    expect(database.readConversation(agent.id, agent.threadId).messages.map(({ id }) => id)).toEqual(expected);
    expect(expected.indexOf("turn-1-question")).toBeGreaterThan(expected.indexOf("turn-0-answer"));
    expect(expected.indexOf("steer")).toBeGreaterThan(expected.indexOf("steered-thought"));
    expect(expected.indexOf("skewed-answer")).toBeGreaterThan(expected.indexOf("skewed-question"));
    expect(expected.indexOf("tie-a")).toBeGreaterThan(expected.indexOf("tie-z"));
    expect(expected.indexOf("steered-first-answer")).toBeLessThan(expected.indexOf("steered-second-thought"));

    for (const limit of [1, 5, 50]) {
      const pages: string[][] = [];
      let page = database.readConversationPage(agent.id, agent.threadId, { type: "latest" }, limit);
      pages.unshift(page.messages.map(({ id }) => id));
      while (page.pageInfo.olderCursor) {
        page = database.readConversationPage(
          agent.id,
          agent.threadId,
          { type: "before", cursor: page.pageInfo.olderCursor },
          limit,
        );
        expect(page.messages.length).toBeLessThanOrEqual(100);
        pages.unshift(page.messages.map(({ id }) => id));
      }
      expect(pages.flat()).toEqual(expected);
      const pageOfTurn = new Map<string, number>();
      pages.forEach((ids, index) => {
        for (const id of ids) {
          const turnId = messages.find((candidate) => candidate.id === id)?.turnId;
          if (!turnId || turnId === "large") continue;
          expect(pageOfTurn.get(turnId) ?? index).toBe(index);
          pageOfTurn.set(turnId, index);
        }
      });
    }

    // The marker came while the steered turn ran and shows after it. Read through it, only the
    // answer of the later turn is unread.
    expect(new ConversationReadStore(database).markReadForThread("member", agent.threadId, "marker")).toEqual({
      unreadCount: 1,
      firstUnreadMessageId: "large-answer",
      throughMessageId: "marker",
    });
    // Read through the thought, the answer shown after it is still unread.
    expect(
      new ConversationReadStore(database).markReadForThread("skew-reader", agent.threadId, "skewed-thought"),
    ).toMatchObject({ firstUnreadMessageId: "skewed-answer" });

    // An anchor late in a turn larger than a page still gets the rows after it.
    const lateAnchor = database.readConversationPage(
      agent.id,
      agent.threadId,
      { type: "around", messageId: "large-105" },
      4,
    );
    expect(lateAnchor.messages.length).toBeLessThanOrEqual(100);
    expect(lateAnchor.messages.map(({ id }) => id)).toContain("large-106");

    // An anchor at the start of a turn keeps the page's room for that turn, not for earlier turns.
    const turnStart = database.readConversationPage(
      agent.id,
      agent.threadId,
      { type: "around", messageId: "large-question" },
      50,
    );
    expect(turnStart.messages.map(({ id }) => id)).toEqual(
      expected.slice(expected.indexOf("large-question"), expected.indexOf("large-question") + 100),
    );

    // With limit 2 the turn before the anchor already fills the page; the rest of the turn still comes.
    for (const limit of [2, 4]) {
      const around = database.readConversationPage(
        agent.id,
        agent.threadId,
        { type: "around", messageId: "steer" },
        limit,
      );
      expect(around.messages.map(({ id }) => id)).toEqual(
        expected.filter((id) => id.startsWith("steered") || id === "steer"),
      );
    }

    const ordinal = expected.indexOf("turn-6-question");
    const legacyCursor = Buffer.from(
      JSON.stringify({ version: 1, createdAt: at(550), ordinal, messageId: "turn-6-question" }),
    ).toString("base64url");
    const legacyPage = database.readConversationPage(
      agent.id,
      agent.threadId,
      { type: "before", cursor: legacyCursor },
      100,
    );
    expect(legacyPage.messages.map(({ id }) => id)).toEqual(expected.slice(0, expected.indexOf("turn-6-question")));
    database.close();
  });

  it("keeps the channel thread of an agent out of the conversation search", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-channel-search", [agent], "agents.imported");
    const channelThreadId = "openbot-thread-channel-search";
    const now = "2026-09-01T12:00:00.000Z";
    database.connection
      .prepare("INSERT INTO projection_channels(channel_id, channel_json) VALUES (?, ?)")
      .run("channel-1", JSON.stringify({ id: "channel-1", name: "Project" }));
    database.connection
      .prepare(
        `INSERT INTO projection_threads
           (thread_id, agent_id, title, active_turn_id, created_at, updated_at, last_event_sequence)
         VALUES (?, ?, ?, NULL, ?, ?, 0)`,
      )
      .run(channelThreadId, agent.id, "Project", now, now);
    database.connection
      .prepare("INSERT INTO projection_channel_contexts(channel_id, agent_id, thread_id) VALUES (?, ?, ?)")
      .run("channel-1", agent.id, channelThreadId);
    const message = (id: string, text: string) => ({
      id,
      author: "assistant" as const,
      text,
      createdAt: now,
      status: "completed" as const,
    });
    database.persistConversation(
      {
        agentId: agent.id,
        threadId: agent.threadId,
        activeTurnId: null,
        revision: 0,
        messages: [message("normal-hit", "A unique channel needle in the chat")],
      },
      "conversation.channel-search-normal",
    );
    database.persistConversation(
      {
        agentId: agent.id,
        threadId: channelThreadId,
        activeTurnId: null,
        revision: 0,
        messages: [message("channel-hit", "A unique channel needle in the channel")],
      },
      "conversation.channel-search-channel",
    );

    // A result names an agent and a message, and opening one shows the normal conversation of that
    // agent. A channel message is not there, so the search must not offer it.
    const search = database.searchConversationMessages("unique channel needle");
    expect(search.results.map((result) => result.message.id)).toEqual(["normal-hit"]);
    expect(search.total).toBe(1);
    expect(database.searchConversationMessages("unique channel needle", agent.id).total).toBe(1);
    database.close();
  });

  it("fills legacy pages after excluding action markers", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-routine-history", [agent], "agents.imported");
    const routineEvent = (id: string, createdAt: string) => ({
      id,
      author: "system" as const,
      source: "system" as const,
      text: "Morning brief",
      createdAt,
      status: "completed" as const,
      itemType: routineConversationEventItemType("updated", "routine-1"),
    });
    const routineRunEvent = (id: string, createdAt: string) => ({
      id,
      author: "system" as const,
      source: "system" as const,
      text: "Morning brief",
      createdAt,
      status: "completed" as const,
      itemType: routineRunConversationEventItemType("running", "routine-1", "run-1"),
    });
    const hostedSiteEvent = (id: string, createdAt: string) => ({
      id,
      author: "system" as const,
      source: "system" as const,
      text: hostedSiteConversationEventText({
        siteId: null,
        title: "Launch page",
        hostname: null,
        url: null,
      }),
      createdAt,
      status: "completed" as const,
      itemType: hostedSiteConversationEventItemType("publish", "running", "operation-1"),
    });
    database.persistConversation(
      {
        agentId: agent.id,
        threadId: agent.threadId,
        activeTurnId: null,
        revision: 0,
        messages: [
          {
            id: "reply-old",
            author: "assistant",
            text: "Older reply",
            createdAt: "2026-08-29T10:00:00.000Z",
            status: "completed",
          },
          routineEvent("routine-event-1", "2026-08-29T10:01:00.000Z"),
          {
            id: "reply-new",
            author: "assistant",
            text: "Newer reply",
            createdAt: "2026-08-29T10:02:00.000Z",
            status: "completed",
          },
          routineEvent("routine-event-2", "2026-08-29T10:03:00.000Z"),
          routineRunEvent("routine-run-event-1", "2026-08-29T10:04:00.000Z"),
          routineEvent("routine-event-3", "2026-08-29T10:05:00.000Z"),
          hostedSiteEvent("hosted-site-event-1", "2026-08-29T10:06:00.000Z"),
          {
            id: "quiet-answer-1",
            author: "assistant",
            text: "Nothing to report",
            createdAt: "2026-08-29T10:07:00.000Z",
            status: "completed",
            itemType: ROUTINE_QUIET_ANSWER_ITEM_TYPE,
          },
        ],
      },
      "conversation.routine-history",
    );

    const latest = database.readConversationPage(agent.id, agent.threadId, { type: "latest" }, 1, {
      excludeRoutineEvents: true,
      excludeRoutineRunEvents: true,
      excludeHostedSiteEvents: true,
      excludeRoutineQuietAnswers: true,
    });
    expect(latest.messages.map((message) => message.id)).toEqual(["reply-new"]);
    expect(latest.pageInfo.hasOlder).toBe(true);
    if (!latest.pageInfo.olderCursor) throw new Error("The older page cursor is missing.");

    const older = database.readConversationPage(
      agent.id,
      agent.threadId,
      { type: "before", cursor: latest.pageInfo.olderCursor },
      1,
      {
        excludeRoutineEvents: true,
        excludeRoutineRunEvents: true,
        excludeHostedSiteEvents: true,
        excludeRoutineQuietAnswers: true,
      },
    );
    expect(older.messages.map((message) => message.id)).toEqual(["reply-old"]);
    expect(older.pageInfo.hasOlder).toBe(false);
    expect(database.searchConversationMessages("Morning brief", agent.id).total).toBe(0);
    expect(database.searchConversationMessages("Launch page", agent.id).total).toBe(0);
    // A quiet routine answer is not news, and a Team API client never gets it.
    expect(database.searchConversationMessages("Nothing to report", agent.id).total).toBe(0);
    database.close();
  });

  it("keeps one full conversation snapshot and a small idempotency receipt", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-import", [agent], "agents.imported");
    const snapshot = conversationSnapshot(agent, "x".repeat(40_000));

    const first = database.persistConversation(snapshot, "response.delta-flushed", {}, "stable-conversation");
    expect(database.persistConversation(snapshot, "response.delta-flushed", {}, "stable-conversation")).toEqual(first);
    for (let index = 0; index < 100; index += 1) {
      database.persistConversation(snapshot, "response.delta-flushed");
    }

    expect(snapshotEventCount(database, agent.threadId)).toBe(1);
    expect(
      database.connection
        .prepare(
          `SELECT COUNT(*) AS count, SUM(LENGTH(result_json)) AS bytes
           FROM orchestration_command_receipts WHERE command_id LIKE 'conversation:%'`,
        )
        .get(),
    ).toMatchObject({ count: 1, bytes: expect.any(Number) });
    const receipt = database.connection
      .prepare(
        `SELECT result_json FROM orchestration_command_receipts
         WHERE command_id LIKE 'conversation:%' LIMIT 1`,
      )
      .get();
    expect(receipt).toMatchObject({ result_json: expect.stringMatching(/^\{"revision":\d+\}$/) });
    database.close();
  });

  it("writes only the streamed message and keeps one event for the whole run", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-import", [agent], "agents.imported");
    if (!agent.threadId) throw new Error("The test agent has no thread.");
    const snapshot = streamingSnapshot(agent, 40);
    database.persistConversation(snapshot, "turn.started", { turnId: "turn-1" });
    const settledSequences = messageSequences(database, agent.threadId);

    const streamed = snapshot.messages[snapshot.messages.length - 1];
    if (!streamed) throw new Error("The streaming message is missing.");
    let revision = snapshot.revision;
    for (let index = 0; index < 100; index += 1) {
      streamed.text += "token ";
      revision = database.persistStreamingMessage({
        snapshot,
        messageId: streamed.id,
        eventType: "response.delta-flushed",
        detail: { turnId: "turn-1" },
      });
    }

    const conversation = database.readConversation(agent.id, agent.threadId);
    expect(conversation.revision).toBe(revision);
    expect(conversation.messages.at(-1)).toMatchObject({ id: "assistant-live", text: "token ".repeat(100) });
    // The settled history keeps the sequence it was written at, so the streamed message is the only
    // row a flush touched. A flush that rewrote the whole thread would stamp every row with its own
    // sequence, which is the cost this write path exists to avoid.
    const rewritten = Object.entries(messageSequences(database, agent.threadId))
      .filter(([messageId, sequence]) => settledSequences[messageId] !== sequence)
      .map(([messageId]) => messageId);
    expect(rewritten).toEqual(["assistant-live"]);
    // One hundred flushes, one event and one receipt: each flush drops the one it supersedes.
    expect(streamedMessageEventCount(database, agent.threadId)).toBe(1);
    expect(
      database.connection
        .prepare(
          `SELECT COUNT(*) AS count FROM orchestration_command_receipts
           WHERE command_id LIKE 'conversation:response.delta-flushed:%'`,
        )
        .get(),
    ).toMatchObject({ count: 1 });
    database.close();
  });

  it("replays a thread whose streamed text was replaced rather than appended", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-import", [agent], "agents.imported");
    if (!agent.threadId) throw new Error("The test agent has no thread.");
    const snapshot = streamingSnapshot(agent, 3);
    database.persistConversation(snapshot, "turn.started", { turnId: "turn-1" });
    const streamed = snapshot.messages[snapshot.messages.length - 1];
    if (!streamed) throw new Error("The streaming message is missing.");

    streamed.text = "partial answ";
    database.persistStreamingMessage({ snapshot, messageId: streamed.id, eventType: "response.delta-flushed" });
    // `item/completed` replaces the text instead of adding to it, so a replay that summed the
    // flushes would rebuild "partial answ" plus the whole answer.
    streamed.text = "The complete answer.";
    streamed.status = "completed";
    const revision = database.persistStreamingMessage({
      snapshot,
      messageId: streamed.id,
      eventType: "response.delta-flushed",
    });

    database.connection.prepare("DELETE FROM projection_thread_messages WHERE thread_id = ?").run(agent.threadId);
    expect(database.rebuildThreadProjection(agent.threadId)).toMatchObject({
      revision,
      activeTurnId: "turn-1",
    });
    expect(database.readConversation(agent.id, agent.threadId).messages.at(-1)).toMatchObject({
      id: "assistant-live",
      text: "The complete answer.",
      status: "completed",
    });
    database.close();
  });

  it("drops the streamed message events once a whole snapshot supersedes them", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-import", [agent], "agents.imported");
    if (!agent.threadId) throw new Error("The test agent has no thread.");
    const snapshot = streamingSnapshot(agent, 3);
    database.persistConversation(snapshot, "turn.started", { turnId: "turn-1" });
    const streamed = snapshot.messages[snapshot.messages.length - 1];
    if (!streamed) throw new Error("The streaming message is missing.");
    streamed.text = "An answer that streamed in.";
    database.persistStreamingMessage({ snapshot, messageId: streamed.id, eventType: "response.delta-flushed" });
    expect(streamedMessageEventCount(database, agent.threadId)).toBe(1);

    streamed.status = "completed";
    snapshot.activeTurnId = null;
    database.persistConversation(snapshot, "turn.completed", { turnId: "turn-1", status: "completed" });

    expect(streamedMessageEventCount(database, agent.threadId)).toBe(0);
    expect(snapshotEventCount(database, agent.threadId)).toBe(1);
    // The whole snapshot carries the streamed text, so dropping the flushes loses nothing.
    database.connection.prepare("DELETE FROM projection_thread_messages WHERE thread_id = ?").run(agent.threadId);
    expect(database.rebuildThreadProjection(agent.threadId).messages.at(-1)).toMatchObject({
      text: "An answer that streamed in.",
      status: "completed",
    });
    database.close();
  });

  it("falls back to a whole snapshot when the streamed message left the thread", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-import", [agent], "agents.imported");
    if (!agent.threadId) throw new Error("The test agent has no thread.");
    const snapshot = streamingSnapshot(agent, 2);
    database.persistConversation(snapshot, "turn.started", { turnId: "turn-1" });
    // A thread reset between the buffer and its flush leaves the message unknown to the snapshot.
    snapshot.messages = snapshot.messages.slice(0, 1);

    const revision = database.persistStreamingMessage({
      snapshot,
      messageId: "assistant-live",
      eventType: "response.delta-flushed",
    });

    const conversation = database.readConversation(agent.id, agent.threadId);
    expect(conversation.revision).toBe(revision);
    expect(conversation.messages.map((message) => message.id)).toEqual(["settled-0"]);
    database.close();
  });

  it("rolls back mailbox attachments when the matching conversation projection fails", async () => {
    const database = await createDatabase();
    const mailboxState = {
      messages: [],
      deliveries: [],
      drafts: [],
      generatedAttachments: [],
      pausedAgentIds: [],
      idempotency: {},
      reactions: [],
    };
    database.replaceMailboxState("mailbox-baseline", mailboxState, "mailbox.baseline");
    const snapshot: ConversationSnapshot = {
      agentId: "missing-agent",
      threadId: "missing-thread",
      activeTurnId: null,
      revision: 0,
      messages: [],
    };

    expect(() =>
      database.persistConversationAndMailbox(
        snapshot,
        "response.attachments-added",
        {},
        {
          ...mailboxState,
          generatedAttachments: [
            {
              id: "generated-1",
              name: "screenshot.png",
              size: 12,
              kind: "image",
              mimeType: "image/png",
              previewKind: "image",
              previewUrl: "openbot-attachment://file/generated-1",
              path: "/tmp/screenshot.png",
              sha256: "hash",
            },
          ],
        },
        "attachment.generated-batch",
      ),
    ).toThrow("Unknown agent for conversation");
    expect(database.readMailboxState()).toMatchObject({ generatedAttachments: [] });
    expect(database.connection.isTransaction).toBe(false);
    database.close();
  });

  it("removes messages omitted from the latest full conversation snapshot", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-import", [agent], "agents.imported");
    const snapshot = conversationSnapshot(agent, "Canonical reply");
    const [reply] = snapshot.messages;
    assert(reply);
    snapshot.messages.push({
      ...reply,
      id: "provisional-reply",
    });
    database.persistConversation(snapshot, "conversation.snapshot-updated");

    snapshot.messages = snapshot.messages.filter((message) => message.id !== "provisional-reply");
    database.persistConversation(snapshot, "provider-history.backfilled");

    expect(database.readConversation(agent.id, agent.threadId).messages.map((message) => message.id)).toEqual([
      "assistant-1",
    ]);
    database.close();
  });

  it("rebuilds provider turn links, summaries, and attachment projections from compact history", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    database.replaceAgents("agents-import", [agent], "agents.imported");
    if (!agent.threadId) throw new Error("The test agent has no thread.");
    const session = database.bindProviderSession({
      threadId: agent.threadId,
      provider: "codex",
      externalSessionId: "provider-thread-1",
      model: agent.model,
      effort: agent.reasoningEffort,
    });
    const running = conversationSnapshot(agent, "Working");
    running.activeTurnId = "turn-1";
    const [message] = running.messages;
    assert(message);
    running.messages[0] = {
      ...message,
      turnId: "turn-1",
      status: "streaming",
      attachments: [
        {
          id: "attachment-1",
          name: "report.csv",
          size: 12,
          kind: "file",
          mimeType: "text/csv",
          previewKind: "text",
          previewUrl: null,
        },
      ],
    };
    database.persistConversation(running, "response.delta-flushed");
    const completed = structuredClone(running);
    completed.activeTurnId = null;
    const [completedMessage] = completed.messages;
    assert(completedMessage);
    completedMessage.status = "completed";
    database.persistConversation(completed, "turn.completed", { turnId: "turn-1", status: "completed" });
    database.saveThreadSummary(agent.threadId, completedMessage.id, "Saved context", 3);

    expect(snapshotEventCount(database, agent.threadId)).toBe(1);
    database.rebuildThreadProjection(agent.threadId);

    expect(
      database.connection.prepare("SELECT provider_session_id FROM projection_turns WHERE turn_id = 'turn-1'").get(),
    ).toMatchObject({ provider_session_id: session.id });
    expect(
      database.connection
        .prepare("SELECT name FROM projection_attachments WHERE attachment_id = ?")
        .get(`${agent.threadId}:assistant-1:attachment-1`),
    ).toMatchObject({ name: "report.csv" });
    expect(
      database.connection
        .prepare("SELECT payload_json FROM projection_thread_activities WHERE activity_type = 'turn.completed'")
        .get(),
    ).toEqual({ payload_json: '{"turnId":"turn-1","status":"completed"}' });
    expect(database.latestThreadSummary(agent.threadId)).toMatchObject({ text: "Saved context" });
    database.close();
  });

  it("keeps only the latest full mailbox state", async () => {
    const database = await createDatabase();
    const state = {
      messages: [],
      deliveries: [],
      drafts: [],
      generatedAttachments: [],
      pausedAgentIds: [],
      idempotency: {},
      reactions: [],
    };
    database.replaceMailboxState("mailbox:first", state, "mailbox.updated");
    database.replaceMailboxState(
      "mailbox:second",
      { ...state, idempotency: { request: "message-1" } },
      "mailbox.updated",
    );

    expect(
      database.connection
        .prepare(
          `SELECT COUNT(*) AS count FROM orchestration_events
           WHERE aggregate_type = 'mailbox' AND aggregate_id = 'mailbox'`,
        )
        .get(),
    ).toMatchObject({ count: 1 });
    expect(
      database.connection
        .prepare("SELECT command_id FROM orchestration_command_receipts WHERE command_id LIKE 'mailbox:%'")
        .all(),
    ).toEqual([{ command_id: "mailbox:second" }]);
    database.close();
  });

  // A release shipped versions 15 and 16 for usage analytics, so every database upgraded by that
  // release stands at 16 with no channel storage. Channel storage has to arrive above it: numbered
  // at or below 16 it would be filtered out as already applied, and the tables would never appear.

  // Released builds stored an agent's blank `replyToMessageId` as `""`. The guard rejects an empty id,
  // so the read failed for the whole page of the sender and of the recipient, and stalled the queue.
  it("reads a message that a released build stored with a blank reply id", async () => {
    const root = await mkdtemp(join(tmpdir(), "openownbot-db-blank-reply-"));
    roots.push(root);
    const database = new OpenOwnBotDatabase(root);
    await runCauseEffect(database.initialize());
    const threadId = "openbot-thread-agent-chief";
    database.connection
      .prepare(
        `INSERT INTO projection_threads (thread_id, agent_id, title, active_turn_id, created_at, updated_at, last_event_sequence)
         VALUES (?, 'agent-chief', 'Chief', NULL, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z', 1)`,
      )
      .run(threadId);
    database.connection
      .prepare(
        `INSERT INTO projection_thread_messages
           (thread_id, message_id, turn_id, author, status, item_type, created_at, ordinal, message_json, last_event_sequence,
            group_start, group_first, group_id, turn_rank)
         VALUES (?, 'message-1', NULL, 'agent', 'completed', NULL, '2026-09-01T12:00:00.000Z', 0, ?, 1,
                 '2026-09-01T12:00:00.000Z', 0, 'message:message-1', 0)`,
      )
      .run(
        threadId,
        JSON.stringify({
          id: "message-1",
          author: "agent",
          status: "completed",
          text: "Done.",
          createdAt: "2026-09-01T12:00:00.000Z",
          senderAgentId: "agent-chief",
          replyToMessageId: "",
          exchange: {
            direction: "outgoing",
            messageId: "exchange-1",
            senderAgentId: "agent-chief",
            recipientAgentIds: ["agent-helper"],
            replyToMessageId: "",
            deliveries: [],
          },
        }),
      );

    expect(database.readConversationPage("agent-chief", threadId).messages).toEqual([
      expect.objectContaining({
        id: "message-1",
        text: "Done.",
        replyToMessageId: null,
        exchange: expect.objectContaining({ replyToMessageId: null }),
      }),
    ]);
    database.close();
  });

  // Every shipped provider-session table: the v16 baseline (three providers), v17 to v21 (the same
  // four-provider table), and v22 (five). Migration 23 must keep every row, the turn link, the index
  // and the UNIQUE constraint, and only then accept `acp`.

  // Every shipped provider-session table: the v16 baseline (three providers), v17 to v21 (four), v22
  // (five) and v23 (six). Migration 24 must keep every row, the turn link, the index and the UNIQUE
  // constraint, and only then accept `cursor`.

  // Every shipped provider-session table: the v16 baseline (three providers), v17 to v21 (four), v22
  // (five), v23 (six) and v24 to v25 (seven). Migration 26 must keep every row, the turn link, the
  // index and the UNIQUE constraint, and only then accept `cline`.

  // The agent routine table is the v8 baseline's and the channel one is migration 19's, and neither
  // changed before migration 27. So v19 is the oldest shipped database with both, and v26 the newest.

  // Every shipped provider-session table: the v16 baseline (three providers), v17 to v21 (four), v22
  // (five), v23 (six), v24 to v25 (seven) and v26 to v27 (eight). Migration 28 must keep every row, the
  // turn link, the index, the UNIQUE and the state CHECK, and remove only the provider CHECK.

  it("erases an agent's history without leaving a receipt whose events are gone", async () => {
    const database = await createDatabase();
    const agent = testAgent();
    const createdAt = "2026-08-18T10:00:01.000Z";
    database.replaceAgents("agents:seed", [agent], "agents.replaced");
    database.dispatch(
      "agent-memory:seed",
      [{ aggregateType: "agent-memory", aggregateId: "memory-1", eventType: "agent-memory.created", payload: {} }],
      (db, sequences) => {
        db.prepare(
          `INSERT INTO projection_agent_memories
             (memory_id, agent_id, text, normalized_text, origin, source_turn_id,
              created_at, updated_at, last_event_sequence)
           VALUES ('memory-1', ?, 'remembers', 'remembers', 'manual', NULL, ?, ?, ?)`,
        ).run(agent.id, createdAt, createdAt, sequences[0] ?? 0);
        return null;
      },
    );
    database.dispatch(
      "agent-routine:seed",
      [{ aggregateType: "agent-routine", aggregateId: "routine-1", eventType: "agent-routine.created", payload: {} }],
      (db, sequences) => {
        db.prepare(
          `INSERT INTO projection_agent_routines
             (routine_id, agent_id, name, instruction, active, timezone,
              created_at, updated_at, last_event_sequence)
           VALUES ('routine-1', ?, 'Standup', 'Report status', 1, 'UTC', ?, ?, ?)`,
        ).run(agent.id, createdAt, createdAt, sequences[0] ?? 0);
        return null;
      },
    );
    database.recordPendingHostedSiteTerminalEvent({
      agentId: agent.id,
      threadId: "openbot-thread-chief",
      turnId: "turn-1",
      operationId: "operation-1",
      action: "publish",
      status: "succeeded",
      details: { siteId: "site-1", title: "Site", hostname: null, url: null },
      markerCommandId: `hosted-site-event:${agent.id}:operation-1:succeeded`,
      createdAt,
    });

    database.hardDeleteAgent("agents:delete", agent.id, agent.threadId, []);

    expect(database.listAgents()).toEqual([]);
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM projection_agent_memories").get()).toMatchObject({
      count: 0,
    });
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM projection_agent_routines").get()).toMatchObject({
      count: 0,
    });
    expect(database.pendingHostedSiteTerminalEvents()).toEqual([]);
    // An orphan receipt makes `dispatch` replay its stale result for a command that never ran.
    expect(
      database.connection
        .prepare(
          `SELECT command_id FROM orchestration_command_receipts receipt
           WHERE NOT EXISTS (
             SELECT 1 FROM orchestration_events
             WHERE orchestration_events.command_id = receipt.command_id
           )`,
        )
        .all(),
    ).toEqual([]);
    database.close();
  });

  // Migration 31 only adds the routine flow tables, which reference the agent routines and their
  // runs. Those tables last changed in migration 27, so v27 is the newest schema that changed them,
  // v19 the oldest that the v27 coverage above starts from, and v29 and v30 the shipped schemas of
  // v0.32.0 and v0.33.0, which this migration meets on an upgrade.

  it("checks the file at a start after a stop that did not close it", async () => {
    const database = await createDatabase();
    const { path, userDataPath } = database;
    damageProbeTable(database);
    // A crash or a kill leaves the write-ahead log; a clean close removes it.
    await writeFile(`${path}-wal`, "");

    // The failed start closes the database, which removes the log; the next start must fail again.
    for (const _start of [1, 2]) {
      await expect(runCauseEffect(new OpenOwnBotDatabase(userDataPath).initialize())).rejects.toThrow(
        sourceText("error.backend.databaseIntegrity"),
      );
    }
  });

  it("does not read the full file at a start after a clean close", async () => {
    const database = await createDatabase();
    const userDataPath = database.userDataPath;
    damageProbeTable(database);

    const reopened = new OpenOwnBotDatabase(userDataPath);
    await runCauseEffect(reopened.initialize());
    // The damage is still there: the start did not run the check that finds it.
    expect(reopened.connection.prepare("PRAGMA quick_check").all()).not.toEqual([{ quick_check: "ok" }]);
    reopened.close();
  });
});

/** Breaks a NOT NULL rule in a new table, as a damaged page would, and closes the database cleanly. */
function damageProbeTable(database: OpenOwnBotDatabase): void {
  database.connection.exec("CREATE TABLE damage_probe (value TEXT); INSERT INTO damage_probe VALUES (NULL)");
  const path = database.path;
  database.close();
  const connection = new DatabaseSync(path, { defensive: false });
  connection.exec("PRAGMA writable_schema = ON");
  connection
    .prepare("UPDATE sqlite_master SET sql = ? WHERE name = 'damage_probe'")
    .run("CREATE TABLE damage_probe (value TEXT NOT NULL)");
  connection.close();
}

async function createDatabase(): Promise<OpenOwnBotDatabase> {
  const root = await mkdtemp(join(tmpdir(), "openownbot-db-"));
  roots.push(root);
  const database = new OpenOwnBotDatabase(root);
  await runCauseEffect(database.initialize());
  return database;
}

function testAgent(): AgentSummary {
  return {
    id: "chief",
    provider: "codex",
    name: "Chief",
    title: "Coordinator",
    description: "",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: "openbot-thread-chief",
    workspacePath: "/tmp/openownbot-chief",
    preview: "42",
    updatedAt: "2026-08-18T10:00:01.000Z",
    avatarSeed: "chief",
    avatarHue: null,
    avatarUrl: null,
  };
}

function eventCount(database: OpenOwnBotDatabase): number {
  const row = database.connection.prepare("SELECT COUNT(*) AS count FROM orchestration_events").get();
  if (!isDynamicRecord(row) || !isNumber(row.count)) throw new Error("Invalid event count row.");
  return row.count;
}

function snapshotEventCount(database: OpenOwnBotDatabase, threadId: string | null): number {
  if (!threadId) throw new Error("The test agent has no thread.");
  const row = database.connection
    .prepare(
      `SELECT COUNT(*) AS count FROM orchestration_events
       WHERE aggregate_type = 'thread' AND aggregate_id = ?
         AND json_type(payload_json, '$.snapshot') = 'object'`,
    )
    .get(threadId);
  if (!isDynamicRecord(row) || !isNumber(row.count)) throw new Error("Invalid snapshot count row.");
  return row.count;
}

function streamedMessageEventCount(database: OpenOwnBotDatabase, threadId: string | null): number {
  if (!threadId) throw new Error("The test agent has no thread.");
  const row = database.connection
    .prepare(
      `SELECT COUNT(*) AS count FROM orchestration_events
       WHERE aggregate_type = 'thread' AND aggregate_id = ?
         AND json_type(payload_json, '$.streamedMessage') = 'object'`,
    )
    .get(threadId);
  if (!isDynamicRecord(row) || !isNumber(row.count)) throw new Error("Invalid streamed message count row.");
  return row.count;
}

/** The sequence each projected message was last written at, by message id. */
function messageSequences(database: OpenOwnBotDatabase, threadId: string): Record<string, number> {
  const sequences: Record<string, number> = {};
  for (const row of database.connection
    .prepare("SELECT message_id, last_event_sequence FROM projection_thread_messages WHERE thread_id = ?")
    .all(threadId)) {
    if (!isDynamicRecord(row) || !isString(row.message_id) || !isNumber(row.last_event_sequence)) {
      throw new Error("Invalid message sequence row.");
    }
    sequences[row.message_id] = row.last_event_sequence;
  }
  return sequences;
}

/** A settled history with one message still streaming at the end of it. */
function streamingSnapshot(agent: AgentSummary, settled: number): ConversationSnapshot {
  const settledMessages: ConversationMessage[] = Array.from({ length: settled }, (_, index) => ({
    id: `settled-${index}`,
    turnId: "turn-0",
    author: index % 2 === 0 ? "user" : "assistant",
    text: `Settled message ${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 20, 10, 0, index)).toISOString(),
    status: "completed",
  }));
  return {
    agentId: agent.id,
    threadId: agent.threadId,
    activeTurnId: "turn-1",
    revision: 0,
    messages: [
      ...settledMessages,
      {
        id: "assistant-live",
        turnId: "turn-1",
        author: "assistant",
        text: "",
        createdAt: "2026-08-20T11:00:00.000Z",
        status: "streaming",
      },
    ],
  };
}

function conversationSnapshot(agent: AgentSummary, text: string): ConversationSnapshot {
  return {
    agentId: agent.id,
    threadId: agent.threadId,
    activeTurnId: null,
    revision: 0,
    messages: [
      {
        id: "assistant-1",
        turnId: "turn-1",
        author: "assistant",
        text,
        createdAt: "2026-08-20T10:00:00.000Z",
        status: "completed",
      },
    ],
  };
}

function withoutAttachments(message: ConversationMessage): ConversationMessage {
  const result = { ...message };
  delete result.attachments;
  return result;
}
