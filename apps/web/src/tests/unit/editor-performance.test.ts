import { describe, expect, it } from 'vitest';
import { serializeEditPlan } from '../../lib/editing/serializeEditPlan';
import type { EditOperation } from '../../types';

describe('editor interaction budget', () => {
  it('serializes a normal edit snapshot within 200 milliseconds', () => {
    const operations: EditOperation[] = Array.from({ length: 20 }, (_, index) => ({
      id: `op_${index}`,
      type: 'volume',
      params: { startTime: index * 0.1, endTime: index * 0.1 + 0.05, gain: 1.1 },
      createdAt: index,
    }));
    const startedAt = performance.now();

    serializeEditPlan({
      sourceRevision: 1,
      sourceDuration: 10,
      currentDuration: 9,
      operations,
    });

    expect(performance.now() - startedAt).toBeLessThan(200);
  });
});