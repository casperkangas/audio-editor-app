# Implementation Plan: Audio Export and Conversion

**Branch**: `001-audio-editor-converter` | **Date**: 2026-09-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-audio-editor-converter/spec.md`

## Summary

Implement export as an asynchronous API workflow. The browser uploads the original file
directly to private Vercel Blob storage through the existing `/api/upload` token handler,
then submits the current edit-operation list and output settings to `/api/exports`. The
route validates the request, records a durable queued job, and dispatches it to an
external FFmpeg worker. The worker reads the private source from Blob, renders the edit
timeline, writes the output back to Blob, and updates job status. The browser polls
`/api/jobs/[jobId]` and receives a short-lived download URL after successful completion.

## Technical Context

**Language/Version**: TypeScript 6 / React 19 in Vite; Node.js-compatible Vercel API handlers; FFmpeg worker runtime.

**Primary Dependencies**: React, Vite, TypeScript, `@vercel/blob` client/server APIs, `@vercel/node`,
Web Audio API, FFmpeg/ffprobe in the worker, and a durable job store plus queue dispatch
adapter. The existing `apps/web/api/upload.ts` remains the Blob upload-token boundary.

**Storage**: Private Vercel Blob for source and generated audio objects. A durable metadata
store records export jobs, ownership/session binding, status, progress, and object keys;
the queue transports job identifiers to the worker. Browser memory remains authoritative
for the active edit history and sends a serializable operation list at export time.

**Testing**: Vitest for request validation and job state transitions, integration tests for
Blob token and route contracts with mocked SDK/worker adapters, Playwright for upload-to-
download flow, and ffprobe/audio fixture smoke tests in the worker environment.

**Target Platform**: Browser app and short-lived API handlers hosted on Vercel; FFmpeg runs
outside ordinary Vercel request handlers in a queue-triggered worker with access to the
same Blob token and job-store credentials.

**Project Type**: Web application.

**Performance Goals**: API acknowledgement within 1 second under normal conditions; status
polling every 1-2 seconds while active; no request handler performs FFmpeg work; small and
medium exports complete within the worker's configured execution budget; interactive
editing remains browser-local.

**Constraints**: Preserve the existing 50 MiB default upload-token limit unless product
owners change it; validate source object identity, edit bounds, formats, and quality
settings server-side; keep Blob objects private; do not trust client-supplied download
URLs; make job updates idempotent; avoid exposing FFmpeg or storage errors to users.

**Scale/Scope**: One active project per browser session, small-to-moderate concurrent
usage, one active export per project in the MVP, and independently scalable worker
capacity as usage grows.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- PASS: User-centered simplicity is preserved by limiting the MVP to core editing, preview, and export workflows rather than a multi-track production editor.
- PASS: Architecture boundaries are explicit; browser-side editing, storage, and server-side rendering/conversion are separated by design.
- PASS: Security and privacy are addressed through validation, signed uploads, object access control, temporary-file cleanup, and malicious/invalid input handling.
- PASS: Responsive and accessible UX is prioritized through waveform interaction, playback feedback, progress states, and plain-language errors.
- PASS: Risk-driven design is required; major technical risks around browser audio processing, waveform rendering, large-file uploads, long-running conversion, and Vercel constraints are identified before implementation.
- PASS: Unnecessary complexity is avoided by keeping the initial MVP focused on single-file edits and final export rather than advanced production toolchains.
- PASS: Casper owns the Vercel, Blob, and API work covered by this plan; frontend and core audio-editing changes are explicitly handed to Tomas and Jonas.
- PASS: The external worker boundary prevents CPU-intensive conversion from being placed in ordinary Vercel request handlers.

## Project Structure

### Documentation (this feature)

```text
specs/001-audio-editor-converter/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
├── spec.md              # Approved feature specification
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── app/
│   ├── components/
│   │   ├── editor/
│   │   ├── transport/
│   │   ├── waveform/
│   │   ├── export/
│   │   └── feedback/
│   ├── features/
│   │   └── audio-editor/
│   ├── hooks/
│   ├── lib/
│   │   ├── audio/
│   │   ├── editing/
│   │   ├── validation/
│   │   └── storage/
│   ├── state/
│   ├── types/
│   └── utils/
├── tests/
│   ├── e2e/
│   ├── integration/
│   └── unit/
└── vite.config.ts

apps/web/api/
├── upload.ts                  # Existing Vercel Blob client-token handler
├── upload.validation.ts       # Existing source-file policy
├── exports.ts                 # Create and dispatch an export job
├── jobs/[jobId].ts            # Read authorized job status and sign download
└── _lib/
    ├── blob.ts                # Private object lookup and signed URL helpers
    ├── export.validation.ts   # Request, edit, format, and quality validation
    ├── jobs.ts                # Durable job-store adapter and state transitions
    └── queue.ts               # Worker dispatch adapter

workers/audio-export/
├── worker.ts                  # Queue consumer and idempotent orchestration
├── ffmpeg.ts                  # ffprobe validation and FFmpeg command builder
├── render-plan.ts             # Edit-operation to filtergraph/segment plan
└── cleanup.ts                 # Temporary-file and failed-output cleanup
```

**Structure Decision**: Keep Vercel API routes beside the existing `apps/web/api/upload.ts`
so deployment discovers them consistently, and isolate FFmpeg code under
`workers/audio-export`. Shared API helpers own validation, Blob access, job state, and
queue dispatch. This is the smallest structure that preserves the required ownership and
runtime boundary without creating a second server application.

## Complexity Tracking

No constitution violations requiring justified exceptions were identified.
