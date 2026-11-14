/**
 * A per-visitor cap on the endpoints that spend paid credits, so a shared link cannot be run up by one caller.
 * Counts live in this server's memory: a host that runs several copies gives each its own count, so the cap is a brake, not a guarantee.
 */
const WINDOW_MS = 60_000;
const MAX_VISITORS = 5000;
const windows = new Map<string, { start: number; count: number }>();

/** Returns a 429 response when this visitor has used up `perMinute` calls to `bucket`, otherwise null. */
export function tooMany(request: Request, bucket: string, perMinute: number): Response | null {
  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${bucket}:${visitor}`;
  const now = Date.now();
  const current = windows.get(key);
  if (!current || now - current.start >= WINDOW_MS) {
    if (windows.size >= MAX_VISITORS) {
      for (const [old, entry] of windows) if (now - entry.start >= WINDOW_MS) windows.delete(old);
      // Still full of live windows: refuse rather than grow without bound.
      if (windows.size >= MAX_VISITORS) return refuse(WINDOW_MS);
    }
    windows.set(key, { start: now, count: 1 });
    return null;
  }
  current.count += 1;
  return current.count > perMinute ? refuse(WINDOW_MS - (now - current.start)) : null;
}

const refuse = (waitMs: number) =>
  Response.json(
    { error: "Too many requests. Try again in a moment." },
    { status: 429, headers: { "retry-after": String(Math.ceil(waitMs / 1000)) } },
  );
