export const STEP_TIMEOUT_MS = 20_000;

export class StepTimeoutError extends Error {
  readonly step: string;

  constructor(step: string, ms = STEP_TIMEOUT_MS) {
    super(`${step} timed out after ${Math.round(ms / 1000)} seconds. The public GIWA RPC did not answer. Retry.`);
    this.name = "StepTimeoutError";
    this.step = step;
  }
}

export function stepOf(error: unknown) {
  if (error instanceof StepTimeoutError) return error.step;
  if (error && typeof error === "object" && "step" in error && typeof error.step === "string") return error.step;
  return "Preview Config";
}

/** Rejects the caller after `ms` even if the inner RPC never settles. */
export function withTimeout<T>(step: string, fn: () => Promise<T>, ms = STEP_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new StepTimeoutError(step, ms)), ms);
    fn().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
