---
description: "Task list for reviewing, testing, documenting, and integrating the existing Vercel Blob upload endpoint"
---

# Tasks: Secure Vercel Blob Upload Integration

**Input**: Design documents from `/specs/001-audio-editor-converter/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/audio-processing-contract.md, quickstart.md

**Scope**: This task list is intentionally limited to the already implemented `/api/upload` endpoint. It does not add audio editing, rendering, conversion, job processing, or new storage features.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it affects different files and has no incomplete dependency
- **[Story]**: User story label for traceability
- Every task includes the exact file or command scope it affects

## Phase 1: Setup and Current-State Review

**Purpose**: Confirm the existing Vite/Vercel setup and establish the review baseline.

- [ ] T001 Inspect `apps/web/api/upload.ts`, `apps/web/api/upload.validation.ts`, `apps/web/package.json`, and `apps/web/.env.local` to record the current direct-upload behavior, environment variables, and available validation commands.
- [ ] T002 [P] Verify `apps/web/.gitignore` excludes `.env*`, `node_modules/`, `dist/`, and `.vercel/`, and document any missing ignore patterns in `apps/web/.gitignore`.

---

## Phase 2: Foundational Upload Contract Review

**Purpose**: Establish the security and contract checks required before story-level integration validation.

- [ ] T003 Review `specs/001-audio-editor-converter/contracts/audio-processing-contract.md` against `apps/web/api/upload.ts` and record any mismatch in the contract or route behavior.
- [ ] T004 [P] Confirm `BLOB_READ_WRITE_TOKEN` is referenced only by server-side Vercel configuration and `@vercel/blob/client` handling, with no `VITE_` exposure or import from `apps/web/src/`.
- [ ] T005 Confirm the configured upload limit and supported extension/content-type allowlists in `apps/web/api/upload.validation.ts` are documented as environment-controlled behavior, including the 50 MiB default.

**Checkpoint**: The upload contract, secret boundary, and configurable limits are understood before adding or changing tests.

---

## Phase 3: User Story 1 - Direct Audio Upload Token Flow (Priority: P1) 🎯 MVP

**Goal**: Verify that a browser can request a restricted client-upload token from `/api/upload` and upload an allowed audio file directly to Vercel Blob without routing file bytes through the application server.

**Independent Test**: With Vercel Blob credentials configured, request a client token through `/api/upload`, upload a supported audio file using `@vercel/blob/client` with `handleUploadUrl: "/api/upload"`, and verify that the returned Blob metadata identifies the uploaded object without exposing the server token.

### Tests for User Story 1

- [ ] T006 [P] [US1] Add validation tests in `apps/web/api/upload.validation.test.ts` covering accepted audio extensions, rejected non-audio extensions, accepted MIME types, rejected MIME types, the default 50 MiB limit, and valid/invalid `AUDIO_UPLOAD_MAX_SIZE_BYTES` values.
- [ ] T007 [P] [US1] Add endpoint contract tests in `apps/web/api/upload.test.ts` covering POST token generation, method rejection, malformed JSON handling, unsupported filename rejection, and safe error responses without asserting internal SDK calls.
- [ ] T008 [US1] Add a direct-upload integration scenario in `apps/web/tests/integration/upload.integration.test.ts` that uses the real Vercel Blob client contract against a configured local/Vercel environment and verifies the upload result and progress-capable client path.

### Implementation and Integration for User Story 1

- [ ] T009 [US1] Update `apps/web/api/upload.ts` only where the contract review or failing tests identify a concrete issue, preserving `handleUpload`, server-only credentials, direct browser upload, and the existing allowlist.
- [ ] T010 [US1] Add or update the test command and test configuration in `apps/web/package.json` and the repository-supported test configuration so `upload.validation.test.ts`, `upload.test.ts`, and the integration test can run without bundling server secrets into the frontend.
- [ ] T011 [US1] Verify the frontend integration uses `upload()` from `@vercel/blob/client` with `access: "private"`, `handleUploadUrl: "/api/upload"`, and the selected file content type in `apps/web/src/` or the owning upload component, without adding `BLOB_READ_WRITE_TOKEN` to client-visible environment variables.

**Checkpoint**: User Story 1 is independently testable when a supported file receives a restricted token and direct Blob upload succeeds, while invalid requests fail safely.

---

## Phase 4: User Story 4 - Invalid Upload Feedback and Recovery (Priority: P2)

**Goal**: Confirm that unsupported, malformed, oversized, or incorrectly typed upload requests are rejected clearly and do not create an unsafe upload path.

**Independent Test**: Submit invalid upload-token requests and verify a 4xx JSON error, then submit a valid supported audio request and verify that the application remains usable for the next upload attempt.

### Tests for User Story 4

- [ ] T012 [P] [US4] Extend `apps/web/api/upload.test.ts` with boundary cases for empty pathnames, path traversal-like names, uppercase extensions, unsupported content types, and invalid request bodies.
- [ ] T013 [P] [US4] Add a security regression test in `apps/web/tests/integration/upload.security.test.ts` confirming that the client response never contains `BLOB_READ_WRITE_TOKEN` or other server credential values and that rejected inputs do not receive a client token.

### Implementation and Documentation for User Story 4

- [ ] T014 [US4] Refine user-safe error mapping in `apps/web/api/upload.ts` only if tests expose an ambiguous status or message, keeping internal exception details out of 5xx responses.
- [ ] T015 [US4] Document invalid-file, size-limit, missing-credential, and local-network recovery guidance in `apps/web/README.md` and reference the configured `AUDIO_UPLOAD_MAX_SIZE_BYTES` limit.

**Checkpoint**: User Story 4 is independently testable when invalid inputs produce actionable safe errors and a subsequent valid upload can proceed.

---

## Phase 5: Polish and Cross-Cutting Validation

**Purpose**: Validate the completed upload slice against the contract, plan, and deployment assumptions.

- [ ] T016 [P] Update `specs/001-audio-editor-converter/contracts/audio-processing-contract.md` and `specs/001-audio-editor-converter/quickstart.md` to match the final `/api/upload` token exchange and direct-upload verification steps.
- [ ] T017 Run `npm run build`, `npm run lint`, the focused upload tests, and `npx vercel dev` integration validation from `apps/web/`, recording expected local environment prerequisites in `apps/web/README.md`.
- [ ] T018 Run `git diff --check` and a final secret scan over `apps/web/src/`, `apps/web/api/`, documentation, and generated client assets; resolve any accidental token exposure or whitespace issue.
- [ ] T019 Confirm the final changed files remain limited to the upload route, validation/tests, package test configuration, upload documentation, and the upload contract/quickstart artifacts; do not add editor, conversion, or background-processing work.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; establishes the current-state baseline.
- **Foundational (Phase 2)**: Depends on T001; blocks story-level test and integration work until the contract and secret boundary are understood.
- **User Story 1 (Phase 3)**: Depends on Phase 2; delivers the MVP direct-upload token flow.
- **User Story 4 (Phase 4)**: Depends on Phase 2 and the shared endpoint behavior from User Story 1; focuses only on invalid-input and recovery behavior.
- **Polish (Phase 5)**: Depends on the selected User Story 1 and User Story 4 tasks being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after the foundational review and is the only required MVP story for the direct upload integration.
- **User Story 4 (P2)**: Starts after the foundational review and reuses the upload route and validation boundary from User Story 1.

### Within Each User Story

- Tests must be added before implementation changes where a concrete defect is found.
- Validation helpers are reviewed before route changes.
- Route changes precede frontend integration validation.
- Documentation and full validation follow the implementation changes.

### Parallel Opportunities

- T002, T004, and T005 can run in parallel after the initial current-state review.
- T006 and T007 can run in parallel because they cover separate test files.
- T012 and T013 can run in parallel because they cover separate test files.
- T016 and T018 can run in parallel after implementation and test changes settle.

## Parallel Example: User Story 1

```text
Task T006: Add validation tests in apps/web/api/upload.validation.test.ts
Task T007: Add endpoint contract tests in apps/web/api/upload.test.ts
```

## Parallel Example: User Story 4

```text
Task T012: Extend apps/web/api/upload.test.ts with invalid-input boundaries
Task T013: Add apps/web/tests/integration/upload.security.test.ts
```

## Implementation Strategy

### MVP First

1. Complete the current-state and foundational contract review.
2. Add focused validation and endpoint contract tests.
3. Verify the existing `/api/upload` implementation against those tests.
4. Validate the direct browser-to-Blob integration with configured Vercel credentials.
5. Stop and verify the upload slice independently before considering broader audio-editor work.

### Incremental Delivery

1. Direct token generation and allowed-file upload: User Story 1.
2. Invalid input, secret-boundary, and recovery checks: User Story 4.
3. Documentation, quickstart verification, and deployment checks: Polish phase.

## Completion Criteria

- All tasks above are marked complete only after their corresponding review, test, documentation, or validation evidence exists.
- The `/api/upload` endpoint remains compatible with the Vite and Vercel structure.
- The Blob write token is never present in frontend-visible code or environment variables.
- No audio editing, conversion, rendering, or job-queue features are introduced by this task list.
