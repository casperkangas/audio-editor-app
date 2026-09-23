import type {
  CutParams,
  EditOperation,
  EditOperationParams,
  EditOperationType,
  FadeInParams,
  FadeOutParams,
  SplitParams,
  TrimParams,
  VolumeParams,
} from '../../types';

export interface EditPlanSnapshot {
  readonly sourceRevision: number;
  readonly sourceDuration: number;
  readonly currentDuration: number;
  readonly operations: readonly EditOperation[];
}

export interface EditPlanInput {
  sourceRevision: number;
  sourceDuration: number;
  currentDuration: number;
  operations: readonly EditOperation[];
}

const OPERATION_TYPES: readonly EditOperationType[] = [
  'trim',
  'cut',
  'split',
  'volume',
  'fade-in',
  'fade-out',
];

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
}

function assertTimeBounds(startTime: number, endTime: number, duration: number): void {
  assertFinite(startTime, 'startTime');
  assertFinite(endTime, 'endTime');
  if (startTime < 0 || endTime <= startTime || endTime > duration) {
    throw new Error('Operation time bounds are invalid');
  }
}

function validateParameters(
  type: EditOperationType,
  params: EditOperationParams,
  duration: number,
): void {
  switch (type) {
    case 'trim':
    case 'cut':
    case 'volume':
      assertTimeBounds(
        (params as TrimParams | CutParams | VolumeParams).startTime,
        (params as TrimParams | CutParams | VolumeParams).endTime,
        duration,
      );
      if (type === 'volume') {
        const gain = (params as VolumeParams).gain;
        assertFinite(gain, 'gain');
        if (gain < 0 || gain > 2) {
          throw new Error('gain must be between 0 and 2');
        }
      }
      return;
    case 'split': {
      const at = (params as SplitParams).at;
      assertFinite(at, 'at');
      if (at <= 0 || at >= duration) {
        throw new Error('Split point is outside audio bounds');
      }
      return;
    }
    case 'fade-in':
    case 'fade-out': {
      const fade = params as FadeInParams | FadeOutParams;
      assertFinite(fade.startTime, 'startTime');
      assertFinite(fade.duration, 'duration');
      if (
        fade.startTime < 0 ||
        fade.duration <= 0 ||
        fade.startTime + fade.duration > duration
      ) {
        throw new Error('Fade bounds are invalid');
      }
      return;
    }
  }
}

function cloneOperation(operation: EditOperation): EditOperation {
  return {
    ...operation,
    params: { ...operation.params } as EditOperationParams,
  };
}

export function serializeEditPlan(input: EditPlanInput): EditPlanSnapshot {
  assertFinite(input.sourceRevision, 'sourceRevision');
  assertFinite(input.sourceDuration, 'sourceDuration');
  assertFinite(input.currentDuration, 'currentDuration');

  if (!Number.isInteger(input.sourceRevision) || input.sourceRevision < 1) {
    throw new Error('sourceRevision must be a positive integer');
  }
  if (input.sourceDuration <= 0) {
    throw new Error('sourceDuration must be positive');
  }
  if (input.currentDuration <= 0 || input.currentDuration > input.sourceDuration) {
    throw new Error('currentDuration must be within source bounds');
  }

  const operations = input.operations.map((operation) => {
    if (!OPERATION_TYPES.includes(operation.type)) {
      throw new Error(`Unsupported edit operation: ${operation.type}`);
    }
    if (!operation.id || !Number.isFinite(operation.createdAt)) {
      throw new Error('Edit operation metadata is invalid');
    }
    validateParameters(operation.type, operation.params, input.sourceDuration);
    return cloneOperation(operation);
  });

  return {
    sourceRevision: input.sourceRevision,
    sourceDuration: input.sourceDuration,
    currentDuration: input.currentDuration,
    operations,
  };
}