# Audio Editor App Architecture & Setup

This document outlines the finalized cloud architecture, how to run it locally, and how the external background worker functions.

## 🚀 Live Cloud Architecture

The entire audio editor relies on a heavily decoupled architecture:

1. **Frontend**: Vite + React, hosted on Vercel.
2. **Web API (`/api/*`)**: Vercel Serverless Functions.
3. **Database & Queue**: Upstash Redis (Serverless).
4. **File Storage**: Vercel Blob (Private files).
5. **Worker**: A continuous Node.js background process running on Render.com with FFmpeg installed.

### How an Export Works (End-to-End)

1. **Upload**: User drops a file. Browser uses `@vercel/blob/client` to bypass Vercel server limits and upload directly to Vercel Blob (`audio/source/...`). `upload.ts` instantly logs a `ProjectSession` to Redis with the source blob key and a 7200-second safe duration limit.
2. **Request**: Browser makes a POST to `/api/exports` containing edit instructions.
3. **Queue**: `exports.ts` validates the session, builds a job, inserts it into Redis, and pushes the Job ID to the Redis queue (`audio:export-queue`).
4. **Worker**: The Render background worker instantly detects the queue message, claims a lease on the job, downloads the raw audio from Vercel Blob, probes its _real_ duration using FFprobe, applies the edits with FFmpeg, and uploads the final output to Vercel Blob.
5. **Complete**: The worker marks the job as `succeeded` in Redis and sets `outputBlobKey`.
6. **Download**: The browser (which has been polling `/api/jobs/[jobId]`) sees the success. The API intelligently extracts the original filename, swaps the extension, and generates a presigned URL with `&download=YourOriginalSong.wav` to forcefully trigger a browser download instead of playback.

## 🛠 Running Locally

Because the database and worker are in the cloud, local development is incredibly magical.

**Yes, you can just run `npx vercel dev` locally and the export WILL work!**
When your local server pushes a job to your live Upstash Redis database, your 24/7 Render cloud worker will instantly see it, process it, and hand it back to your local server!

**To test the frontend and API:**

```bash
cd apps/web
npx vercel dev
```

**To test the worker locally on your Mac instead of using Render:**
_(Requires `brew install ffmpeg`)_

```bash
# From the root directory:
NODE_PATH=apps/web/node_modules npx tsx workers/audio-export/start-worker.ts
```

## 🌐 Render Deployment Notes

The worker is deployed as a **Web Service** on Render to utilize the Free tier (which requires an HTTP port).

- `start-worker.ts` includes a dummy HTTP server on `process.env.PORT` to satisfy Render's health checks.
- Render free tier instances "go to sleep" after 15 minutes of inactivity. To bypass this, we use a free **UptimeRobot HTTP(s) Monitor** to ping the `https://audio-editor-app.onrender.com` URL every 10 minutes.
- The `Dockerfile` uses `node:20-alpine` to safely install `ffmpeg` and avoid Ubuntu `apt-get` exit code 100 timeouts.

## 🐛 Key Architectural Fixes Made

- **Redis Variable Normalization**: Consolidated `JOB_STORE_URL` and `EXPORT_QUEUE_URL` into a single, unified `REDIS_URL`.
- **Redis Connection Stability**: Added `.on("error")` event listeners to all Redis clients so Upstash's 60-second idle connection drops no longer crash the API or worker.
- **Webhook Bypass**: Local `npx vercel dev` testing previously failed because Vercel Blob couldn't send webhooks to `localhost`. Moved Redis session creation to `onBeforeGenerateToken` so it works flawlessly on localhost.
- **Source Revision Sync**: `App.tsx` now passes the frontend `editor.sourceRevision + 1` to the API during upload, preventing the backend from instantly rejecting legitimate edits due to a stale revision count.
