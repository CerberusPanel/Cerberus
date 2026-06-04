FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
