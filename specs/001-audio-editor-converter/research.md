# Research: Audio Export and Conversion Architecture

## Decisions

### 1. Keep Vercel Blob as the file boundary

- **Decision**: Use the existing `apps/web/api/upload.ts` handler with `@vercel/blob/client`
  for restricted client uploads. Store source and generated objects as private Blob objects
  with random suffixes.
- **Rationale**: Large files avoid an unnecessary API relay, while the server retains
  control over allowed extensions, MIME types, size, and token payloads. The existing
  implementation already defaults to a 50 MiB limit through `AUDIO_UPLOAD_MAX_SIZE_BYTES`.
- **Alternative rejected**: Uploading through a Vercel function would increase latency,
  bandwidth, and function memory pressure.

### 2. Use asynchronous export jobs

- **Decision**: `/api/exports` validates and queues a job, but never invokes FFmpeg in the
  request handler. A worker consumes the job and writes the result to Blob.
- **Rationale**: Conversion duration and CPU usage are not predictable enough for an
  interactive serverless request. A job boundary supports retries, progress, and
  independent worker scaling.
- **Alternative rejected**: Synchronous export inside a Vercel function conflicts with
  the constitution's runtime boundary and can fail at platform execution limits.

### 3. Use a durable metadata store plus queue adapter

- **Decision**: Store job metadata and status in a durable managed key-value or SQL store,
  behind `jobs.ts`; dispatch only the job ID through a queue adapter. The initial
  deployment must select a provider that supports atomic updates, TTLs, and worker access.
- **Rationale**: Browser polling must survive function restarts and worker retries. Keeping
  the provider behind an adapter avoids coupling route logic to a single vendor.
- **Alternative rejected**: In-memory maps cannot provide reliable status across instances
  and restarts.

### 4. Send a serializable edit plan, not browser audio buffers

- **Decision**: The browser submits the ordered `EditOperation[]`, source Blob key, target
  format, and validated quality settings. It never uploads an `AudioBuffer` or executable
  filter text.
- **Rationale**: Operations are compact, auditable, and reproduce the non-destructive
  timeline. The worker owns translation into a constrained FFmpeg render plan.
- **Alternative rejected**: Sending client-generated FFmpeg arguments would create an
  injection risk and make output behavior dependent on browser implementation details.

### 5. Validate at three boundaries

- **Decision**: Validate file policy before upload, validate the export request in the API,
  and run `ffprobe` plus bounded render validation in the worker.
- **Rationale**: MIME and extension checks are insufficient for untrusted media. Repeated
  validation protects against forged requests, changed objects, malformed containers, and
  unsupported codec combinations.

### 6. Poll a small public job read model

- **Decision**: `GET /api/jobs/[jobId]` returns only status, bounded progress, a user-facing
  message, and a short-lived download URL on success. The frontend polls while status is
  `queued` or `running` and stops on terminal status.
- **Rationale**: Polling is simple for the MVP and avoids a websocket or streaming
  dependency. The response does not expose worker logs, Blob credentials, or internal paths.
- **Alternative rejected**: Server-sent events add lifecycle and hosting complexity without
  changing the export contract.

### 7. Make worker completion idempotent

- **Decision**: A job has a stable ID and revision. The worker claims queued work using an
  atomic transition, treats repeated completion callbacks as no-ops, and never overwrites a
  successful output with a later retry.
- **Rationale**: Queues and callbacks may deliver duplicates. Idempotency prevents duplicate
  outputs and inconsistent progress.

## Resolved MVP Policies

- Supported output formats: `wav`, `mp3`, `flac`, `ogg`, and `aac`, matching the current
  frontend type model. Format-specific bitrate options are allowed only for lossy formats;
  WAV and FLAC use lossless presets.
- One active export per project is allowed. A second request returns a conflict until the
  existing job reaches a terminal state.
- Source objects remain private. Download URLs are signed and short-lived; the API creates
  them only for an authorized terminal job.
- Generated outputs and temporary worker files receive a retention deadline. Cleanup is
  attempted after success or failure, and cleanup failure is recorded without changing a
  completed job back to failed.
- The worker reports coarse stages (`queued`, `validating`, `rendering`, `finalizing`,
  `succeeded`, `failed`) and a bounded integer progress value. It does not report raw FFmpeg
  output to the client.

## Risks and Mitigations

- **Blob object spoofing**: bind the source key to the session/project metadata and reject
  arbitrary keys or foreign path prefixes.
- **Filter or path injection**: construct FFmpeg arguments from a typed allowlist and pass
  arguments without shell interpolation.
- **Stale jobs**: use a lease/heartbeat or timeout policy; a reaper marks abandoned jobs
  failed and removes temporary artifacts.
- **Format mismatch**: inspect the actual input with `ffprobe`, validate the output
  container/codec pair, and verify the generated file before success.
- **Cost/resource exhaustion**: enforce upload size, duration, operation-count, and
  concurrent-job limits before dispatch.
