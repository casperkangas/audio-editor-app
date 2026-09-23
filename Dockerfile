FROM node:20-bullseye-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

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
