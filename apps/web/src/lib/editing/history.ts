/**
 * lib/editing/history.ts
 *
 * Immutable command-history for undo/redo.
 *
 * The state stores three parallel stacks:
 *   past    – snapshots before each action (oldest first)
 *   present – the currently active operations list
 *   future  – snapshots that can be re-applied via redo (most-recent first)
 *
 * Pushing a new action clears the future (same behaviour as every major editor).
 */

import type { EditHistory, EditOperation } from '../../types';

// ─── Factory ──────────────────────────────────────────────────────────────

export function createHistory(initial: EditOperation[] = []): EditHistory {
  return {
    past: [],
    present: initial,
    future: [],
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────

export function canUndo(history: EditHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: EditHistory): boolean {
  return history.future.length > 0;
}

// ─── Mutations (all return new state; nothing is mutated in-place) ─────────

/**
 * Apply a new operation.  Saves the current present to past and clears future.
 */
export function pushOperation(
  history: EditHistory,
  operation: EditOperation,
): EditHistory {
  return {
    past: [...history.past, history.present],
    present: [...history.present, operation],
    future: [],
  };
}

/**
 * Undo the last operation.  Moves present to future[0] and restores past[-1].
 * Returns the same state if there is nothing to undo.
 */
export function undo(history: EditHistory): EditHistory {
  if (!canUndo(history)) return history;

  const previous = history.past[history.past.length - 1];
  return {
    past:    history.past.slice(0, -1),
    present: previous,
    future:  [history.present, ...history.future],
  };
}

/**
 * Redo the most recently undone operation.
 * Returns the same state if there is nothing to redo.
 */
export function redo(history: EditHistory): EditHistory {
  if (!canRedo(history)) return history;

  const next = history.future[0];
  return {
    past:    [...history.past, history.present],
    present: next,
    future:  history.future.slice(1),
  };
}

/**
 * Completely reset the history (e.g. when a new file is loaded).
 */
export function resetHistory(initial: EditOperation[] = []): EditHistory {
  return createHistory(initial);
}
