import type { LocationPoint } from '@/api/endpoints/driver';

import { capFor, enqueue, filterAccuracy, MAX_BATCH, takeBatch } from '../queue';

const at = (s: number, accuracy: number | null = 5): LocationPoint => ({
  lat: 23.79,
  lng: 90.4,
  accuracy,
  recorded_at: new Date(Date.UTC(2026, 10, 13, 8, 0, s)).toISOString(),
});

describe('location queue', () => {
  it('keeps points in time order and drops duplicates', () => {
    const q = enqueue([at(5)], [at(2), at(5), at(9)], 'idle');
    expect(q.map((p) => p.recorded_at)).toEqual([at(2).recorded_at, at(5).recorded_at, at(9).recorded_at]);
  });

  it('keeps the newest points when the cap is reached', () => {
    const many = Array.from({ length: capFor('idle') + 5 }, (_, i) => at(i % 60, 5)).map((p, i) => ({
      ...p,
      recorded_at: new Date(Date.UTC(2026, 10, 13, 8, 0, 0) + i * 1000).toISOString(),
    }));
    const q = enqueue([], many, 'idle');
    expect(q).toHaveLength(capFor('idle'));
    expect(q[q.length - 1]).toEqual(many[many.length - 1]);
    expect(capFor('trip')).toBeGreaterThan(capFor('idle'));
  });

  it('sends at most 20 points at a time, oldest first', () => {
    const points = Array.from({ length: 45 }, (_, i) => ({ ...at(0), recorded_at: new Date(Date.UTC(2026, 10, 13) + i * 1000).toISOString() }));
    const { batch, rest } = takeBatch(points);
    expect(batch).toHaveLength(MAX_BATCH);
    expect(batch[0]).toEqual(points[0]);
    expect(rest).toHaveLength(25);
  });

  it('drops vague fixes but never leaves nothing', () => {
    expect(filterAccuracy([at(1, 300), at(2, 8)])).toEqual([at(2, 8)]);
    expect(filterAccuracy([at(1, 300), at(2, 400)])).toEqual([at(2, 400)]);
    expect(filterAccuracy([at(1, null)])).toEqual([at(1, null)]);
  });

  it('ignores points with a broken timestamp', () => {
    expect(enqueue([], [{ ...at(1), recorded_at: 'yesterday' }], 'idle')).toEqual([]);
  });
});
