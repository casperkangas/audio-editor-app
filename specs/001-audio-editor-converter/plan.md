# Implementation Plan: Web Audio Editor and Converter

**Branch**: `001-audio-editor-converter` | **Date**: 2026-08-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-audio-editor-converter/spec.md`

## Summary

Build a React-based web application that lets a user upload an audio file, inspect and edit it in-browser with a waveform editor, preview the edited result, and export either the edited file in place or a converted copy. The architecture separates browser-side playback and editing from final rendering and conversion work. User interactions such as seeking, selection, trim, cut, split, volume, fades, and undo/redo are handled in the browser with a non-destructive edit pipeline. Final audio render and conversion run through a separate server-side or worker pipeline using FFmpeg, with output stored in Vercel Blob. Large uploads are directed to Blob via signed URLs, avoiding unnecessary server relay and keeping the app responsive.

## Technical Context

**Language/Version**: React + TypeScript, Vite-based frontend build, Node.js for server-side process orchestration.

**Primary Dependencies**: React, Vite, TypeScript, Web Audio API, waveform rendering library or Canvas-based renderer, Vercel Blob SDK, FFmpeg/ffprobe, serverless API layer for orchestration, job queue or background worker.

**Storage**: Vercel Blob for uploaded input files, generated output artifacts, and temporary job files; browser session state for preview/edit history; no durable database required for MVP beyond job metadata and object references.

**Testing**: Vitest, React Testing Library, Playwright for browser flows, ffprobe smoke tests, and targeted audio-render regression checks.

**Target Platform**: Browser-based web app hosted on Vercel with serverless functions or a small worker runtime for processing tasks.

**Project Type**: Web application.

**Performance Goals**: Interactive editing should feel responsive in normal use; waveform interaction should avoid blocking the UI; export jobs should complete in a predictable time for small-to-medium files while long-running server-side work is isolated from the live editor.

**Constraints**: Keep the browser responsive under common desktop/tablet workloads; avoid direct CPU-heavy operations in ordinary request handlers; support moderate file sizes and enforce explicit limits; protect uploaded content from public exposure and abuse; ensure a clear separation between in-browser preview and final rendered output.

**Scale/Scope**: Small-to-moderate user base, single audio project at a time, limited initial feature set, with a path to scale processing independently if usage grows.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- PASS: User-centered simplicity is preserved by limiting the MVP to core editing, preview, and export workflows rather than a multi-track production editor.
- PASS: Architecture boundaries are explicit; browser-side editing, storage, and server-side rendering/conversion are separated by design.
- PASS: Security and privacy are addressed through validation, signed uploads, object access control, temporary-file cleanup, and malicious/invalid input handling.
- PASS: Responsive and accessible UX is prioritized through waveform interaction, playback feedback, progress states, and plain-language errors.
- PASS: Risk-driven design is required; major technical risks around browser audio processing, waveform rendering, large-file uploads, long-running conversion, and Vercel constraints are identified before implementation.
- PASS: Unnecessary complexity is avoided by keeping the initial MVP focused on single-file edits and final export rather than advanced production toolchains.

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

server/
├── api/
│   ├── upload-url.ts
│   ├── export.ts
│   ├── jobs.ts
│   └── health.ts
├── jobs/
│   ├── queue.ts
│   ├── render-worker.ts
│   └── status.ts
├── lib/
│   ├── ffmpeg.ts
│   ├── blob.ts
│   ├── validation.ts
│   └── cleanup.ts
└── tests/
    └── job-processing/
```

**Structure Decision**: A split Structure is used: React frontend in `apps/web` for the UI and browser-side editing logic, with a small server layer under `server/` for signed upload orchestration, background job triggering, final rendering, and file cleanup. This keeps the UI responsive while isolating CPU-intensive audio processing from ordinary interactive flows.

## Complexity Tracking

No constitution violations requiring justified exceptions were identified.
