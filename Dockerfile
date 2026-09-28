FROM node:20-alpine

# Install ffmpeg using Alpine's package manager
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy the apps/web package files to install dependencies
COPY apps/web/package*.json ./apps/web/
RUN cd apps/web && npm ci

# Copy the rest of the application
COPY . .

# Change to apps/web so npx finds tsx in its node_modules easily
WORKDIR /app/apps/web
ENV NODE_PATH=/app/apps/web/node_modules

# Run the worker
CMD ["npx", "tsx", "../../workers/audio-export/start-worker.ts"]
