# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Audio uploads

The Vercel API route at `/api/upload` creates restricted client-upload tokens
for Vercel Blob. The browser should use `upload()` from `@vercel/blob/client`
with `handleUploadUrl: "/api/upload"`; the audio bytes go directly to Blob
after the route validates the filename, content type, and size.

Configure the server-only `BLOB_READ_WRITE_TOKEN` in Vercel (or through the
Vercel CLI for local API testing). Never prefix this variable with `VITE_` or
read it from frontend code. The optional `AUDIO_UPLOAD_MAX_SIZE_BYTES`
environment variable controls the limit and defaults to 50 MiB.

## Audio export infrastructure variables

The export API and background worker use the following server-only variables. Keep
all of them out of `apps/web/src/`, browser bundles, and any variable prefixed with
`VITE_`.

| Variable                         | Used by                      | Purpose                                                               |
| -------------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `BLOB_READ_WRITE_TOKEN`          | Vercel API and export worker | Read/write private source and generated audio objects in Vercel Blob. |
| `AUDIO_UPLOAD_MAX_SIZE_BYTES`    | Upload API                   | Maximum upload size; defaults to 50 MiB when unset or invalid.        |
| `JOB_STORE_URL`                  | API and export worker        | Connection endpoint for durable export-job metadata and status.       |
| `JOB_STORE_TOKEN`                | API and export worker        | Server credential for the durable job store.                          |
| `EXPORT_QUEUE_URL`               | Export API and worker        | Queue or dispatch endpoint for job IDs.                               |
| `EXPORT_QUEUE_TOKEN`             | Export API and worker        | Server credential for queue dispatch/consumption.                     |
| `AUDIO_SOURCE_RETENTION_SECONDS` | Cleanup process              | Retention window for private source objects.                          |
| `AUDIO_OUTPUT_RETENTION_SECONDS` | Cleanup process              | Retention window for generated output objects and metadata.           |

The job-store and queue variables are reserved for the provider selected during
implementation. Do not commit their values or add them to client-visible configuration.

### Vercel and Vercel Blob setup required outside the repository

Before testing the API against deployed infrastructure, Casper must complete these
dashboard or CLI actions:

1. Create or select a Vercel Blob store and copy its read/write token into the
   server-only `BLOB_READ_WRITE_TOKEN` variable for the required environments.
2. Add the job-store and queue provider credentials as server-only Vercel environment
   variables after selecting those providers.
3. Configure the retention variables and upload limit per environment, then redeploy
   so changed environment variables are available to API functions.
4. Configure the external audio-export worker with the same Blob token, job-store
   credentials, queue credentials, and access to FFmpeg/ffprobe.

The repository does not create Blob stores, provision queue/job-store providers, or
run FFmpeg. Those are deployment and infrastructure operations outside this codebase.

Use `npx vercel dev` when testing the frontend and `/api/upload` together.

# NB: Deployment to Vercel

When changes are made, remember to deploy to Vercel in the following way:

```
cd apps/web
npm run build
npx vercel --prod
```

# NB: Testing during development

Use `npm run dev` in `apps/web` for frontend-only work. Use `npx vercel dev` in `apps/web` when testing frontend + API + Blob together.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
