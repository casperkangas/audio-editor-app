# Audio Processing Contract

## Purpose

This contract defines the interfaces between the React frontend, the upload orchestration layer, and the audio processing backend for the MVP audio editor.

## 1. Upload URL Request

### Request

```http
POST /api/upload-url
Content-Type: application/json
```

```json
{
  "filename": "example.wav",
  "contentType": "audio/wav",
  "sizeBytes": 10485760
}
```

### Response

```json
{
  "uploadUrl": "https://blob.example.com/presigned-url",
  "objectKey": "uploads/uuid/example.wav",
  "expiresAt": "2026-08-31T12:00:00Z",
  "maxSizeBytes": 52428800
}
```

### Behavior

- Returns a signed or restricted upload URL for direct Blob upload.
- Validates filename, content type, and request limits.
- Rejects invalid or oversized input before upload begins.

## 2. Export Job Creation

### Request

```http
POST /api/exports
Content-Type: application/json
```

```json
{
  "projectId": "project_123",
  "sourceFileId": "blob://uploads/uuid/example.wav",
  "renderMode": "convert",
  "targetFormat": "mp3",
  "quality": {
    "bitrate": "192k"
  }
}
```

### Response

```json
{
  "jobId": "job_456",
  "status": "queued",
  "progressPercent": 0,
  "message": "Preparing export job"
}
```

### Behavior

- Creates a job record and triggers the server-side render pipeline.
- Rejects invalid format or unsupported codec combinations with a clear user message.

## 3. Job Status Polling

### Request

```http
GET /api/jobs/job_456
```

### Response

```json
{
  "jobId": "job_456",
  "status": "running",
  "progressPercent": 42,
  "message": "Encoding audio to MP3",
  "outputFileId": null,
  "error": null
}
```

### Behavior

- Provides a lightweight polling endpoint for the frontend to update activity feedback.
- Exposes progress percent and human-readable status without leaking internal implementation details.

## 4. Job Completion

### Response on success

```json
{
  "jobId": "job_456",
  "status": "succeeded",
  "progressPercent": 100,
  "message": "Export complete",
  "outputFileId": "blob://exports/job_456/output.mp3",
  "downloadUrl": "https://blob.example.com/exports/job_456/output.mp3"
}
```

### Response on failure

```json
{
  "jobId": "job_456",
  "status": "failed",
  "progressPercent": 100,
  "message": "Audio conversion failed",
  "error": "Unsupported target codec for current input"
}
```

## 5. Processing Constraints

- Jobs are asynchronous and should not be executed in ordinary request handlers for long-running CPU-intensive work.
- The processing layer should be isolated from the interactive editor experience.
- Supported formats and optional quality settings must be validated before execution.
- Failure states must result in human-readable user feedback rather than raw system errors.

## 6. Security & Storage Expectations

- Uploaded files are treated as untrusted input.
- Object access is restricted unless a user has an authorized session or a signed download URL.
- Temporary job content is cleaned up after completion or failure according to retention policy.
- Public exposure of user audio is disabled by default.
