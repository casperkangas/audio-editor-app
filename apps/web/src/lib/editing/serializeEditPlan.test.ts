import { describe, expect, it } from 'vitest';
import { serializeEditPlan } from './serializeEditPlan';
import type { EditOperation } from '../../types';

const operation: EditOperation = {
  id: 'op_1',
  type: 'trim',
  params: { startTime: 1, endTime: 4 },
  createdAt: 123,
};

describe('serializeEditPlan', () => {
  it('serializes an ordered immutable snapshot', () => {
    const operations = [operation];
    const snapshot = serializeEditPlan({
      sourceRevision: 3,
      sourceDuration: 8,
      currentDuration: 3,
      operations,
    });

    expect(snapshot).toEqual({
      sourceRevision: 3,
      sourceDuration: 8,
      currentDuration: 3,
      operations,
    });
    expect(snapshot.operations).not.toBe(operations);
  });

  it('rejects unsupported or non-finite operation parameters', () => {
    expect(() => serializeEditPlan({
      sourceRevision: 1,
      sourceDuration: 4,
      currentDuration: 4,
      operations: [{
        ...operation,
        type: 'unknown' as EditOperation['type'],
      }],
    })).toThrow('Unsupported edit operation');

    expect(() => serializeEditPlan({
      sourceRevision: 1,
      sourceDuration: 4,
      currentDuration: 4,
      operations: [{
        ...operation,
        params: { startTime: Number.NaN, endTime: 2 },
      }],
    })).toThrow('finite');
  });

  it('rejects invalid revisions, durations, and out-of-bounds regions', () => {
    expect(() => serializeEditPlan({
      sourceRevision: 0,
      sourceDuration: 4,
      currentDuration: 4,
      operations: [],
    })).toThrow('sourceRevision');

    expect(() => serializeEditPlan({
      sourceRevision: 1,
      sourceDuration: 4,
      currentDuration: 5,
      operations: [],
    })).toThrow('currentDuration');

    expect(() => serializeEditPlan({
      sourceRevision: 1,
      sourceDuration: 4,
      currentDuration: 4,
      operations: [{
        ...operation,
        params: { startTime: 3, endTime: 5 },
      }],
    })).toThrow('bounds');
  });

  it('does not include decoded audio buffers or executable render text', () => {
    const snapshot = serializeEditPlan({
      sourceRevision: 1,
      sourceDuration: 4,
      currentDuration: 3,
      operations: [operation],
    });

    expect(snapshot).not.toHaveProperty('audioBuffer');
    expect(JSON.stringify(snapshot)).not.toContain('ffmpeg');
    expect(JSON.stringify(snapshot)).not.toContain('filtergraph');
  });
});