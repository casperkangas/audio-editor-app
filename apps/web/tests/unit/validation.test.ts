import { describe, it, expect } from "vitest";
import {
  validateAudioFile,
  MAX_FILE_SIZE_BYTES,
  type AudioFileLike,
} from "../../src/lib/validation/validateAudioFile.ts";

// Helpers
function makeFile(overrides: Partial<AudioFileLike> = {}): AudioFileLike {
  return {
    name: "test.mp3",
    size: 1024 * 1024, // 1 MB
    type: "audio/mpeg",
    ...overrides,
  };
}

// --- FR-002, FR-003, SC-006 ---

describe("validateAudioFile — supported formats", () => {
  it("accepts MP3", () => {
    expect(validateAudioFile(makeFile({ type: "audio/mpeg", name: "track.mp3" }))).toEqual({ valid: true });
  });

  it("accepts WAV (audio/wav)", () => {
    expect(validateAudioFile(makeFile({ type: "audio/wav", name: "track.wav" }))).toEqual({ valid: true });
  });

  it("accepts WAV (audio/x-wav)", () => {
    expect(validateAudioFile(makeFile({ type: "audio/x-wav", name: "track.wav" }))).toEqual({ valid: true });
  });

  it("accepts FLAC (audio/flac)", () => {
    expect(validateAudioFile(makeFile({ type: "audio/flac", name: "track.flac" }))).toEqual({ valid: true });
  });

  it("accepts FLAC (audio/x-flac)", () => {
    expect(validateAudioFile(makeFile({ type: "audio/x-flac", name: "track.flac" }))).toEqual({ valid: true });
  });

  it("accepts OGG", () => {
    expect(validateAudioFile(makeFile({ type: "audio/ogg", name: "track.ogg" }))).toEqual({ valid: true });
  });

  it("accepts AAC (audio/aac)", () => {
    expect(validateAudioFile(makeFile({ type: "audio/aac", name: "track.aac" }))).toEqual({ valid: true });
  });

  it("accepts AAC (audio/x-aac)", () => {
    expect(validateAudioFile(makeFile({ type: "audio/x-aac", name: "track.aac" }))).toEqual({ valid: true });
  });
});

describe("validateAudioFile — unsupported formats (FR-003, Story 4)", () => {
  it("rejects video/mp4", () => {
    const result = validateAudioFile(makeFile({ type: "video/mp4", name: "video.mp4" }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/not supported/i);
  });

  it("rejects image/jpeg", () => {
    const result = validateAudioFile(makeFile({ type: "image/jpeg", name: "photo.jpg" }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/not supported/i);
  });

  it("rejects application/pdf", () => {
    const result = validateAudioFile(makeFile({ type: "application/pdf", name: "doc.pdf" }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/not supported/i);
  });

  it("rejects empty MIME type", () => {
    const result = validateAudioFile(makeFile({ type: "", name: "unknown" }));
    expect(result.valid).toBe(false);
  });

  it("returns a plain-language message a non-technical user can understand (FR-003)", () => {
    const result = validateAudioFile(makeFile({ type: "video/mp4" }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Should not contain technical jargon like MIME, codec, binary, etc.
      expect(result.reason).not.toMatch(/mime|codec|binary|exception/i);
    }
  });
});

describe("validateAudioFile — file size limits (FR-002, edge cases)", () => {
  it("accepts a file exactly at the size limit", () => {
    const result = validateAudioFile(makeFile({ size: MAX_FILE_SIZE_BYTES }));
    expect(result.valid).toBe(true);
  });

  it("rejects a file one byte over the size limit", () => {
    const result = validateAudioFile(makeFile({ size: MAX_FILE_SIZE_BYTES + 1 }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/too large/i);
  });

  it("rejects a very large file", () => {
    const result = validateAudioFile(makeFile({ size: 500 * 1024 * 1024 })); // 500 MB
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/too large/i);
  });

  it("includes the size limit in the error message", () => {
    const result = validateAudioFile(makeFile({ size: MAX_FILE_SIZE_BYTES + 1 }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("smaller than 50 MB");
    }
  });
});

describe("validateAudioFile — empty or corrupt files (FR-003, Story 4)", () => {
  it("rejects a zero-byte file", () => {
    const result = validateAudioFile(makeFile({ size: 0 }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/empty/i);
  });
});
