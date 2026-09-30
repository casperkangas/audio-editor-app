import { useEffect, useState } from "react";
import type { EditOperation, ExportFormat, ExportStatus } from "../../types";

interface ExportPanelProps {
  disabled?: boolean;
  duration: number;
  sourceFilename: string;
  projectId: string;
  sessionId: string;
  sourceBlobKey: string;
  sourceRevision: number;
  operations: readonly EditOperation[];
  onClose: () => void;
}

const FORMAT_OPTIONS: {
  value: ExportFormat;
  label: string;
  supportsBitrate: boolean;
}[] = [
  { value: "wav", label: "WAV (lossless)", supportsBitrate: false },
  { value: "mp3", label: "MP3", supportsBitrate: true },
  { value: "flac", label: "FLAC (lossless)", supportsBitrate: false },
  { value: "ogg", label: "OGG Vorbis", supportsBitrate: true },
  { value: "aac", label: "AAC", supportsBitrate: true },
];

const BITRATE_OPTIONS = ["96k", "128k", "192k", "256k", "320k"];

function stripUnsafeFilenameCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127 && !'<>:"/\\|?*'.includes(character);
    })
    .join("");
}

interface JobStatusResponse {
  status: ExportStatus;
  progressPercent: number;
  message: string;
  downloadUrl?: string | null;
  error?: string | null;
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(
      payload.error || "The export request could not be completed.",
    );
  }
  return payload;
}

export default function ExportPanel({
  disabled = false,
  duration,
  sourceFilename,
  projectId,
  sessionId,
  sourceBlobKey,
  sourceRevision,
  operations,
  onClose,
}: ExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>("mp3");
  const [filename, setFilename] = useState(
    () => sourceFilename.replace(/\.[^.]+$/, "") || "edited-audio",
  );
  const [bitrate, setBitrate] = useState("192k");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedFmt = FORMAT_OPTIONS.find((f) => f.value === format)!;
  const ready = duration > 0 && !disabled;
  const safeFilename = stripUnsafeFilenameCharacters(filename)
    .trim()
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[. ]+$/g, "")
    .slice(0, 100);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        try {
          const response = await fetch(
            `/api/jobs/${encodeURIComponent(jobId)}`,
            {
              headers: { "x-session-id": sessionId },
            },
          );
          const job = await readResponse<JobStatusResponse>(response);
          if (cancelled) return;
          setStatus(job.status);
          setProgress(job.progressPercent);
          setMessage(job.message);
          if (job.status === "succeeded") {
            return;
          }
          if (job.status === "failed" || job.status === "cancelled") {
            setJobId(null);
            setError(job.error ?? job.message);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        } catch (pollError) {
          if (!cancelled) {
            setError(
              pollError instanceof Error
                ? pollError.message
                : "Could not check export progress.",
            );
            setStatus("failed");
          }
          return;
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [jobId, sessionId]);

  const handleExport = async () => {
    if (!ready || jobId) return;
    setError(null);
    setProgress(0);
    setStatus("queued");
    setMessage("Preparing export");

    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          projectId,
          sourceRevision,
          sourceBlobKey,
          operations,
          settings: {
            format,
            ...(selectedFmt.supportsBitrate ? { bitrate } : {}),
          },
        }),
      });
      const job = await readResponse<{ jobId: string; message: string }>(
        response,
      );
      setMessage(job.message);
      setJobId(job.jobId);
    } catch (submitError) {
      setStatus("failed");
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not start the export.",
      );
    }
  };

  const resetExport = () => {
    setJobId(null);
    setStatus("idle");
    setProgress(0);
    setMessage("");
    setError(null);
  };

  const handleDownload = () => {
    if (!jobId || !safeFilename) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/download";
    form.hidden = true;

    for (const [name, value] of Object.entries({
      jobId,
      sessionId,
      filename: safeFilename,
    })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }

    document.body.append(form);
    form.submit();
    form.remove();
  };

  return (
    <div className="export-panel" role="dialog" aria-labelledby="export-title">
      <div>
        <p className="eyebrow">Final step</p>
        <h2 id="export-title">Export your audio</h2>
        <p className="panel-copy">
          Your edits will be rendered once, keeping the original file intact.
        </p>
      </div>

      <div className="export-field">
        <label htmlFor="export-format" className="export-label">
          Format
        </label>
        <select
          id="export-format"
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
          disabled={!ready || status === "queued" || status === "running"}
          className="export-select"
        >
          {FORMAT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="export-field">
        <label htmlFor="export-filename" className="export-label">
          File name
        </label>
        <div className="export-filename-control">
          <input
            id="export-filename"
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            maxLength={120}
            disabled={status === "queued" || status === "running"}
            className="export-select"
            autoComplete="off"
          />
          <span aria-hidden="true">.{format}</span>
        </div>
      </div>

      {selectedFmt.supportsBitrate && (
        <div className="export-field">
          <label htmlFor="export-bitrate" className="export-label">
            Bitrate
          </label>
          <select
            id="export-bitrate"
            value={bitrate}
            onChange={(e) => setBitrate(e.target.value)}
            disabled={!ready || status === "queued" || status === "running"}
            className="export-select"
          >
            {BITRATE_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      )}

      {status === "queued" || status === "running" ? (
        <div className="export-progress" aria-live="polite">
          <p>{message || "Preparing export"}</p>
          <progress value={progress} max={100} />
          <span>{progress}%</span>
        </div>
      ) : status === "succeeded" && jobId ? (
        <button
          className="primary-button"
          type="button"
          onClick={handleDownload}
          disabled={!safeFilename}
        >
          Download {format.toUpperCase()} <span>↓</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={!ready}
          className="primary-button"
          aria-label={`Start export as ${format.toUpperCase()}`}
        >
          {status === "failed" ? "Retry export" : "Start export"} <span>→</span>
        </button>
      )}

      {error && (
        <p className="export-error" role="alert">
          {error}
        </p>
      )}

      {!ready && duration === 0 && (
        <p className="export-hint">Load an audio file to enable export.</p>
      )}

      <div className="panel-actions">
        <button className="text-button" onClick={onClose} type="button">
          Cancel
        </button>
        {status === "failed" && (
          <button className="text-button" onClick={resetExport} type="button">
            Clear error
          </button>
        )}
      </div>
    </div>
  );
}
