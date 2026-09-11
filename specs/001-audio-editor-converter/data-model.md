# Data Model: Audio Export and Conversion

## Overview

This feature manages a single active audio project with a series of user-driven edit operations, export requests, and processing states. The data model is intentionally minimal for the MVP but structured to support non-destructive editing, undo/redo, and final render jobs.

## Core Entities

### AudioProject

Represents the active editing session for one uploaded file.

Fields:

- id: unique project identifier
- userId or sessionId: owner context for the current user/session
- sourceFileId: reference to the original uploaded object
- sourceFileName: original user-facing file name
- sourceFormat: detected audio format
- durationSeconds: derived audio duration
- status: idle, loading, ready, previewing, exporting, failed
- createdAt: timestamp
- updatedAt: timestamp
- currentRevision: integer index for the active project state
- exportPreset: optional selected output format and settings

Relationships:

- One project has many EditOperation records
- One project has many ExportJob records
- One project has zero or one active render session at a time

### AudioProjectSession

Client/session metadata bound to one source object.

| Field               | Type          | Rules                                                |
| ------------------- | ------------- | ---------------------------------------------------- |
| `projectId`         | opaque string | Generated server-side; used in export requests       |
| `sessionId`         | opaque string | Bound to the active browser session or auth context  |
| `sourceBlobKey`     | string        | Private Blob key; must belong to the project         |
| `sourceFileName`    | string        | Display name only; sanitized before download headers |
| `sourceContentType` | enum          | Must be in the upload allowlist                      |
| `sourceSizeBytes`   | integer       | Must be within configured limit                      |
| `durationSeconds`   | number        | Positive and within configured duration limit        |
| `revision`          | integer       | Increments when the edit plan changes                |

### AudioFileRecord

Represents an uploaded source audio file or generated output artifact.

Fields:

- id: unique object identifier in Blob storage
- storageKey: object key in Blob or path reference
- kind: source or generated
- contentType: MIME type or audio MIME
- sizeBytes: file size
- checksum or digest: optional integrity validation record
- createdAt: timestamp
- expiresAt: optional cleanup deadline
- validationStatus: pending, valid, rejected, failed
- isPublic: false in MVP by default

Relationships:

- One source file belongs to one project
- One generated output belongs to one export job

### EditOperation

Represents a single user action in the timeline.

Fields:

- id: operation identifier
- projectId: owning project
- type: trim, cut, split, fade-in, fade-out, volume, insert, delete, reorder
- startTime: start offset in seconds
- endTime: end offset in seconds
- parameters: JSON object for operation-specific settings
- createdAt: timestamp
- revisionIndex: version of the project after this operation

Relationships:

- One project contains many operations in chronological order
- The operation history supports undo/redo traversal

### ExportJob

Represents a final render or conversion task.

Fields:

### ProcessingUpdate

Internal worker update containing `jobId`, expected revision, status, stage, progress,
and an optional error category. Updates use compare-and-set semantics so stale retries
cannot move a terminal job backward.

- id: unique job identifier
- projectId: source project
- status: queued, running, succeeded, failed, cancelled
- sourceFileId: source artifact reference
- targetFormat: e.g. mp3, wav, flac, ogg, aac
- targetBitrate or qualityPreset: selected output quality metadata
- renderMode: preserve-format or convert
- requestedAt: timestamp
- startedAt: timestamp
- completedAt: timestamp
- outputFileId: object reference to final output artifact
- errorMessage: human-readable issue description
- progressPercent: integer when available

Relationships:

- One project has many export jobs
- One export job produces one output artifact

### ProcessingState

Represents runtime progress for an active job or upload.

Fields:

- jobId or projectId: associated target
- stage: upload, validation, waveform-scan, preview-generation, render, finalize, cleanup
- progressPercent: integer 0-100
- message: user-facing status text
- updatedAt: timestamp

Relationships:

- Used as a lightweight read model for the frontend progress display

## Validation Rules

- Projects must reference a valid source file before preview or export can proceed.
- Edit operations must be bounded by the source audio duration and selected region.
- Export jobs must specify a valid target format and appropriate quality settings for that format.
- File validation must reject unsupported MIME types or malformed files before the project becomes ready.
- Job progress must never exceed 100% and must be reset properly on retry.

## State Transitions

### Project lifecycle

## Storage and Retention

- Blob keys use separate private prefixes such as `audio/source/` and `audio/export/`.
- Job metadata stores Blob keys, never long-lived public URLs or Blob credentials.
- The API signs a download URL only after authorization and successful output status.
- Source and output retention is configurable through environment variables; cleanup is
  idempotent and may run asynchronously after the user downloads the result.
- created -> validating -> ready -> editing -> previewing -> exporting -> completed
- Any stage may transition to failed when validation or processing fails

### Export job lifecycle

- queued -> running -> succeeded
- queued -> running -> failed
- running -> cancelled when the user aborts or a cleanup event occurs

## Data Access and Storage Notes

- The browser keeps the active project state in memory and optionally persisted session storage.
- Object references and job metadata live in the backend or job database; Blob is the storage layer for files.
- Generated files MUST have a retention window and cleanup policy to prevent stale artifacts from accumulating.
- A lightweight metadata store is enough for the MVP; a full database is not required unless job history becomes a product requirement.
