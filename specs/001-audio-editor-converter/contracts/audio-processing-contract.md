# Audio Processing Contract

## Purpose

This contract covers the infrastructure/API boundary for upload, export dispatch, job
status, and worker completion. All request examples omit authentication details; the
implementation must bind each project and job to the current session or authenticated
user.

## 1. Client Upload Token Request

### Request

```http
POST /api/upload
Content-Type: application/json
```

```json
{
  "type": "blob.generate-client-token",
  "payload": {
    "pathname": "example.wav",
    "contentType": "audio/wav",
    "size": 10485760
  }
}
```

### Response

```json
{
  "type": "blob.generate-client-token",
  "clientToken": "server-generated-client-token"
}
```

### Behavior

- Generates a restricted client token using the server-only Blob credentials.
- Validates the pathname extension and restricts content types and file size.
- The browser uses this token to upload the file directly to Vercel Blob.
- The `BLOB_READ_WRITE_TOKEN` is never returned to or imported by frontend code.
- Rejects invalid or oversized input before upload begins.

Uploaded objects remain private and use a random suffix. The existing implementation
defaults to a 50 MiB limit through `AUDIO_UPLOAD_MAX_SIZE_BYTES`.

### Browser usage

```ts
await upload("example.wav", file, {
  access: "private",
  handleUploadUrl: "/api/upload",
  contentType: file.type,
});
```

## 2. Create Export Job

### Request

```http
POST /api/exports
Content-Type: application/json
```

```json
{
  "projectId": "project_123",
  "sourceRevision": 4,
  "sourceBlobKey": "audio/source/uuid/example.wav",
  "operations": [
    {
      "id": "op_1",
      "type": "trim",
      "params": { "startTime": 2, "endTime": 18 }
    }
  ],
  "settings": { "format": "mp3", "bitrate": "192k" }
}
```

### Response

```json
{
  "jobId": "job_456",
  "status": "queued",
  "stage": "queued",
  "progressPercent": 0,
  "message": "Preparing export"
}
```

### Behavior

- Authorizes the project and compares the source key with stored project metadata.
- Validates the immutable operation snapshot and format settings.
- Rejects a second active job for the same project with `409`.
- Persists the job and dispatches only the job ID to the worker queue.
- Returns `400` for invalid input, `401/403` for authorization failures, and `5xx` only
  for unavailable infrastructure.

## 3. Read Job Status

### Request

```http
GET /api/jobs/job_456
```

### Response

```json
{
  "jobId": "job_456",
  "status": "running",
  "stage": "rendering",
  "progressPercent": 42,
  "message": "Rendering audio",
  "downloadUrl": null,
  "error": null
}
```

### Behavior

- Only the owning session/user may read the job.
- Returns a short-lived signed `downloadUrl` only for an authorized successful job.
- Does not expose worker logs, Blob credentials, or internal paths.
- Unknown and unauthorized jobs must not reveal whether another user's job exists.

## 4. Worker Dispatch and Completion

Queue message:

```json
{ "jobId": "job_456", "attempt": 1 }
```

The worker atomically claims the job, reads the private source Blob, runs `ffprobe`,
renders the validated operation plan with FFmpeg, writes a private output Blob, verifies
the output container/codec with `ffprobe`, and updates the job to `succeeded`. Every
update includes the job revision and is idempotent. Duplicate messages must not create
multiple successful outputs.

### Response on success

```json
{
  "jobId": "job_456",
  "status": "succeeded",
  "progressPercent": 100,
  "message": "Export complete",
  "downloadUrl": "short-lived-signed-url"
}
```

### Response on failure

```json
{
  "jobId": "job_456",
  "status": "failed",
  "progressPercent": 100,
  "message": "Audio conversion failed",
  "errorCode": "UNSUPPORTED_CODEC",
  "error": "This audio could not be exported with the selected settings."
}
```

## 5. Format and Quality Rules

- `wav` and `flac` accept lossless defaults and reject lossy bitrate parameters.
- `mp3`, `ogg`, and `aac` accept only allowlisted bitrate or quality presets.
- The API and worker share the same format policy version.
- Output extension and content type are derived server-side from the validated format.
- FFmpeg arguments are constructed from typed values without shell interpolation.

## 6. Processing Constraints

- Jobs MUST be asynchronous and MUST NOT be executed in ordinary request handlers for long-running CPU-intensive work.
- The processing layer MUST be isolated from the interactive editor experience.
- Supported formats and optional quality settings must be validated before execution.
- Failure states must result in human-readable user feedback rather than raw system errors.

## 6. Security & Storage Expectations

- Uploaded files are treated as untrusted input.
- Object access is restricted unless a user has an authorized session or a signed download URL.
- Temporary job content is cleaned up after completion or failure according to retention policy.
- Public exposure of user audio is disabled by default.
