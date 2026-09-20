---
description: "Actionable tasks for the asynchronous audio export API, Vercel Blob integration, and endpoint contracts"
---

# Tasks: Audio Export and Conversion API

**Input**: Design documents from `/specs/001-audio-editor-converter/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/audio-processing-contract.md, quickstart.md

**Scope**: Casper-owned implementation tasks cover Vercel Blob configuration, API routes, Redis job metadata/queue adapters, authorization, validation, endpoint contracts, and FFmpeg worker execution. React UI, browser edit-plan state, and test-harness changes remain explicitly delegated and are not silently assigned to Casper.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it affects a different file or independent contract surface.
- **[Story]**: Required for user-story tasks and maps to the feature specification.
- Every task includes an exact file, directory, or command scope.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the API/Blob implementation surface without changing frontend components or deployment ownership outside Casper's scope.

- [x] T001 Create the API support directory `apps/web/api/_lib/` and reserve `workers/audio-export/` for Casper's FFmpeg worker implementation described in `specs/001-audio-editor-converter/plan.md`.
- [x] T002 [P] Add server-only environment variable documentation for `BLOB_READ_WRITE_TOKEN`, job-store credentials, queue credentials, `AUDIO_UPLOAD_MAX_SIZE_BYTES`, and retention limits in `apps/web/README.md`.
- [ ] T003 [P] Confirm `apps/web/package.json` contains the required `@vercel/blob` and `@vercel/node` dependencies and record any queue/job-store SDK additions needed by the selected provider.
- [ ] T004 [P] Define the provider-neutral job-store and queue adapter interfaces in `apps/web/api/_lib/jobs.ts` and `apps/web/api/_lib/queue.ts`, including atomic claim, compare-and-set update, lease expiry, and dispatch-by-job-ID operations.

---

## Phase 2: Foundational (Blocking API Prerequisites)

**Purpose**: Establish the security, serialization, Blob access, and error boundaries required before any export endpoint is implemented.

**CRITICAL**: User-story tasks must not begin until this phase is complete.

- [ ] T005 [P] Define the canonical export request, settings, status, stage, and error-code schemas in `apps/web/api/_lib/export.validation.ts` from `contracts/audio-processing-contract.md`.
- [ ] T006 [P] Implement private Blob object lookup and short-lived download URL helpers in `apps/web/api/_lib/blob.ts`, rejecting arbitrary keys and enforcing project/session ownership.
- [ ] T007 Implement edit-operation validation in `apps/web/api/_lib/export.validation.ts` for allowed operation types, finite numeric parameters, duration bounds, operation count, and normalized immutable snapshots.
- [ ] T008 Implement format and quality validation in `apps/web/api/_lib/export.validation.ts` for `wav`, `mp3`, `flac`, `ogg`, and `aac`, including lossless/lossy bitrate rules and server-derived content types/extensions.
- [ ] T009 [P] Define stable API error mapping and redacted user-facing messages in `apps/web/api/_lib/export.validation.ts` and `apps/web/api/_lib/errors.ts`; never expose Blob credentials, worker logs, or raw FFmpeg output.
- [ ] T010 [P] Add contract fixtures for valid requests, invalid operations, unsupported formats, invalid quality settings, unauthorized object keys, and terminal job responses in `apps/web/tests/contract/export.fixtures.ts`.
- [ ] T011 Verify the existing direct-upload route in `apps/web/api/upload.ts` continues to use private Vercel Blob access, random suffixes, the configured size limit, and server-only credentials; update only documented contract mismatches.

**Checkpoint**: API schemas, private Blob access, error mapping, and provider adapters are ready; no request handler performs FFmpeg work.

---

## Phase 3: User Story 2 - Preview and Export a Finished Result (Priority: P1) MVP

**Goal**: Accept the current non-destructive edit plan, create an asynchronous export job, expose safe status, and return a downloadable result after worker completion.

**Independent Test**: With a valid private source Blob object and mocked queue/job-store adapters, `POST /api/exports` returns a queued job, `GET /api/jobs/{jobId}` returns authorized progress, and a successful terminal job returns a short-lived download URL without exposing secrets.

### Tests for User Story 2

- [ ] T012 [P] [US2] Add request/response contract tests for `POST /api/exports` in `apps/web/tests/contract/exports.route.test.ts`, covering valid preserve-format requests, invalid payloads, missing project ownership, duplicate active jobs, and queue-dispatch failure.
- [ ] T013 [P] [US2] Add status contract tests for `GET /api/jobs/[jobId]` in `apps/web/tests/contract/jobs.route.test.ts`, covering queued, running, succeeded, failed, cancelled, unknown, and unauthorized jobs.
- [ ] T014 [P] [US2] Add job state-transition tests in `apps/web/tests/unit/jobs.test.ts` for atomic claim, monotonic progress, terminal-state protection, lease expiry, and duplicate worker completion updates.

### Casper Implementation for User Story 2

- [ ] T015 [US2] Implement project/session ownership lookup and export-job creation in `apps/web/api/_lib/jobs.ts`, storing the source Blob key, source revision, immutable edit plan, settings, status, stage, progress, retention deadline, and session binding.
- [ ] T016 [US2] Implement `POST /api/exports` in `apps/web/api/exports.ts` to authorize the project, validate the source object and edit snapshot, reject a second active job, persist the job, dispatch only the job ID, and return queued status.
- [ ] T017 [US2] Implement `GET /api/jobs/[jobId]` in `apps/web/api/jobs/[jobId].ts` to authorize the caller, return a bounded status read model, and sign a short-lived download URL only for a successful terminal job.
- [ ] T018 [US2] Add idempotent worker callback/update methods to `apps/web/api/_lib/jobs.ts` for claim, progress, success, and failure updates, ensuring stale retries cannot overwrite a successful result.
- [ ] T019 [US2] Document the worker-facing dispatch and completion payloads in `specs/001-audio-editor-converter/contracts/audio-processing-contract.md`; use the Casper-owned worker phase below as the implementation handoff boundary.

### Delegated Frontend Handoff for User Story 2

- [ ] T020 [US2] [Tomas] Wire the existing export controls in `apps/web/src/components/export/ExportPanel.tsx` to `POST /api/exports`, passing the current project revision and serialized edit operations; do not modify API or Blob code.
- [ ] T021 [US2] [Tomas] Add status polling and download handling in the existing export UI, using `GET /api/jobs/{jobId}`, rendering queued/running/succeeded/failed states, and preventing duplicate submission while a job is active.

**Checkpoint**: User Story 2 is independently testable when a valid edited project produces a queued job, observable progress, and an authorized downloadable output after worker completion.

---

## Phase 4: FFmpeg Worker Implementation (Casper-owned, supports User Stories 2-4)

**Purpose**: Implement the external FFmpeg worker one independently verifiable task at a time. The worker consumes only an opaque job ID, loads authorized job data from Redis, reads and writes private Vercel Blob objects, and reports idempotent status updates. No Vercel API handler or frontend file is changed by this phase.

**Independent Test**: With a configured private Blob store, Redis job record, queue message, and audio fixture, a worker run claims the job, validates the source with `ffprobe`, renders the typed edit plan, uploads a private output, verifies the output, and reaches the correct terminal state without duplicate completion or secret leakage.

### Casper implementation tasks

- [ ] T040 [US2] Create the worker entrypoint and queue-message parser in `workers/audio-export/worker.ts`, accepting only `{ jobId: string }` and loading the immutable job record through the existing `JobStore` contract.
- [ ] T041 [P] [US2] Implement private source-object download and isolated temporary-file lifecycle in `workers/audio-export/ffmpeg.ts`, using the Blob access boundary and rejecting missing or unauthorized source objects.
- [ ] T042 [P] [US2] Implement bounded `ffprobe` input inspection in `workers/audio-export/ffmpeg.ts`, mapping missing streams, malformed containers, unsupported codecs, duration limits, and probe failures to safe worker error codes.
- [ ] T043 [US2] Implement typed edit-operation translation in `workers/audio-export/render-plan.ts` for trim, delete, split, volume, fade-in, and fade-out without accepting client-provided shell arguments or filtergraph text.
- [ ] T044 [US2] Implement the FFmpeg argument builder in `workers/audio-export/ffmpeg.ts`, deriving all flags from validated operation and format policy values and invoking the process without shell interpolation.
- [ ] T045 [US2] Implement claim, progress, lease, success, and categorized failure orchestration in `workers/audio-export/worker.ts` using Redis compare-and-set revisions and terminal-state protection.
- [ ] T046 [US3] Implement format and quality encoder mappings in `workers/audio-export/ffmpeg.ts` for WAV, MP3, FLAC, OGG, and AAC, matching the API format-policy version and rejecting unsupported combinations before execution.
- [ ] T047 [US3] Upload completed output privately through `workers/audio-export/worker.ts`, verify container, codec, duration, and extension with `ffprobe`, and call `completeSuccess` only after verification.
- [ ] T048 [US4] Implement idempotent temporary-file and failed-output cleanup in `workers/audio-export/cleanup.ts`, preserving successful job state when cleanup itself fails.
- [ ] T049 [US4] Add lease-expiry, duplicate-delivery, retry, and partial-output recovery handling across `workers/audio-export/worker.ts` and `workers/audio-export/cleanup.ts` without creating duplicate successful outputs.

### Delegated integration and verification tasks

- [ ] T050 [P] [US2] Paul-Henrik: add worker contract tests in `workers/audio-export/worker.contract.test.ts` for queue parsing, Redis claim/progress/completion revisions, unauthorized source access, and safe error mapping; do not change worker behavior in the test task.
- [ ] T051 [P] [US3] Paul-Henrik: add FFmpeg fixture smoke tests in `workers/audio-export/ffmpeg.fixture.test.ts` for each supported output format, typed edit operations, output metadata, and private-output verification.
- [ ] T052 [P] [US4] Paul-Henrik: add worker recovery tests in `workers/audio-export/worker.recovery.test.ts` for probe failure, FFmpeg failure, lease expiry, duplicate delivery, cleanup failure, and retry after a terminal failure.
- [ ] T053 [US2] Jonas: confirm browser edit-plan serialization emits the contract fields consumed by `workers/audio-export/worker.ts` and record any required frontend/state changes in the handoff; do not implement worker or API changes in this task.
- [ ] T054 [US2] Tomas: validate the existing export UI against queued/running/succeeded/failed responses after the worker contract is stable; do not change worker, API, Blob, or Redis code in this task.

**Checkpoint**: Casper-owned worker execution is complete when a queue message can produce one verified private output or one safe terminal failure, with Redis revisions and cleanup remaining idempotent. Delegated tests and frontend/browser handoffs are complete when their owners verify the published contracts.

### Worker execution order

Complete the Casper-owned worker tasks one at a time in this order: T040, T041, T042, T043, T044, T045, T046, T047, T048, and T049. T041/T042 may be implemented independently after T040; T043/T044 depend on the typed operation model; T045 depends on the worker primitives; T046/T047 extend the stable renderer; and T048/T049 complete recovery and cleanup after terminal transitions are defined.

---

## Phase 5: User Story 3 - Convert the Edited Audio (Priority: P2)

**Goal**: Support validated target-format conversion and quality settings without moving FFmpeg work into Vercel API handlers.

**Independent Test**: Submit a valid conversion request for each supported format and allowed quality preset; verify the API queues the correct immutable settings, rejects invalid combinations before dispatch, and exposes the completed output through the same authorized status route.

### Tests for User Story 3

- [ ] T022 [P] [US3] Add format/quality contract tests in `apps/web/tests/unit/export.validation.test.ts` for WAV, MP3, FLAC, OGG, and AAC, including rejected bitrate combinations and unsupported codecs.
- [ ] T023 [P] [US3] Add conversion request tests in `apps/web/tests/contract/exports.conversion.test.ts` verifying settings are persisted exactly once and forwarded to the queue by job ID only.
- [ ] T024 [P] [US3] Add output metadata contract fixtures in `apps/web/tests/contract/jobs.conversion.test.ts` for signed download URL, derived content type, extension, and terminal conversion errors.

### Casper Implementation for User Story 3

- [ ] T025 [US3] Extend `apps/web/api/exports.ts` to accept validated conversion settings while deriving output extension/content type server-side and preserving the immutable source revision.
- [ ] T026 [US3] Add shared format-policy versioning in `apps/web/api/_lib/export.validation.ts` so API validation and worker validation can detect policy drift before processing.
- [ ] T027 [US3] Add retention and cleanup scheduling metadata for generated outputs in `apps/web/api/_lib/jobs.ts` and `apps/web/api/_lib/blob.ts`, keeping cleanup idempotent and separate from request-time FFmpeg work.

### Delegated Frontend Handoff for User Story 3

- [ ] T028 [US3] [Tomas] Wire the existing format and quality controls in `apps/web/src/components/export/ExportPanel.tsx` to the validated `settings` payload and display only options returned or supported by the API contract.
- [ ] T029 [US3] [Tomas] Update the existing export UI to show conversion progress, actionable failure messages, retry, and download states without exposing worker or storage implementation details.

**Checkpoint**: User Story 3 is independently testable when each supported conversion request is validated, queued, completed by the worker handoff, and downloaded through the authorized status contract.

---

## Phase 6: User Story 4 - Recover from Invalid Files and Processing Issues (Priority: P2)

**Goal**: Reject unsafe or invalid export requests clearly, preserve session usability, and expose only actionable processing failures.

**Independent Test**: Submit unsupported formats, malformed operations, foreign Blob keys, missing jobs, duplicate jobs, and simulated worker failures; verify safe 4xx responses or terminal error states followed by a successful retry with valid input.

- [ ] T030 [P] [US4] Add security regression tests in `apps/web/tests/contract/export.security.test.ts` for foreign Blob keys, path traversal-like keys, missing session binding, credential redaction, and no job creation after rejected validation.
- [ ] T031 [P] [US4] Add retry and recovery tests in `apps/web/tests/unit/jobs.recovery.test.ts` for queue failure, worker lease expiry, duplicate completion, output cleanup failure, and valid retry after a terminal failure.
- [ ] T032 [US4] Refine safe status/error mapping in `apps/web/api/exports.ts` and `apps/web/api/jobs/[jobId].ts` so invalid input returns 4xx, infrastructure failures return redacted 5xx responses, and unknown/unauthorized jobs do not reveal existence.
- [ ] T033 [US4] Add retention cleanup and stale-job recovery hooks to `apps/web/api/_lib/jobs.ts` and `apps/web/api/_lib/blob.ts`, recording cleanup failures without changing a completed job back to failed.
- [ ] T034 [US4] Document invalid-input, retry, expired-download, missing-credential, and worker-unavailable recovery behavior in `apps/web/README.md` and `specs/001-audio-editor-converter/quickstart.md`.

**Checkpoint**: User Story 4 is independently testable when unsafe requests fail before dispatch, processing failures are actionable, and a later valid request can proceed safely.

---

## Phase 7: Polish and Cross-Cutting Concerns

**Purpose**: Validate the Casper-owned API surface against the constitution, contracts, and deployment assumptions.

- [ ] T035 [P] Run `npm test`, `npm run lint`, and `npm run build` from `apps/web/` after API and contract changes; record required environment prerequisites in `apps/web/README.md`.
- [ ] T036 [P] Run the API contract suite with mocked Blob, job-store, and queue adapters and record evidence for `SC-005`, `SC-006`, and `SC-007` in `specs/001-audio-editor-converter/quickstart.md`.
- [ ] T037 Verify no FFmpeg process is spawned by `apps/web/api/exports.ts` or `apps/web/api/jobs/[jobId].ts`; document the worker boundary and queue payload in the contract.
- [ ] T038 [P] Run `git diff --check` and a secret scan over `apps/web/api/`, `apps/web/src/`, worker handoff documentation, and generated client assets; resolve any credential exposure.
- [ ] T039 Confirm final changed files respect team ownership: Casper-owned API/Blob/contract files are implemented, Tomas-owned UI tasks remain delegated, and worker/logic work has explicit owner handoffs in `specs/001-audio-editor-converter/quickstart.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; establishes provider and file boundaries.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user-story implementation.
- **User Story 1 (Phase 3)**: Upload and browser editing are existing prerequisites; upload changes are limited to the foundational Blob contract check in T011.
- **User Story 2 (Phase 3)**: Depends on the foundational schemas, Blob helpers, and job/queue adapters; this is the MVP API slice.
- **FFmpeg Worker (Phase 4)**: Depends on T019 and the completed API/Blob/Redis contracts; T050-T054 are delegated verification and integration handoffs.
- **User Story 3 (Phase 5)**: Depends on User Story 2's job lifecycle and status contract plus the worker's format/quality implementation.
- **User Story 4 (Phase 6)**: Depends on shared validation, job state behavior, and worker recovery handling from User Story 2.
- **Polish (Phase 7)**: Depends on the desired API stories and their delegated worker/UI handoffs being reviewed.

### User Story Dependencies

- **User Story 1 (P1)**: Upload and browser editing are existing prerequisites; this task list does not duplicate their frontend implementation.
- **User Story 2 (P1)**: Starts after Phase 2 and is the MVP export API increment; its frontend preview behavior remains a Jonas/Tomas responsibility.
- **User Story 3 (P2)**: Extends User Story 2 with format and quality validation.
- **User Story 4 (P2)**: Reuses User Story 2 and User Story 3 error/state boundaries for recovery behavior.

### Within Each User Story

- Contract and unit tests precede implementation changes where the task is test-first.
- Validation and ownership checks precede route dispatch.
- Job persistence and queue dispatch precede frontend polling handoff.
- API work precedes worker and UI integration validation.

### Parallel Opportunities

- T002, T003, T004, T005, T006, T009, and T010 can run in parallel during setup/foundation when they touch separate files.
- T012, T013, and T014 can run in parallel because they cover separate contract/state-test surfaces.
- T020 and T021 can run in parallel with each other after the API response contract is stable, but both are delegated to Tomas.
- T022, T023, and T024 can run in parallel before conversion implementation.
- T041, T042, T050, and T051 can run in parallel after the worker directory and contract boundary exist.
- T043 and T046 can run in parallel after the typed operation and format policies are available.
- T048, T052, and T053 can run in parallel after worker orchestration is stable; T054 follows the published API response contract.
- T030 and T031 can run in parallel because they cover security and recovery tests separately.
- T035, T036, and T038 can run in parallel after implementation changes settle.

## Parallel Example: User Story 2

```text
Task T012: Contract tests for POST /api/exports
Task T013: Contract tests for GET /api/jobs/[jobId]
Task T014: Job state-transition tests
Task T020: Tomas wires existing export controls to POST /api/exports
Task T021: Tomas wires polling/download handling to GET /api/jobs/{jobId}
```

## Parallel Example: User Story 3

```text
Task T022: Format and quality validation tests
Task T023: Conversion request contract tests
Task T024: Conversion output contract fixtures
Task T028: Tomas wires existing format/quality controls
Task T029: Tomas wires conversion progress and retry states
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 setup and Phase 2 API foundations.
2. Implement User Story 2 API routes, private Blob authorization, durable job state, and queue dispatch.
3. Complete Casper's Phase 4 worker tasks T040-T049 against the published contracts.
4. Complete the delegated test and UI/browser handoffs T050-T054.
5. Validate User Story 2 independently with mocked adapters and a configured end-to-end environment.
6. Stop at the MVP checkpoint before adding conversion policy breadth or recovery hardening.

### Incremental Delivery

1. Private upload and API foundation.
2. User Story 2: asynchronous preserve-format export and authorized download.
3. User Story 3: validated conversion formats and quality settings.
4. User Story 4: security, failure recovery, cleanup, and stale-job handling.
5. Cross-cutting validation and deployment review.

## Ownership Notes

- **Casper**: Implement T001-T019, T022-T027, T030-T049 where they touch API routes, Vercel Blob access/configuration, Redis job metadata/queue adapters, endpoint contracts, FFmpeg worker execution, or infrastructure documentation.
- **Tomas**: Implement delegated UI tasks T020, T021, T028, and T029 in the existing export components; these tasks do not authorize API or Blob changes.
- **Jonas**: Own browser edit-plan serialization and core application state needed to produce the `operations` and `sourceRevision` payload consumed by T016.
- **Paul-Henrik**: Own delegated worker/API contract tests, FFmpeg fixture checks, CI/test infrastructure, and test-suite pipeline integration; Casper owns worker implementation and API behavior.

## Completion Criteria

- All Casper-owned tasks have a concrete file path and remain within API, Vercel Blob, Redis, job-adapter, endpoint-contract, FFmpeg, or infrastructure-documentation scope.
- Delegated Tomas tasks are explicitly labeled and do not assign frontend implementation to Casper.
- Every task follows the required `- [ ] T### [P?] [US#] Description` checklist format, with no story label on Setup, Foundational, or Polish tasks.
- User Story 2 is independently testable as the MVP API increment.
- No API handler performs FFmpeg work or exposes Blob credentials.
