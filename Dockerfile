FROM node:24-alpine AS builder
WORKDIR /app
COPY .npmrc package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM mongo:8.0 AS production
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY .npmrc package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY scripts ./scripts
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

VOLUME ["/data/db", "/app/import"]

EXPOSE 8000

ENV DYNAMODB_HOSTNAME=0.0.0.0
ENV DYNAMODB_PORT=8000
ENV MONGO_URI=mongodb://localhost:27017
ENV MONGO_DB=local
ENV MONGO_HOST=localhost
ENV MONGO_PORT=27017

ENTRYPOINT ["./entrypoint.sh"]
