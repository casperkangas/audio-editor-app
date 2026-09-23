import { describe, expect, it } from "vitest";
import {
  FORMAT_POLICY_VERSION,
  validateExportSettings,
} from "../../api/_lib/export.validation.js";

describe("export format policy", () => {
  it.each([
    ["wav", "wav", "audio/wav"],
    ["mp3", "mp3", "audio/mpeg"],
    ["flac", "flac", "audio/flac"],
    ["ogg", "ogg", "audio/ogg"],
    ["aac", "aac", "audio/aac"],
  ] as const)(
    "accepts %s and derives server metadata",
    (format, extension, contentType) => {
      const result = validateExportSettings({ format });

      expect(result).toMatchObject({
        valid: true,
        value: { format, extension, contentType, policyVersion: FORMAT_POLICY_VERSION },
      });
    },
  );

  it("accepts allowlisted lossy quality settings", () => {
    expect(
      validateExportSettings({ format: "mp3", qualityPreset: "high" }),
    ).toMatchObject({ valid: true });
  });

  it.each([
    { format: "wav", bitrate: "192k" },
    { format: "flac", qualityPreset: "high" },
    { format: "mp3", bitrate: "999k" },
    { format: "ogg", qualityPreset: "studio" },
  ])("rejects invalid quality settings: %o", (settings) => {
    expect(validateExportSettings(settings).valid).toBe(false);
  });

  it("rejects unsupported formats", () => {
    const result = validateExportSettings({ format: "m4a" });

    expect(result).toMatchObject({
      valid: false,
      errorCode: "UNSUPPORTED_FORMAT",
    });
  });
});