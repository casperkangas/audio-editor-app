/**
 * hooks/useWaveform.ts
 *
 * Thin hook that manages the selection state and exposes helpers
 * for converting selection times to/from operation params.
 * The actual peaks come from useEditHistory; this hook handles the
 * user-interaction layer.
 */

import { useState, useCallback } from 'react';
import type { SelectionRegion } from '../types';

export interface UseWaveformResult {
  selection:          SelectionRegion | null;
  setSelection:       (region: SelectionRegion | null) => void;
  clearSelection:     () => void;
  hasSelection:       boolean;
  selectionDuration:  number;
}

export function useWaveform(): UseWaveformResult {
  const [selection, setSelectionState] = useState<SelectionRegion | null>(null);

  const setSelection = useCallback((region: SelectionRegion | null) => {
    setSelectionState(region);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionState(null);
  }, []);

  const hasSelection       = selection !== null && selection.endTime > selection.startTime;
  const selectionDuration  = hasSelection ? (selection!.endTime - selection!.startTime) : 0;

  return {
    selection,
    setSelection,
    clearSelection,
    hasSelection,
    selectionDuration,
  };
}
