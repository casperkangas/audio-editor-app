/**
 * lib/editing/history.ts
 * Immutable command history for undo/redo.
 */

import type { EditHistory, EditOperation } from '../types';

export function createHistory(initial: EditOperation[] = []): EditHistory {
  return { past: [], present: initial, future: [] };
}

export const canUndo = (h: EditHistory) => h.past.length > 0;
export const canRedo = (h: EditHistory) => h.future.length > 0;

export function pushOperation(h: EditHistory, op: EditOperation): EditHistory {
  return { past: [...h.past, h.present], present: [...h.present, op], future: [] };
}

export function undo(h: EditHistory): EditHistory {
  if (!canUndo(h)) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: EditHistory): EditHistory {
  if (!canRedo(h)) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

export function resetHistory(initial: EditOperation[] = []): EditHistory {
  return createHistory(initial);
}
