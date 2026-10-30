// A short-lived connection that calls Computer Use tools on the daemon, for the fast path.
//
// `CuaDriverDaemonClient` is the rim's read-only connection and sends nothing the desktop can feel.
// This one is the opposite: it clicks, types and scrolls, so it is a separate class that lives for
// one fast run and ends its own lease when the run ends. The daemon's line protocol is the same.

import { randomUUID } from "node:crypto";
import { connect, type Socket } from "node:net";
import { type DynamicRecord, isDynamicRecord } from "@robot/contracts/runtime-values";
import { Effect } from "effect";
import { CuaDriverFailure } from "./cua-driver-effects";

/** One tool answer: the structured payload, and whether the driver called it an error. */
export interface DriverToolResult {
  isError: boolean;
  structured: DynamicRecord | null;
  text: string;
}

/** The tools of this connection, as far as the fast path calls them. */
export type DriverToolCall = (name: string, args: DynamicRecord) => Effect.Effect<DriverToolResult, CuaDriverFailure>;

/** A snapshot reads an accessibility tree, which takes longer than an input event. */
const SNAPSHOT_TIMEOUT_MS = 10_000;
const ACTION_TIMEOUT_MS = 6_000;
const MAX_RESPONSE_BYTES = 16_777_216;

export class CuaDriverToolClient {
  readonly #socketPath: () => string | null;
  readonly #sessionId = `openownbot-fast-${randomUUID().slice(0, 8)}`;
  #socket: Socket | null = null;
  #buffer = "";
  #pending: { resolve: (value: unknown) => void; reject: (error: Error) => void } | null = null;

  constructor(socketPath: () => string | null) {
    this.#socketPath = socketPath;
  }

  readonly call: DriverToolCall = (name, args) =>
    this.#request({
      method: "call",
      name,
      args,
      session_id: this.#sessionId,
      client_kind: "cli",
    }).pipe(
      Effect.timeoutOrElse({
        duration: name === "get_window_state" ? SNAPSHOT_TIMEOUT_MS : ACTION_TIMEOUT_MS,
        orElse: () => Effect.fail(new CuaDriverFailure({ cause: new Error("The Computer Use driver was too slow.") })),
      }),
      Effect.map(toToolResult),
    );

  /** Ends the lease and drops the connection. Safe to call when nothing is connected. */
  readonly close: Effect.Effect<void> = Effect.gen({ self: this }, function* () {
    if (this.#socket) {
      yield* this.#request({ method: "session_end", session_id: this.#sessionId, client_kind: "cli" }).pipe(
        Effect.timeoutOption(1_000),
        Effect.ignore,
      );
    }
  }).pipe(Effect.ensuring(Effect.sync(() => this.#drop(new Error("The connection was closed.")))));

  #request = Effect.fn("CuaDriverTool.request")(function* (this: CuaDriverToolClient, payload: DynamicRecord) {
    if (this.#pending) return yield* new CuaDriverFailure({ cause: new Error("A tool call is already running.") });
    const socket = yield* this.#connection();
    return yield* Effect.callback<unknown, CuaDriverFailure>((resume) => {
      this.#pending = {
        resolve: (value) => resume(Effect.succeed(value)),
        reject: (cause) => resume(Effect.fail(new CuaDriverFailure({ cause }))),
      };
      try {
        socket.write(`${JSON.stringify(payload)}\n`);
      } catch (error) {
        this.#drop(error instanceof Error ? error : new Error(String(error)));
      }
      // Replies carry no id, so an interrupted call must close the socket before another call.
      return Effect.sync(() => {
        if (this.#pending) this.#drop(new Error("The tool call was interrupted."));
      });
    });
  });

  #connection = Effect.fn("CuaDriverTool.connect")(function* (this: CuaDriverToolClient) {
    const existing = this.#socket;
    if (existing && !existing.destroyed) return existing;
    const path = this.#socketPath();
    if (!path) return yield* new CuaDriverFailure({ cause: new Error("The Computer Use driver is not running.") });
    return yield* Effect.callback<Socket, CuaDriverFailure>((resume) => {
      const opening = connect(path);
      let connected = false;
      const fail = (cause: Error) => resume(Effect.fail(new CuaDriverFailure({ cause })));
      const ready = () => {
        connected = true;
        opening.removeListener("error", fail);
        this.#socket = opening;
        this.#buffer = "";
        opening.setEncoding("utf8");
        opening.on("data", (chunk: string) => this.#read(chunk));
        opening.on("error", (error) => this.#drop(error));
        opening.on("close", () => this.#drop(new Error("The Computer Use driver closed the connection.")));
        resume(Effect.succeed(opening));
      };
      opening.once("error", fail);
      opening.once("connect", ready);
      return Effect.sync(() => {
        opening.removeListener("connect", ready);
        opening.removeListener("error", fail);
        if (!connected) opening.destroy();
      });
    });
  });

  #read(chunk: string): void {
    this.#buffer += chunk;
    const newline = this.#buffer.indexOf("\n");
    if (newline >= 0) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      this.#answer(line);
    } else if (this.#buffer.length > MAX_RESPONSE_BYTES) {
      this.#drop(new Error("The Computer Use driver answered with more than this connection reads."));
    }
  }

  #answer(line: string): void {
    const pending = this.#pending;
    this.#pending = null;
    if (!pending) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      pending.reject(new Error("The Computer Use driver answered with no JSON."));
      return;
    }
    if (!isDynamicRecord(parsed) || parsed.ok !== true) {
      const message =
        isDynamicRecord(parsed) && typeof parsed.error === "string" ? parsed.error : "the request was refused";
      pending.reject(new Error(`The Computer Use driver refused a call: ${message}`));
      return;
    }
    pending.resolve(parsed.result);
  }

  #drop(error: Error): void {
    const socket = this.#socket;
    const pending = this.#pending;
    this.#socket = null;
    this.#pending = null;
    this.#buffer = "";
    pending?.reject(error);
    if (socket) {
      socket.removeAllListeners();
      socket.destroy();
    }
  }
}

function toToolResult(result: unknown): DriverToolResult {
  if (!isDynamicRecord(result)) return { isError: true, structured: null, text: "" };
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((part) => (isDynamicRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
  return {
    isError: result.isError === true,
    structured: isDynamicRecord(result.structuredContent) ? result.structuredContent : null,
    text,
  };
}
