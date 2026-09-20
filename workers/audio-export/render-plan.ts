import type { ExportOperationSnapshot } from "../../apps/web/api/_lib/export.validation.js";

export interface SourceRange {
  readonly startTime: number;
  readonly endTime: number;
}

export interface VolumeEffect extends SourceRange {
  readonly type: "volume";
  readonly gain: number;
}

export interface FadeEffect {
  readonly type: "fade-in" | "fade-out";
  readonly startTime: number;
  readonly duration: number;
}

export type RenderEffect = VolumeEffect | FadeEffect;

export interface RenderSegment extends SourceRange {
  readonly effects: readonly RenderEffect[];
}

export interface RenderPlan {
  readonly durationSeconds: number;
  readonly segments: readonly RenderSegment[];
}

export class RenderPlanError extends Error {
  readonly errorCode: "INVALID_OPERATION" | "SOURCE_INVALID";

  constructor(errorCode: RenderPlanError["errorCode"], message: string) {
    super(message);
    this.name = "RenderPlanError";
    this.errorCode = errorCode;
  }
}

interface MutableSegment extends SourceRange {
  effects: RenderEffect[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readNumber(operation: ExportOperationSnapshot, name: string): number {
  const value = operation.params[name];
  if (!isFiniteNumber(value)) {
    throw new RenderPlanError(
      "INVALID_OPERATION",
      `Operation ${operation.id} has an invalid ${name} parameter.`,
    );
  }
  return value;
}

function readRange(
  operation: ExportOperationSnapshot,
  durationSeconds: number,
): SourceRange {
  const startTime = readNumber(operation, "startTime");
  const endTime = readNumber(operation, "endTime");
  if (startTime < 0 || endTime > durationSeconds || startTime >= endTime) {
    throw new RenderPlanError(
      "INVALID_OPERATION",
      `Operation ${operation.id} is outside the source duration.`,
    );
  }
  return { startTime, endTime };
}

function splitAt(
  segments: readonly MutableSegment[],
  splitTime: number,
): MutableSegment[] {
  const result: MutableSegment[] = [];
  for (const segment of segments) {
    if (splitTime <= segment.startTime || splitTime >= segment.endTime) {
      result.push({ ...segment, effects: [...segment.effects] });
      continue;
    }

    result.push(
      {
        startTime: segment.startTime,
        endTime: splitTime,
        effects: [...segment.effects],
      },
      {
        startTime: splitTime,
        endTime: segment.endTime,
        effects: [...segment.effects],
      },
    );
  }
  return result;
}

function retainRange(
  segments: readonly MutableSegment[],
  range: SourceRange,
): MutableSegment[] {
  const result: MutableSegment[] = [];
  for (const segment of segments) {
    const startTime = Math.max(segment.startTime, range.startTime);
    const endTime = Math.min(segment.endTime, range.endTime);
    if (startTime < endTime) {
      result.push({ startTime, endTime, effects: [...segment.effects] });
    }
  }
  return result;
}

function removeRange(
  segments: readonly MutableSegment[],
  range: SourceRange,
): MutableSegment[] {
  const result: MutableSegment[] = [];
  for (const segment of segments) {
    if (
      range.endTime <= segment.startTime ||
      range.startTime >= segment.endTime
    ) {
      result.push({ ...segment, effects: [...segment.effects] });
      continue;
    }

    if (segment.startTime < range.startTime) {
      result.push({
        startTime: segment.startTime,
        endTime: range.startTime,
        effects: [...segment.effects],
      });
    }
    if (range.endTime < segment.endTime) {
      result.push({
        startTime: range.endTime,
        endTime: segment.endTime,
        effects: [...segment.effects],
      });
    }
  }
  return result;
}

function addEffect(
  segments: readonly MutableSegment[],
  effect: RenderEffect,
): MutableSegment[] {
  return segments.map((segment) => ({
    ...segment,
    effects:
      effect.type === "volume"
        ? segment.startTime < effect.endTime &&
          segment.endTime > effect.startTime
          ? [...segment.effects, effect]
          : [...segment.effects]
        : segment.startTime < effect.startTime + effect.duration &&
            segment.endTime > effect.startTime
          ? [...segment.effects, effect]
          : [...segment.effects],
  }));
}

function validateDuration(durationSeconds: number): void {
  if (!isFiniteNumber(durationSeconds) || durationSeconds <= 0) {
    throw new RenderPlanError(
      "SOURCE_INVALID",
      "The source duration is invalid.",
    );
  }
}

export function createRenderPlan(
  operations: readonly ExportOperationSnapshot[],
  durationSeconds: number,
): RenderPlan {
  validateDuration(durationSeconds);
  let segments: MutableSegment[] = [
    { startTime: 0, endTime: durationSeconds, effects: [] },
  ];

  for (const operation of operations) {
    switch (operation.type) {
      case "trim":
        segments = retainRange(segments, readRange(operation, durationSeconds));
        break;
      case "cut":
      case "delete":
        segments = removeRange(segments, readRange(operation, durationSeconds));
        break;
      case "split": {
        const splitTime = readNumber(operation, "at");
        if (splitTime <= 0 || splitTime >= durationSeconds) {
          throw new RenderPlanError(
            "INVALID_OPERATION",
            `Operation ${operation.id} is outside the source duration.`,
          );
        }
        segments = splitAt(segments, splitTime);
        break;
      }
      case "volume": {
        const range = readRange(operation, durationSeconds);
        const gain = readNumber(operation, "gain");
        if (gain < 0 || gain > 2) {
          throw new RenderPlanError(
            "INVALID_OPERATION",
            `Operation ${operation.id} has an invalid gain.`,
          );
        }
        segments = addEffect(segments, { ...range, type: "volume", gain });
        break;
      }
      case "fade-in":
      case "fade-out": {
        const startTime = readNumber(operation, "startTime");
        const duration = readNumber(operation, "duration");
        if (
          startTime < 0 ||
          duration <= 0 ||
          startTime + duration > durationSeconds
        ) {
          throw new RenderPlanError(
            "INVALID_OPERATION",
            `Operation ${operation.id} is outside the source duration.`,
          );
        }
        segments = addEffect(segments, {
          type: operation.type,
          startTime,
          duration,
        });
        break;
      }
      default:
        throw new RenderPlanError(
          "INVALID_OPERATION",
          `Operation ${operation.id} is not supported by the render plan.`,
        );
    }
  }

  return {
    durationSeconds,
    segments: segments.map((segment) => ({
      ...segment,
      effects: [...segment.effects],
    })),
  };
}
