export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "task"
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}
