// Best-effort per-IP limiter to protect the API credit (PRD NF05).
// In-memory, so each serverless instance counts separately; it blunts casual abuse, not a determined attacker.
const hits = new Map<string, number[]>();

export function tooMany(req: Request, key: string, perMinute: number, perHour: number): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const k = `${key}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(k) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.filter((t) => now - t < 60_000).length >= perMinute || recent.length >= perHour) { hits.set(k, recent); return true; }
  recent.push(now); hits.set(k, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}
