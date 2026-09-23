---
description: "Actionable tasks for the browser audio editor, asynchronous export API, and FFmpeg worker"
---

# Tasks: Audio Editor and Export

**Input**: Design documents from `/specs/001-audio-editor-converter/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/audio-processing-contract.md, quickstart.md

**Ownership**: Jonas owns browser editor state, edit operations, serialization, and functional audio algorithms. Casper owns Blob, API, Redis, queue, and worker implementation. Tomas owns visual React interaction and layout. Paul-Henrik owns test infrastructure, fixtures, and CI.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it affects a different file or independent contract surface.
- **[Story]**: Required for user-story tasks and maps to the feature specification.
- Every task names an exact file, directory, or command scope.

## Phase 1: Setup

**Purpose**: Establish the existing browser, API, and worker implementation boundaries.

- [x] T001 Create and verify `apps/web/api/_lib/` and `workers/audio-export/` directory boundaries against `specs/001-audio-editor-converter/plan.md`.
- [x] T002 [P] Document server-only environment variables, the 50 MiB upload default, the 2-hour duration default, and retention settings in `apps/web/README.md`.
- [ ] T003 [P] Verify `@vercel/blob`, `@vercel/node`, `redis`, React, Vite, Vitest, and TypeScript versions in `apps/web/package.json` and record any missing dependency decision in `specs/001-audio-editor-converter/research.md`.
- [ ] T004 [P] Define provider-neutral job-store and queue interfaces with atomic revisions, leases, TTLs, and dispatch-by-job-ID behavior in `apps/web/api/_lib/jobs.ts` and `apps/web/api/_lib/queue.ts`.

## Phase 2: Foundational

**Purpose**: Establish shared contracts and security boundaries before story implementation.

**CRITICAL**: User-story tasks must not begin until this phase is complete.

- [ ] T005 [P] Define export request, edit-operation, settings, status, stage, and error-code schemas in `apps/web/api/_lib/export.validation.ts` from `specs/001-audio-editor-converter/contracts/audio-processing-contract.md`.
- [ ] T006 [P] Implement private Blob lookup and short-lived download URL helpers with project/session ownership checks in `apps/web/api/_lib/blob.ts`.
- [ ] T007 Implement finite numeric, duration-bound, operation-count, and immutable-snapshot validation for trim, cut, split, volume, fade-in, and fade-out in `apps/web/api/_lib/export.validation.ts`.
- [ ] T008 [P] Implement format and quality policy validation for WAV, MP3, FLAC, OGG, and AAC in `apps/web/api/_lib/export.validation.ts`, deriving output extensions and content types server-side.
- [ ] T009 [P] Define redacted user-facing error mapping and verify private upload validation in `apps/web/api/_lib/errors.ts`, `apps/web/api/upload.validation.ts`, and `apps/web/api/upload.ts`.

**Checkpoint**: Browser state, API schemas, private Blob access, error mapping, and job adapters have clear ownership and no API handler performs FFmpeg work.

## Phase 3: User Story 1 - Upload and Edit Audio in the Browser (Priority: P1)

**Goal**: Provide a responsive, non-destructive single-file editor with selection, playback, editing, undo, redo, and reproducible state.

**Independent Test**: Load `sample-sounds/example.wav`, play and seek, select a bounded region, apply each supported edit, undo and redo the change, and confirm the preview and serialized operation list match without mutating the original source.

### Tests for User Story 1

- [x] T010 [P] [US1] Extend operation tests for selection bounds, empty selections, duration limits, and non-mutation in `apps/web/src/lib/editing/operations.test.ts`.
- [x] T011 [P] [US1] Extend history tests for operation ordering, redo invalidation after a new edit, and source-preserving undo/redo in `apps/web/src/lib/editing/history.test.ts`.
- [x] T012 [P] [US1] Add serialization tests for valid snapshots, unsupported operations, non-finite parameters, source revisions, and exclusion of audio buffers in `apps/web/src/lib/editing/serializeEditPlan.test.ts`.
- [ ] T013 [P] [US1] Add browser-flow tests for upload, waveform selection, playback, edit feedback, undo/redo, and responsive control availability in `apps/web/tests/e2e/editor-flow.test.ts`.

### Jonas Implementation for User Story 1

- [x] T014 [US1] Keep the original decoded source separate from the replayed working buffer and preserve selection, duration, playback, and error invariants in `apps/web/src/lib/useEditor.ts` and `apps/web/src/hooks/useAudioEngine.ts`.
- [x] T015 [US1] Implement bounded, ordered edit-plan serialization containing `sourceRevision`, operation IDs/types/parameters, source duration, and current duration in `apps/web/src/lib/editing/serializeEditPlan.ts`.
- [x] T016 [US1] Align the edit operation type and parameter guards with the shared contract for trim, cut, split, volume, fade-in, and fade-out in `apps/web/src/lib/types.ts` and `apps/web/src/lib/editing/operations.ts`.
- [x] T017 [US1] Verify common playback, seeking, selection, trim, undo, and redo interactions complete within 200 milliseconds and record the result in `apps/web/src/tests/unit/editor-performance.test.ts`.

### Tomas Implementation for User Story 1

- [ ] T018 [US1] Keep waveform selection, playhead, loading, error, and edit-action feedback usable at 768px and 2560px widths in `apps/web/src/components/waveform/`, `apps/web/src/components/transport/`, and `apps/web/src/components/editor/`.
- [ ] T019 [US1] Add or verify keyboard access and plain-language status feedback for selection, playback, undo, redo, and edit actions in `apps/web/src/components/toolbar/` and `apps/web/src/App.tsx`.

**Checkpoint**: User Story 1 is independently testable when a user can complete the browser editing loop and the export snapshot is reproducible without source mutation.

## Phase 4: User Story 2 - Preview and Export a Finished Result (Priority: P1)

**Goal**: Queue the current edit snapshot, expose safe progress, and provide an authorized downloadable result.

**Independent Test**: With a valid private source and mocked adapters, submit an immutable edit snapshot, receive a queued job, observe authorized progress, and download a verified result after worker completion.

### Tests for User Story 2

- [ ] T020 [P] [US2] Add request/response contract tests for preserve-format `POST /api/exports` in `apps/web/tests/contract/exports.route.test.ts`.
- [ ] T021 [P] [US2] Add authorized status tests for `GET /api/jobs/[jobId]` in `apps/web/tests/contract/jobs.route.test.ts`.
- [ ] T022 [P] [US2] Add Redis job transition tests for claim, monotonic progress, lease expiry, terminal protection, and duplicate completion in `apps/web/tests/unit/jobs.test.ts`.

### Casper Implementation for User Story 2

- [ ] T023 [US2] Persist project/session ownership and immutable export jobs with source revision, operations, settings, status, progress, retention, and session binding in `apps/web/api/_lib/jobs.ts`.
- [ ] T024 [US2] Implement `POST /api/exports` with source authorization, edit snapshot validation, one-active-job protection, Redis persistence, opaque queue dispatch, and queued response in `apps/web/api/exports.ts`.
- [ ] T025 [US2] Implement `GET /api/jobs/[jobId]` with authorization, bounded read-model fields, terminal error mapping, and short-lived download signing in `apps/web/api/jobs/[jobId].ts`.
- [ ] T026 [US2] Document and verify dispatch and completion payloads, including `sourceRevision` and ordered operations, in `specs/001-audio-editor-converter/contracts/audio-processing-contract.md`.

### Worker Implementation for User Story 2

- [x] T027 [US2] Parse `{ jobId: string }` messages and load immutable jobs in `workers/audio-export/worker.ts`.
- [x] T028 [P] [US2] Download private sources and manage isolated temporary files in `workers/audio-export/ffmpeg.ts`.
- [x] T029 [P] [US2] Inspect source streams, codecs, duration, and malformed containers with bounded `ffprobe` handling in `workers/audio-export/ffmpeg.ts`.
- [x] T030 [US2] Translate typed edit operations into a constrained render plan without client-provided shell arguments in `workers/audio-export/render-plan.ts`.
- [x] T031 [US2] Build non-interpolated FFmpeg arguments from validated operations and format policy in `workers/audio-export/ffmpeg.ts`.
- [x] T032 [US2] Implement claim, progress, lease, success, and categorized failure orchestration with Redis compare-and-set protection in `workers/audio-export/worker.ts`.
- [ ] T033 [P] [US2] Add worker contract tests for queue parsing, job revisions, source authorization, and safe errors in `workers/audio-export/worker.contract.test.ts`.

### Tomas Integration for User Story 2

- [x] T034 [US2] Wire existing export controls, queued/running/succeeded/failed states, polling, duplicate-submit protection, and download handling in `apps/web/src/components/export/ExportPanel.tsx`.

**Checkpoint**: User Story 2 is independently testable when a valid browser edit snapshot produces one authorized queued job and one verified downloadable result.

## Phase 5: User Story 3 - Convert the Edited Audio (Priority: P2)

**Goal**: Support validated format and quality conversion without moving FFmpeg work into API handlers.

**Independent Test**: Submit one valid request for each supported format and quality policy, reject invalid combinations before dispatch, and verify terminal output metadata.

- [ ] T035 [P] [US3] Add format and quality validation tests for WAV, MP3, FLAC, OGG, and AAC in `apps/web/tests/unit/export.validation.test.ts`.
- [ ] T036 [P] [US3] Add conversion request and output metadata contract tests in `apps/web/tests/contract/exports.conversion.test.ts` and `apps/web/tests/contract/jobs.conversion.test.ts`.
- [ ] T037 [US3] Extend validated conversion settings and server-derived output metadata in `apps/web/api/exports.ts`.
- [ ] T038 [US3] Add shared format-policy versioning to detect API/worker drift in `apps/web/api/_lib/export.validation.ts`.
- [x] T039 [US3] Implement WAV, MP3, FLAC, OGG, and AAC encoder mappings in `workers/audio-export/ffmpeg.ts`.
- [x] T040 [US3] Verify output container, codec, duration, extension, and private storage before success in `workers/audio-export/worker.ts`.
- [x] T041 [P] [US3] Wire format and quality controls and conversion progress/retry states in `apps/web/src/components/export/ExportPanel.tsx`.
- [ ] T042 [P] [US3] Add FFmpeg fixture smoke tests for each supported format and typed edit operation in `workers/audio-export/ffmpeg.fixture.test.ts`.

**Checkpoint**: User Story 3 is independently testable when all supported conversions obey the shared policy and produce verified private outputs.

## Phase 6: User Story 4 - Recover from Invalid Files and Processing Issues (Priority: P2)

**Goal**: Reject unsafe input safely, preserve session usability, and recover from worker failures without leaking implementation details.

**Independent Test**: Submit invalid files, malformed operations, foreign keys, duplicate jobs, and simulated worker failures; verify safe rejection or terminal failure followed by a valid retry.

- [ ] T043 [P] [US4] Add security regression tests for foreign keys, path-like keys, missing sessions, credential redaction, and no job creation after rejection in `apps/web/tests/contract/export.security.test.ts`.
- [ ] T044 [P] [US4] Add retry, lease-expiry, duplicate-completion, and cleanup-failure tests in `apps/web/tests/unit/jobs.recovery.test.ts`.
- [ ] T045 [US4] Refine safe 4xx/5xx and unknown-job mapping in `apps/web/api/exports.ts` and `apps/web/api/jobs/[jobId].ts`.
- [x] T046 [US4] Clean up temporary files and failed outputs idempotently in `workers/audio-export/cleanup.ts`.
- [x] T047 [US4] Handle lease expiry, duplicate delivery, retries, and partial-output recovery without duplicate success in `workers/audio-export/worker.ts` and `workers/audio-export/cleanup.ts`.
- [ ] T048 [US4] Document invalid-input, retry, expired-download, missing-credential, and worker-unavailable recovery in `apps/web/README.md` and `specs/001-audio-editor-converter/quickstart.md`.
- [ ] T049 [P] [US4] Add worker recovery tests for probe failure, FFmpeg failure, lease expiry, duplicate delivery, cleanup failure, and terminal retry behavior in `workers/audio-export/worker.recovery.test.ts`.

**Checkpoint**: User Story 4 is independently testable when unsafe requests fail before dispatch and later valid work can proceed safely.

## Phase 7: Polish and Cross-Cutting Concerns

- [ ] T050 [P] Run `npm test`, `npm run lint`, and `npm run build` from `apps/web/` and record prerequisites in `apps/web/README.md`.
- [ ] T051 [P] Run the upload-to-download flow and record evidence for SC-001, SC-002, SC-005, and SC-006 in `specs/001-audio-editor-converter/quickstart.md`.
- [ ] T052 [P] Run the 20-session concurrency and sub-200ms interaction checks and record evidence for SC-004 and SC-007 in `specs/001-audio-editor-converter/quickstart.md`.
- [ ] T053 Verify no FFmpeg process is spawned by `apps/web/api/exports.ts` or `apps/web/api/jobs/[jobId].ts` and document the worker boundary in `specs/001-audio-editor-converter/contracts/audio-processing-contract.md`.
- [ ] T054 [P] Run `git diff --check` and a secret scan over `apps/web/`, `workers/audio-export/`, and feature documentation.
- [ ] T055 Confirm changed files respect Casper, Jonas, Tomas, and Paul-Henrik ownership boundaries in `specs/001-audio-editor-converter/quickstart.md`.
- [x] T056 [US1] Jonas: implement transient Help/Account popover state and action handlers in `apps/web/src/App.tsx`, including one-open-at-a-time behavior, Escape/outside dismissal, focus return, and no Account navigation or network request.
- [ ] T057 [P] [US1] Tomas: implement the responsive Help and Account popover presentation, accessible labels, shortcut/status copy, and 768px/2560px layouts in `apps/web/src/App.tsx` and `apps/web/src/App.css`.
- [ ] T058 [P] [US1] Paul-Henrik: add interaction tests for Help/Account keyboard activation, Escape dismissal, focus return, responsive visibility, and no Account request in `apps/web/tests/e2e/header-controls.test.ts`.

## Dependencies and Execution Order

### Phase Dependencies

- **Setup**: No dependencies; establishes the repository boundaries.
- **Foundational**: Depends on Setup and blocks all user stories.
- **User Story 1**: Depends on the foundational validation policies and is the browser-editor baseline.
- **User Story 2**: Depends on User Story 1 serialization and the foundational API/job contracts; this is the P1 export increment.
- **User Story 3**: Depends on User Story 2 job lifecycle and worker renderer.
- **User Story 4**: Depends on shared validation, job transitions, and worker recovery primitives.
- **Polish**: Depends on the stories and delegated owner handoffs being complete.

### User Story Dependencies

- **US1 (P1)**: No story dependency; required for every later story because it produces the immutable edit snapshot.
- **US2 (P1)**: Depends on US1 serialization and Phase 2 API foundations.
- **US3 (P2)**: Depends on US2 job lifecycle and worker renderer.
- **US4 (P2)**: Reuses US2 and US3 error, cleanup, and recovery boundaries.

### Parallel Opportunities

- T003-T009 can run in parallel when they touch separate setup and validation surfaces.
- T010-T013 can run in parallel because they cover independent browser test surfaces.
- T018-T019 can run in parallel with Jonas's state work after the editor action contract is stable.
- T020-T022 can run in parallel before US2 route implementation.
- T028-T029 and T033 can run in parallel after T027 establishes the worker message boundary.
- T035-T036 and T041-T042 can run in parallel before US3 implementation settles.
- T043-T044 and T049 can run in parallel because they cover separate security and recovery surfaces.
- T050-T054 can run in parallel after implementation changes settle.
- T056-T058 can run in parallel after the editor action and accessibility contract is agreed; T057 and T058 depend on Jonas's state/action surface.

## Parallel Examples

### User Story 1

```text
Task T010: Operation boundary tests
Task T011: History behavior tests
Task T012: Edit-plan serialization tests
Task T013: Browser-flow tests
```

### User Story 2

```text
Task T020: Export route contract tests
Task T021: Job status contract tests
Task T022: Redis state-transition tests
Task T033: Worker contract tests
```

### User Story 3

```text
Task T035: Format and quality tests
Task T036: Conversion contract tests
Task T042: FFmpeg fixture smoke tests
```

### User Story 4

```text
Task T043: Security regression tests
Task T044: Job recovery tests
Task T049: Worker recovery tests
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Complete User Story 1 so Jonas's browser edit state and serialization are independently verified.
3. Complete User Story 2 preserve-format export and its worker handoff.
4. Stop at the combined US1 + US2 MVP checkpoint before adding conversion breadth or recovery hardening.

### Incremental Delivery

1. Browser editing and reproducible edit snapshots.
2. Asynchronous preserve-format export and authorized download.
3. Validated conversion formats and quality settings.
4. Security, cleanup, retry, and stale-job recovery.
5. Cross-cutting performance, concurrency, accessibility, and ownership review.

## Ownership Notes

- **Jonas**: T010-T017 and T056; owns browser edit operations, source-preserving state, history, serialization, functional latency checks, and top-right control behavior/state.
- **Casper**: T001-T009, T023-T033, T037-T040, T045-T047, and T053; owns API, Blob, Redis, queue, worker, and infrastructure boundaries.
- **Tomas**: T018-T019, T034, T041, and T057; owns React interaction, visual layout, feedback, and responsive behavior.
- **Paul-Henrik**: T013, T033, T042-T044, T049, T058, and CI portions of T050; owns test infrastructure and fixture execution without changing product behavior.

## Completion Criteria

- Every task follows `- [ ] T### [P?] [US#] Description` with a concrete path or command scope.
- User Story 1 covers browser upload, playback, selection, editing, undo/redo, serialization, accessibility, and measurable responsiveness.
- User Story 2 is independently testable as the P1 export increment.
- User Stories 3 and 4 cover conversion policy and failure recovery without moving FFmpeg into API handlers.
- All completed worker tasks remain marked `[x]`; new work remains unchecked.
- Top-right controls have an explicit Jonas behavior task, Tomas presentation task, and Paul-Henrik interaction-test task.
- No API handler exposes Blob credentials or performs FFmpeg work.
