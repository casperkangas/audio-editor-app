# Quickstart: Validate Audio Editing and Export

## Prerequisites

- Node.js and npm installed.
- `apps/web` dependencies installed with `npm install`.
- A Vercel Blob store and `BLOB_READ_WRITE_TOKEN` configured for the API.
- A Redis instance and connection credentials configured for the job store and queue adapter.
- An FFmpeg/ffprobe-capable worker with access to private Blob objects.
- A valid fixture such as `sample-sounds/example.wav`.
- A browser capable of the Web Audio API and a viewport at least 768 pixels wide for
  the primary responsive validation path.

## Local Checks

From `apps/web`:

```sh
npm test
npm run lint
npm run build
```

These checks cover upload validation and the API validation/state adapters once
implemented. Worker tests must run in the worker package/runtime with FFmpeg available.

## Browser Editor Validation

1. Open the app and load `sample-sounds/example.wav`.
2. Confirm the waveform duration matches the loaded audio and the playhead follows
  playback and seeking.
3. Select a bounded region and confirm the start/end selection remains aligned while the
  timeline changes.
4. Apply trim, delete, split, volume, fade-in, and fade-out actions where applicable.
5. Confirm each edit updates the preview without changing the original source, and that
  undo and redo restore the expected operation sequence.
6. Confirm the serialized export snapshot contains `sourceRevision` and ordered typed
  operations, but no audio buffer or executable rendering text.
7. Repeat the interaction at 768px and 2560px widths; primary controls must remain usable.

## Top-Right Controls Validation

1. Activate Help with a pointer and keyboard; confirm a clearly labelled popover opens
  with the current editor actions and keyboard shortcuts.
2. Activate Account; confirm a session/privacy popover opens and states that no account is
  required and files remain tied to the current session.
3. Press Escape and activate outside each popover; confirm it closes and focus returns to
  the originating control.
4. Confirm the Account control makes no navigation or network request in the MVP.
5. Repeat at 768px and 2560px widths; popover content must remain readable and must not
  cover the primary editor controls.

## Functional Validation Scenarios

## End-to-End Export Scenario

1. Start the Vite app and the configured API/worker environment.
2. Upload a supported audio file.
3. Confirm the browser uses `/api/upload` and receives a private Blob upload response;
   the Blob token must not appear in browser code or network responses.
4. Make a trim or fade edit and confirm the UI still previews the browser-local result.
5. Choose `mp3` with an allowed bitrate and submit export.
6. Confirm `POST /api/exports` returns queued data with a `jobId`.
7. Poll `GET /api/jobs/{jobId}` until `succeeded` or `failed`.
8. On success, download the short-lived URL and inspect it with `ffprobe`.
9. Confirm the container, codec, duration, and extension match the request.

Expected result: the API acknowledges quickly, FFmpeg runs only in the worker, progress
is visible, and the browser downloads a valid output without receiving storage secrets.

## Negative and Recovery Scenarios

- Unsupported output format: validation error before a job is queued.
- Out-of-range edit operation: validation error with no worker job.
- Foreign or nonexistent Blob key: authorization/not-found response without revealing
  object existence.
- Second export while one is active: `409` conflict.
- Worker interruption after claim: recovery or failure by lease policy, without duplicate
  successful output.
- Corrupt source fixture: actionable `ffprobe` failure and temporary-file cleanup.
- Expired output: signed URL stops working and metadata cleanup remains idempotent.

## Operational Validation

- Confirm Blob uploads are direct from the browser and not relayed through the API.
- Confirm exported files are generated in a background worker, never in an API handler.
- Confirm progress updates and terminal states survive API process restarts.
- Confirm stale temporary artifacts are cleaned up after success or failure.
- Confirm invalid or malicious inputs are rejected before worker dispatch.
- Run a representative 20-session concurrency check and confirm editor interactions remain
  available while exports are processed asynchronously.
- Measure playback, seeking, selection, trim, undo, and redo interactions; each common
  interaction should complete within 200 milliseconds under normal conditions.

## Success Criteria for the Quickstart

The infrastructure handoff is ready when the scenarios above pass and the app presents
clear feedback during upload, editing, export, and errors.

## Ownership Handoff

- Casper: API routes, Blob access policy, Redis adapter integration, worker deployment,
  and retention configuration.
- Jonas: serialization of the edit plan and browser state contract feeding export.
- Tomas: export controls, progress states, retry/download interaction, and error copy.
- Tomas: top-right Help and Account popovers, including responsive placement and keyboard
  interaction. Jonas supplies editor shortcut/state values; no account backend is required.
- Paul-Henrik: route/worker contract tests, FFmpeg fixture checks, and CI gates.

See [data-model.md](data-model.md) and
[contracts/audio-processing-contract.md](contracts/audio-processing-contract.md) for
the authoritative fields and HTTP behavior.
