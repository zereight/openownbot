import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { withGenerationRetry } from "./generation-retry";

const failure = (message: string) => ({ message });
const options = (retried: string[] = []) => ({
  attempts: 3,
  delayMs: 0,
  retryable: (message: string) => message === "again",
  onRetry: (attempt: number, message: string) => retried.push(`${attempt}:${message}`),
});

describe("withGenerationRetry", () => {
  it("returns the answer of the first attempt without a retry", async () => {
    const retried: string[] = [];
    const answer = await Effect.runPromise(withGenerationRetry(() => Effect.succeed("yes"), options(retried)));
    expect(answer).toBe("yes");
    expect(retried).toEqual([]);
  });

  it("tries again after a failure that is worth another try, and returns the later answer", async () => {
    const retried: string[] = [];
    let calls = 0;
    const answer = await Effect.runPromise(
      withGenerationRetry(() => (++calls < 3 ? Effect.fail(failure("again")) : Effect.succeed("no")), options(retried)),
    );
    expect(answer).toBe("no");
    expect(calls).toBe(3);
    expect(retried).toEqual(["1:again", "2:again"]);
  });

  it("stops after the last attempt and reports the last failure", async () => {
    let calls = 0;
    const result = await Effect.runPromise(
      withGenerationRetry(() => {
        calls += 1;
        return Effect.fail(failure("again"));
      }, options()).pipe(Effect.flip),
    );
    expect(result).toEqual({ message: "again" });
    expect(calls).toBe(3);
  });

  it("does not retry a failure that another try cannot fix", async () => {
    let calls = 0;
    const result = await Effect.runPromise(
      withGenerationRetry(() => {
        calls += 1;
        return Effect.fail(failure("usage limit"));
      }, options()).pipe(Effect.flip),
    );
    expect(result).toEqual({ message: "usage limit" });
    expect(calls).toBe(1);
  });
});
