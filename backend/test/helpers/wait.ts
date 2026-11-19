const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_INTERVAL_MS = 25;

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}
