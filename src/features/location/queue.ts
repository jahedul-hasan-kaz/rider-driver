import type { LocationPoint } from '@/api/endpoints/driver';

// Location buffer (docs/spec/04-integration.md §11.2). Points wait here until they are sent, in order, in batches of
// at most 20. When the network is down the buffer keeps the newest points: about 30 minutes while idle, and a larger
// cap during a trip, because trip points are what the fare distance is measured from.

export const MAX_BATCH = 20;
const IDLE_CAP = 180; // ~30 min at one point every 10 s
const TRIP_CAP = 1200; // ~60 min at one point every 3 s

export type QueueMode = 'idle' | 'trip';

export function capFor(mode: QueueMode): number {
  return mode === 'trip' ? TRIP_CAP : IDLE_CAP;
}

const time = (p: LocationPoint) => Date.parse(p.recorded_at);

/** Adds points, keeps them in time order without duplicates, and drops the oldest beyond the cap. */
export function enqueue(queue: LocationPoint[], incoming: LocationPoint[], mode: QueueMode): LocationPoint[] {
  const seen = new Set(queue.map((p) => p.recorded_at));
  const merged = [...queue];
  for (const point of incoming) {
    if (!Number.isFinite(time(point)) || seen.has(point.recorded_at)) continue;
    seen.add(point.recorded_at);
    merged.push(point);
  }
  merged.sort((a, b) => time(a) - time(b));
  const cap = capFor(mode);
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

/** The next batch to send (oldest first) and what stays queued. */
export function takeBatch(queue: LocationPoint[]): { batch: LocationPoint[]; rest: LocationPoint[] } {
  return { batch: queue.slice(0, MAX_BATCH), rest: queue.slice(MAX_BATCH) };
}

/**
 * Drops fixes that are too vague to be useful when a better one is recent (§11.2). Never invents or smooths points:
 * the server does its own filtering for the fare distance.
 */
export function filterAccuracy(points: LocationPoint[], maxAccuracyM = 100): LocationPoint[] {
  const good = points.filter((p) => p.accuracy == null || p.accuracy <= maxAccuracyM);
  return good.length > 0 ? good : points.slice(-1);
}
