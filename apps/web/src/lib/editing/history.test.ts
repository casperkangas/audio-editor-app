/**
 * Unit tests for lib/editing/history.ts
 */

import { describe, it, expect } from 'vitest';
import {
  createHistory,
  pushOperation,
  undo,
  redo,
  canUndo,
  canRedo,
  resetHistory,
} from './history';
import type { EditOperation } from '../../types/index';

// ─── Factory ──────────────────────────────────────────────────────────────

function makeOp(type: string = 'trim', id: string = 'op1'): EditOperation {
  return {
    id,
    type: type as EditOperation['type'],
    params: { startTime: 0, endTime: 1 },
    createdAt: Date.now(),
  };
}

// ─── createHistory ────────────────────────────────────────────────────────

describe('createHistory', () => {
  it('starts with empty past and future', () => {
    const h = createHistory();
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
    expect(h.present).toHaveLength(0);
  });

  it('accepts an initial operations array', () => {
    const op = makeOp();
    const h  = createHistory([op]);
    expect(h.present).toEqual([op]);
  });
});

// ─── canUndo / canRedo ────────────────────────────────────────────────────

describe('canUndo / canRedo', () => {
  it('both false on a fresh history', () => {
    const h = createHistory();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('canUndo is true after pushing one operation', () => {
    const h = pushOperation(createHistory(), makeOp());
    expect(canUndo(h)).toBe(true);
  });

  it('canRedo is true after undoing', () => {
    const h0 = pushOperation(createHistory(), makeOp());
    const h1 = undo(h0);
    expect(canRedo(h1)).toBe(true);
  });
});

// ─── pushOperation ────────────────────────────────────────────────────────

describe('pushOperation', () => {
  it('adds the operation to present', () => {
    const op = makeOp('trim', 'op1');
    const h  = pushOperation(createHistory(), op);
    expect(h.present).toContain(op);
  });

  it('moves previous present to past', () => {
    const op1 = makeOp('trim', 'op1');
    const op2 = makeOp('cut',  'op2');
    const h1  = pushOperation(createHistory(), op1);
    const h2  = pushOperation(h1, op2);
    // Each push saves the previous present: createHistory → [op1] saves [], [op1] saves [op1]
    expect(h2.past).toHaveLength(2);
    // The most recent saved past is [op1]
    expect(h2.past[1]).toContain(op1);
  });

  it('clears the future', () => {
    const op1 = makeOp('trim', 'op1');
    const op2 = makeOp('cut',  'op2');
    const op3 = makeOp('volume', 'op3');
    const h   = pushOperation(undo(pushOperation(pushOperation(createHistory(), op1), op2)), op3);
    expect(h.future).toHaveLength(0);
  });

  it('is immutable – does not mutate the source history', () => {
    const h0 = createHistory();
    const op = makeOp();
    pushOperation(h0, op);
    expect(h0.present).toHaveLength(0); // untouched
  });
});

// ─── undo ─────────────────────────────────────────────────────────────────

describe('undo', () => {
  it('restores the previous operations list', () => {
    const op1 = makeOp('trim', 'op1');
    const op2 = makeOp('cut',  'op2');
    const h0  = pushOperation(pushOperation(createHistory(), op1), op2);
    const h1  = undo(h0);
    expect(h1.present).toEqual([op1]);
  });

  it('moves present to future[0]', () => {
    const op = makeOp();
    const h0 = pushOperation(createHistory(), op);
    const h1 = undo(h0);
    expect(h1.future[0]).toContain(op);
  });

  it('is a no-op when there is nothing to undo', () => {
    const h = createHistory();
    const same = undo(h);
    expect(same).toBe(h); // same reference
  });

  it('handles multiple undo steps', () => {
    const ops = ['op1', 'op2', 'op3'].map(id => makeOp('trim', id));
    const h3  = ops.reduce(pushOperation, createHistory());
    const h2  = undo(h3);
    const h1  = undo(h2);
    const h0  = undo(h1);
    expect(h0.present).toHaveLength(0);
    expect(canUndo(h0)).toBe(false);
  });
});

// ─── redo ─────────────────────────────────────────────────────────────────

describe('redo', () => {
  it('restores the next operations list', () => {
    const op1 = makeOp('trim', 'op1');
    const op2 = makeOp('cut',  'op2');
    const h   = undo(pushOperation(pushOperation(createHistory(), op1), op2));
    const hR  = redo(h);
    expect(hR.present).toEqual([op1, op2]);
  });

  it('is a no-op when there is nothing to redo', () => {
    const h    = createHistory();
    const same = redo(h);
    expect(same).toBe(h);
  });

  it('clears future after redo', () => {
    const op  = makeOp();
    const h   = redo(undo(pushOperation(createHistory(), op)));
    expect(h.future).toHaveLength(0);
  });
});

// ─── undo + redo round-trip ───────────────────────────────────────────────

describe('undo/redo round-trip', () => {
  it('restores original present after undo then redo', () => {
    const op1 = makeOp('trim', 'op1');
    const op2 = makeOp('cut',  'op2');
    const h0  = pushOperation(pushOperation(createHistory(), op1), op2);
    const h1  = redo(undo(h0));
    expect(h1.present).toEqual(h0.present);
  });

  it('new push clears redo stack', () => {
    const op1 = makeOp('trim', 'op1');
    const op2 = makeOp('cut',  'op2');
    const op3 = makeOp('volume', 'op3');
    const h   = pushOperation(undo(pushOperation(pushOperation(createHistory(), op1), op2)), op3);
    expect(canRedo(h)).toBe(false);
  });
});

// ─── resetHistory ─────────────────────────────────────────────────────────

describe('resetHistory', () => {
  it('wipes past and future, resets present', () => {
    const op = makeOp();
    const h  = pushOperation(createHistory(), op);
    const r  = resetHistory();
    expect(r.past).toHaveLength(0);
    expect(r.future).toHaveLength(0);
    expect(r.present).toHaveLength(0);
  });

  it('accepts a seed for present', () => {
    const op = makeOp();
    const r  = resetHistory([op]);
    expect(r.present).toContain(op);
  });
});
