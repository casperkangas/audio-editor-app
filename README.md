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
├── .github/
│   └── skills/                   # Skillset for AI tools
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
├── .specify/                     # Specify configuration (TODO: explain)
│   ├── integrations/
│   ├── memory/
│   ├── scripts/
│   ├── templates/
│   ├── workflows/
│   ├── .gitignore
│   ├── init-options.json
│   └── integration.json
├── apps/
│   └── web/                      # Website source & unit tests
│       ├── public/
│       ├── src/
│       ├── tests/
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
├── sample-sounds/                # Sample audio files, mainly for tests
├── specs/                        # Documentation
│   ├── checklists/
│   ├── contracts/
│   ├── data-model.md
│   ├── plan.md
│   ├── quickstart.md
│   ├── research.md
│   └── spec.md
└── README.md
```