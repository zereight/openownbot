import { Effect } from "effect";

export interface GenerationRetryOptions {
  /** How many tries in all, the first included. */
  attempts: number;
  delayMs: number;
  /** Whether another try can help. A usage limit or a busy model cannot be fixed by waiting two seconds. */
  retryable: (message: string) => boolean;
  /** Called before each new try with the number of the try that failed. */
  onRetry: (failedAttempt: number, message: string) => void;
}

/**
 * Runs a model call again when it fails in a way that a new try can fix. A provider process that
 * stopped while idle, or a request that dropped, fails at once and works on the next try, and a
 * workflow that waits for the user to press Run again loses the whole run for it.
 */
export function withGenerationRetry<A>(
  run: () => Effect.Effect<A, { message: string }>,
  options: GenerationRetryOptions,
  attempt = 1,
): Effect.Effect<A, { message: string }> {
  return run().pipe(
    Effect.catch((failure) => {
      if (attempt >= options.attempts || !options.retryable(failure.message)) return Effect.fail(failure);
      options.onRetry(attempt, failure.message);
      return Effect.sleep(options.delayMs).pipe(Effect.flatMap(() => withGenerationRetry(run, options, attempt + 1)));
    }),
  );
}
