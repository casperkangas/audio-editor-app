# Web Audio Editor and Converter

A browser-based audio editing and conversion tool that lets users upload, edit, and export audio files without desktop software. Users can trim, cut, split, adjust volume, and apply fades to a single audio track, then preview and download the result — optionally converting to a different format such as MP3, WAV, FLAC, OGG, or AAC.

Editing is non-destructive and runs entirely in the browser. Final rendering and format conversion are handled server-side via FFmpeg as background jobs, keeping the editor responsive at all times.

## Team

- Jonas
- Tomas
- Casper
- Paul-Henrik

## Structure of the repository

```
swcon2627/
├── .gitlab/                      # GitLab CI configuration and pipeline stages
├── .github/
│   └── skills/                   # AI workflow and specification skills
│       ├── speckit-analyze/
│       ├── speckit-checklist/
│       ├── speckit-clarify/
│       ├── speckit-constitution/
│       ├── speckit-converge/
│       ├── speckit-implement/
│       ├── speckit-plan/
│       ├── speckit-specify/
│       ├── speckit-tasks/
│       └── speckit-taskstoissues/
├── .specify/                     # Spec workflow configuration and templates
│   ├── integrations/
│   ├── memory/
│   ├── scripts/
│   ├── templates/
│   ├── workflows/
│   ├── .gitignore
│   ├── init-options.json
│   └── integration.json
├── apps/
│   └── web/                      # Vite + React app and API surface
│       ├── api/
│       │   ├── _lib/
│       │   ├── jobs/
│       │   ├── exports.ts
│       │   ├── upload.ts
│       │   └── upload.validation.ts
│       ├── public/
│       ├── src/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── lib/
│       │   ├── types/
│       │   └── ...
│       ├── tests/
│       │   ├── contract/
│       │   ├── unit/
│       │   └── setup.ts
│       ├── .gitignore
│       ├── eslint.config.js
│       ├── index.html
│       ├── package.json
│       ├── package-lock.json
│       ├── README.md
│       ├── tsconfig.app.json
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       └── vite.config.ts
├── sample-sounds/                # Test and demo audio fixtures
├── specs/
│   └── 001-audio-editor-converter/
│       ├── checklists/
│       ├── contracts/
│       ├── data-model.md
│       ├── plan.md
│       ├── quickstart.md
│       ├── research.md
│       ├── spec.md
│       └── tasks.md
├── workers/
│   └── audio-export/
│       ├── cleanup.ts
│       ├── ffmpeg.ts
│       ├── render-plan.ts
│       └── worker.ts
├── README.md
└── .gitignore
```