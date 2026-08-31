# Research: Web Audio Editor and Converter

## Decision Summary

### 1. Frontend framework and app structure

- Decision: Use React with TypeScript in a Vite-based web app.
- Rationale: It matches the required stack and supports a responsive editor UI, waveform rendering, and stateful interaction models without forcing a Next.js requirement.
- Alternatives considered: Pure vanilla JS, React + Next.js, and desktop-style Electron shell.
  - Vanilla JS was rejected because the required complexity and state management are better served by a component-driven UI.
  - Next.js was explicitly excluded by product requirements; it would add unnecessary routing and server-rendering complexity.
  - Electron was rejected because the product is browser-first and should remain lightweight and web-native.

### 2. Browser-side audio processing approach

- Decision: Use Web Audio API for playback, decoding, selection/preview playback, volume, and fade logic in the browser.
- Rationale: These operations are immediate, interactive, and do not need server round trips. The browser is the correct place for editing responsiveness and preview.
- Alternatives considered: Server-side render for every edit and client-only waveform extraction.
  - Server-side render on every change would be too slow and would block the editor UX.
  - Client-only decoding is necessary for responsiveness; however, the final export remains server-backed.

### 3. Waveform rendering and interaction

- Decision: Render waveform using Canvas or WebGL-friendly canvas-based drawing with a simplified preview strip and an interactive selection overlay.
- Rationale: This gives a good balance between responsiveness, precision, and browser compatibility for a single-track editor.
- Alternatives considered: SVG-heavy rendering, DOM-per-sample rendering, and third-party heavy audio editors.
  - SVG or DOM-per-sample approaches were rejected because they scale poorly with large audio files.
  - A lightweight canvas pipeline is easier to keep interactive and maintainable.

### 4. Editing model

- Decision: Store edits as a set of operations on a timeline abstraction rather than mutating the original audio source directly.
- Rationale: This preserves non-destructive editing and supports undo/redo and export of multiple outputs from the same project state.
- Alternatives considered: In-place destructive modifications after each action and file snapshot snapshots for all operations.
  - In-place mutation is incompatible with the required non-destructive editing and preview flow.
  - Full snapshotting every change is simpler to reason about but not scalable for large files; a timeline-based operation model is more practical.

### 5. Undo/redo

- Decision: Maintain a command history of edit operations and an application state snapshot at key moments.
- Rationale: This keeps the UI responsive and allows safe rollback without repeatedly re-encoding the source file.
- Alternatives considered: Rebuilding from the original file on every undo or storing a full audio buffer after each change.
  - Rebuilding from scratch for every undo is expensive and unnecessary.
  - Full buffer snapshots are expensive for large files and create excessive memory pressure.

### 6. Browser-only vs server-side operations

- Decision: Browser-only for playback, seeking, region selection, trimming/cut preview, fade, volume, and local undo/redo; server-side for final render, conversion, and validation-heavy processing.
- Rationale: This matches the product principle of responsive interaction and keeps CPU-intensive jobs out of the UI thread and ordinary request handlers.
- Alternatives considered: Rendering every edit server-side and performing all exports in the browser.
  - Server-side every edit would slow the user experience.
  - Browser-only conversion is not realistic for all supported formats and would depend heavily on codec support and browser constraints.

### 7. Final audio rendering and conversion

- Decision: Perform final audio render and conversion through FFmpeg-based processing on a server-side worker or background job environment.
- Rationale: FFmpeg is the standard tool for robust audio rendering and format conversion and is appropriate when the final output must be produced accurately and predictably.
- Alternatives considered: Browser conversions using MediaRecorder or browser codec APIs and custom re-encoding libraries.
  - Browser APIs are not consistent enough across formats and quality settings.
  - FFmpeg is a more reliable and production-friendly choice for output fidelity and supported formats.

### 8. Storage and upload strategy

- Decision: Use Vercel Blob with direct upload to Blob storage from the browser, using signed URLs from the application.
- Rationale: This avoids routing large audio files through the app server unnecessarily while still keeping the upload flow controlled and secure.
- Alternatives considered: Upload through the app server and then re-upload to Blob, or storing everything in the app server filesystem.
  - Server relay increases bandwidth cost and latency for large files.
  - Vercel Blob is a better fit for file delivery and temporary processing artifacts in this deployment model.

### 9. Processing jobs and queueing

- Decision: Represent each export or conversion as a job with status, source object identity, target format, quality settings, and error metadata.
- Rationale: Jobs allow progress tracking, retries, graceful failure handling, and separation from UI state.
- Alternatives considered: Synchronous request-driven processing and in-memory processing only.
  - Synchronous processing would fail under long-running conversion tasks and Vercel timeout constraints.
  - In-memory processing is not appropriate for durable or restartable jobs.

### 10. Vercel constraints and long-running processing

- Decision: Keep the web app on Vercel, but move CPU-intensive tasks to a separate processing mechanism when needed, such as background workers, a queue-backed processor, or a dedicated compute service for FFmpeg jobs.
- Rationale: Ordinary serverless request handlers are not the correct place for long-running CPU-intensive audio conversion when the processing may exceed request time limits or create cold-start concerns.
- Alternatives considered: Running all conversion inside request handlers and assuming short-lived functions are adequate.
  - This violates the product requirement to keep interactive workloads separate from long-running processing and would make the system unreliable at scale.

## Key Technical Risks

### Risk 1: Browser audio compatibility and performance

- Problem: Different browsers have different codec and media-decoding capabilities, and heavy waveform analysis can stall the UI.
- Mitigation: Limit browser-side processing to common formats, use efficient canvas rendering, and offload heavy encode/render work to FFmpeg.

### Risk 2: Large-file handling and memory pressure

- Problem: Large waveform generation, decoding, and previewing can create CPU and memory spikes.
- Mitigation: Downsample waveforms for display, limit preview generation resolution, and enforce upload limits and duration ceilings.

### Risk 3: Vercel execution limits

- Problem: Long-running FFmpeg jobs may exceed serverless time limits or unstable concurrency.
- Mitigation: Treat export and conversion as queued background jobs and prefer a separate worker or dedicated processing environment when job duration becomes significant.

### Risk 4: Audio conversion fidelity and format support

- Problem: Different formats have different codec constraints, bitrate behavior, and compatibility issues.
- Mitigation: Validate supported formats and output settings upfront; choose safe defaults; expose only the quality options appropriate for each format.

### Risk 5: File validation and malicious inputs

- Problem: Uploaded files may be malformed, enormous, or intentionally hostile.
- Mitigation: Validate MIME type, inspect file signatures, run ffprobe checks, enforce size limits, and sanitize object access and cleanup flows.

## Research Findings Against Product Requirements

- The product requirement that editing remains responsive during normal use supports browser-side playback and preview logic.
- The requirement that long-running processing should not block interactive flows supports a separate final rendering pipeline.
- The requirement that files be treated as untrusted input requires upload validation and access control.
- The requirement that the architecture be simple enough for MVP but scalable later supports a layered design where the UI remains simple and the processing layer can be isolated later if usage grows.
- The requirement that the product support Vercel and Blob strongly favors signed direct uploads and server-side orchestration rather than app-server relay paths.

## Open Design Decisions Still Requiring Validation During Implementation

- Final supported formats will be confirmed during implementation planning and tested against the chosen FFmpeg configuration.
- Exact job queue mechanism will depend on the final deployment topology and Vercel limits, but a worker-backed pipeline is the preferred architecture.
- The maximum acceptable file size and duration will be set as environment-configured limits based on product and cost constraints.
- The exact progress signal format between the server and frontend will be defined as a lightweight JSON status model, not as ad hoc polling objects.
