
type EffectTemplate =
  | { readonly type: "volume"; readonly gain: number }
  | { readonly type: "fade-in" | "fade-out" };
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

function clipEffects(
  effects: readonly RenderEffect[],
  range: SourceRange,
): RenderEffect[] {
  return effects.flatMap<RenderEffect>((effect) => {
    const effectEnd =
      effect.type === "volume"
        ? effect.endTime
        : effect.startTime + effect.duration;
    const startTime = Math.max(effect.startTime, range.startTime);
    const endTime = Math.min(effectEnd, range.endTime);
    if (startTime >= endTime) return [];

    if (effect.type === "volume") {
      return [{ ...effect, startTime, endTime }];
    }
    return [{ ...effect, startTime, duration: endTime - startTime }];
  });
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

function timelineDuration(segments: readonly MutableSegment[]): number {
  return segments.reduce(
    (duration, segment) => duration + segment.endTime - segment.startTime,
    0,
  );
}

function sliceTimeline(
  segments: readonly MutableSegment[],
  range: SourceRange,
): MutableSegment[] {
  const result: MutableSegment[] = [];
  let timelineStart = 0;

  for (const segment of segments) {
    const segmentDuration = segment.endTime - segment.startTime;
    const startTime = Math.max(range.startTime, timelineStart);
    const endTime = Math.min(
      range.endTime,
      timelineStart + segmentDuration,
    );
    if (startTime < endTime) {
      const sourceStartTime =
        segment.startTime + (startTime - timelineStart);
      const sourceEndTime = segment.startTime + (endTime - timelineStart);
      result.push({
        startTime: sourceStartTime,
        endTime: sourceEndTime,
        effects: clipEffects(segment.effects, {
          startTime: sourceStartTime,
          endTime: sourceEndTime,
        }),
      });
    }
    timelineStart += segmentDuration;
    if (timelineStart >= range.endTime) break;
  }
  return result;
}

function removeTimelineRange(
  segments: readonly MutableSegment[],
  range: SourceRange,
): MutableSegment[] {
  const duration = timelineDuration(segments);
  return [
    ...sliceTimeline(segments, { startTime: 0, endTime: range.startTime }),
    ...sliceTimeline(segments, { startTime: range.endTime, endTime: duration }),
  ];
}

function addEffect(
  segments: readonly MutableSegment[],
  range: SourceRange,
  effect: EffectTemplate,
): MutableSegment[] {
  const result: MutableSegment[] = [];
  let timelineStart = 0;

  for (const segment of segments) {
    const segmentDuration = segment.endTime - segment.startTime;
    const overlapStart = Math.max(range.startTime, timelineStart);
    const overlapEnd = Math.min(
      range.endTime,
      timelineStart + segmentDuration,
    );
    const effects = [...segment.effects];
    if (overlapStart < overlapEnd) {
      const startTime = segment.startTime + (overlapStart - timelineStart);
      const endTime = segment.startTime + (overlapEnd - timelineStart);
      effects.push(
        effect.type === "volume"
          ? { ...effect, startTime, endTime }
          : { ...effect, startTime, duration: endTime - startTime },
      );
    }
    result.push({ ...segment, effects });
    timelineStart += segmentDuration;
  }

  return result;
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
  let currentDuration = durationSeconds;

  for (const operation of operations) {
    switch (operation.type) {
      case "trim": {
        const range = readRange(operation, currentDuration);
        segments = sliceTimeline(segments, range);
        currentDuration = range.endTime - range.startTime;
        break;
      }
      case "cut":
      case "delete": {
        const range = readRange(operation, currentDuration);
        segments = removeTimelineRange(segments, range);
        currentDuration -= range.endTime - range.startTime;
        break;
      }
      case "split": {
        const splitTime = readNumber(operation, "at");
        if (splitTime <= 0 || splitTime >= currentDuration) {
          throw new RenderPlanError(
            "INVALID_OPERATION",
            `Operation ${operation.id} is outside the source duration.`,
          );
        }
        segments = sliceTimeline(segments, {
          startTime: 0,
          endTime: splitTime,
        });
        currentDuration = splitTime;
        break;
      }
      case "volume": {
        const range = readRange(operation, currentDuration);
        const gain = readNumber(operation, "gain");
        if (gain < 0 || gain > 2) {
          throw new RenderPlanError(
            "INVALID_OPERATION",
            `Operation ${operation.id} has an invalid gain.`,
          );
        }
        segments = addEffect(segments, range, { type: "volume", gain });
        break;
      }
      case "fade-in":
      case "fade-out": {
        const startTime = readNumber(operation, "startTime");
        const duration = readNumber(operation, "duration");
        if (
          startTime < 0 ||
          duration <= 0 ||
          startTime + duration > currentDuration
        ) {
          throw new RenderPlanError(
            "INVALID_OPERATION",
            `Operation ${operation.id} is outside the source duration.`,
          );
        }
        segments = addEffect(
          segments,
          { startTime, endTime: startTime + duration },
          { type: operation.type },
        );
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
    durationSeconds: currentDuration,
    segments: segments.map((segment) => ({
      ...segment,
      effects: [...segment.effects],
    })),
  };
}
