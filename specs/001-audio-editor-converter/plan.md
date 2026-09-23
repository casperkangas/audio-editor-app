# Implementation Plan: Audio Editor and Export

**Branch**: `001-audio-editor-converter` | **Date**: 2026-09-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-audio-editor-converter/spec.md`

## Summary

Deliver the single-file browser editor and asynchronous export workflow as two explicit
boundaries. Jonas owns the browser-side source buffer, ordered edit operations, selection,
preview, undo/redo, and serialization of the current edit state. Casper owns private Blob
storage, API routes, durable job state, queue dispatch, and the external FFmpeg worker.
Tomas owns the visual export, player interactions, and top-right Help/Account controls,
while Paul-Henrik owns test and CI infrastructure. The browser uploads the source through
`/api/upload`, sends a validated edit snapshot to `/api/exports`, polls
`/api/jobs/[jobId]`, and downloads only an authorized short-lived result URL.

The top-right controls remain browser-only in the MVP: Help opens an accessible guidance
popover with editing actions and keyboard shortcuts; Account opens a session/privacy
popover that explains the current session and that no account is required. Authentication,
profiles, and account persistence are explicitly out of scope.

## Technical Context

**Language/Version**: TypeScript 6 / React 19 in Vite; Node.js-compatible Vercel API handlers; FFmpeg worker runtime.

**Primary Dependencies**: React, Vite, TypeScript, `@vercel/blob` client/server APIs, `@vercel/node`,
Web Audio API, FFmpeg/ffprobe in the worker, and a durable job store plus queue dispatch
adapter. The existing `apps/web/api/upload.ts` remains the Blob upload-token boundary.

**Storage**: Private Vercel Blob for source and generated audio objects. Redis is the
current durable job/session store and owns atomic job revisions, leases, and active-job
guards; the queue transports job identifiers to the worker. Browser memory remains
authoritative for the active edit history and sends a serializable operation list and
source revision at export time.

download flow, and ffprobe/audio fixture smoke tests in the worker environment.
**Testing**: Vitest for edit operations, history, serialization, request validation, and
job state transitions; integration tests for Blob token and route contracts with mocked
adapters; Playwright for upload-to-download and responsive interaction flows; and
ffprobe/audio fixture smoke tests in the worker environment.

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

**Scale/Scope**: One active project per browser session, at least 20 concurrent sessions
for the representative validation target, one active export per project in the MVP, and
independently scalable worker capacity as usage grows.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- PASS: User-centered simplicity is preserved by limiting the MVP to core editing, preview, and export workflows rather than a multi-track production editor.
- PASS: Architecture boundaries are explicit; browser-side editing, storage, and server-side rendering/conversion are separated by design.
- PASS: Security and privacy are addressed through validation, signed uploads, object access control, temporary-file cleanup, and malicious/invalid input handling.
- PASS: Responsive and accessible UX is prioritized through waveform interaction, playback feedback, progress states, and plain-language errors.
- PASS: Risk-driven design is required; major technical risks around browser audio processing, waveform rendering, large-file uploads, long-running conversion, and Vercel constraints are identified before implementation.
- PASS: Unnecessary complexity is avoided by keeping the initial MVP focused on single-file edits and final export rather than advanced production toolchains.
- PASS: Ownership boundaries are explicit: Casper owns deployment, Blob, API, queue, and worker work; Jonas owns editor state and functional audio logic; Tomas owns visual interaction; Paul-Henrik owns test infrastructure.
- PASS: The top-right controls remain a small, browser-only feedback surface; no account backend or speculative authentication complexity is introduced.
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
│   ├── components/
│   │   ├── editor/
│   │   ├── export/
│   │   ├── toolbar/
│   │   ├── transport/
│   │   └── waveform/
│   ├── hooks/
│   ├── lib/
│   │   ├── audio/
│   │   ├── editing/
│   │   ├── validation/
│   │   └── types.ts
│   ├── state/
│   ├── test/
│   ├── types/
│   └── App.tsx
├── tests/
│   ├── contract/
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
queue dispatch. Keep browser editing in the existing `src/hooks`, `src/lib/editing`,
`src/lib/audio`, and `src/lib/validation` modules rather than creating a second feature
layer. This preserves the required ownership and runtime boundary without creating a
second server application or duplicating the existing editor state.

## Delivery Phases

### Phase 0: Research and risk resolution

- Confirm browser-local, non-destructive editing remains authoritative until export.
- Confirm the Redis job-store and queue adapter provide atomic revisions, leases, and
    one-active-export protection.
- Confirm the 50 MiB upload and 2-hour duration defaults, 20-session validation target,
    and supported format policy documented in `research.md`.

### Phase 1: Browser editor contract

- Jonas: preserve source audio, ordered operations, selection bounds, working preview,
    undo/redo, and bounded operation serialization in `apps/web/src/lib/useEditor.ts`,
    `apps/web/src/hooks/useEditHistory.ts`, and `apps/web/src/lib/types.ts`.
- Jonas: add focused serialization/state tests beside the existing editing tests and
    verify the snapshot includes `sourceRevision`, operation IDs/types/parameters, and
    current duration without audio buffers or executable filter text.
- Tomas: verify waveform, playback, selection, status, keyboard, and responsive states in
    the existing component directories without changing editor or API ownership.
- Tomas: implement the top-right Help and Account popovers in `apps/web/src/App.tsx` or
    an adjacent component, with keyboard dismissal, focus management, accessible labels,
    and responsive placement. Help documents the actual editor actions; Account describes
    session-local privacy and the no-account MVP boundary.
- Jonas: provide the shortcut and editor-status values consumed by the Help popover through
    existing state/actions; no account or authentication state is required.

### Phase 2: Export API foundation

- Casper: validate upload, project/session ownership, immutable edit snapshots, format and
    quality settings, and redacted error responses.
- Casper: persist export jobs in Redis, dispatch only opaque job IDs, and expose authorized
    bounded status reads and short-lived download URLs.

### Phase 3: Worker and conversion

- Casper: claim jobs idempotently, inspect sources with `ffprobe`, translate typed edit
    operations, render with FFmpeg outside request handlers, verify outputs, and clean up
    temporary artifacts.
- Paul-Henrik: add contract, fixture, recovery, and CI coverage without changing worker
    behavior.

### Phase 4: Cross-cutting validation

- Validate the upload-to-download flow, invalid-input recovery, responsive editor behavior,
    sub-200ms common editor interactions, and at least 20 concurrent sessions.
- Re-check privacy, ownership boundaries, worker isolation, accessibility feedback, and
    the no-public-Blob-object requirement before implementation completion.
- Validate Help and Account popovers with keyboard and pointer interaction, Escape dismissal,
    focus return, viewport widths from 768px through 2560px, and no navigation or network
    request caused by the Account control.

## Complexity Tracking

No constitution violations requiring justified exceptions were identified.
