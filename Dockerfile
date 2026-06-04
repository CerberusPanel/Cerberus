FROM node:22-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build


FROM node:22-bookworm-slim

WORKDIR /app

COPY backend/package*.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --omit=dev

COPY backend/ ./
COPY --from=frontend-build /frontend/dist ./public

EXPOSE 3000

CMD ["npm", "start"]
