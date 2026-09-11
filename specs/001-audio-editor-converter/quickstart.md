# Quickstart: Validate Audio Export Infrastructure

## Prerequisites

- Node.js and npm installed.
- `apps/web` dependencies installed with `npm install`.
- A Vercel Blob store and `BLOB_READ_WRITE_TOKEN` configured for the API.
- The selected durable job store and queue/worker dispatch credentials configured.
- An FFmpeg/ffprobe-capable worker with access to private Blob objects.
- A valid fixture such as `sample-sounds/example.wav`.

## Local Checks

From `apps/web`:

```sh
npm test
npm run lint
npm run build
```

These checks cover upload validation and the API validation/state adapters once
implemented. Worker tests must run in the worker package/runtime with FFmpeg available.

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

## Success Criteria for the Quickstart

The infrastructure handoff is ready when the scenarios above pass and the app presents
clear feedback during upload, editing, export, and errors.

## Ownership Handoff

- Casper: API routes, Blob access policy, job-store/queue adapters, worker deployment,
  and retention configuration.
- Jonas: serialization of the edit plan and browser state contract feeding export.
- Tomas: export controls, progress states, retry/download interaction, and error copy.
- Paul-Henrik: route/worker contract tests, FFmpeg fixture checks, and CI gates.

See [data-model.md](data-model.md) and
[contracts/audio-processing-contract.md](contracts/audio-processing-contract.md) for
the authoritative fields and HTTP behavior.
