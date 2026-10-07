FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY .npmrc package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev && npm cache clean --force

# Collects mongod and the shared libraries it links against (except glibc and the
# C++ runtime, which the Ubuntu base provides), so the full mongo image is not needed.
FROM mongo:8.0 AS mongo
RUN mkdir -p /out/lib && \
    ldd /usr/bin/mongod | awk '/=> \// { print $3 }' | \
      grep -vE '/(libc|libm|libdl|librt|libpthread|libstdc\+\+|libgcc_s)\.so|/ld-linux' | \
      xargs -r -I{} cp -L {} /out/lib/

FROM ubuntu:noble AS production
WORKDIR /app

COPY --from=mongo /usr/bin/mongod /usr/bin/mongod
COPY --from=mongo /out/lib/ /usr/local/lib/
RUN ldconfig && mkdir -p /data/db /app/import

# Only the node binary is needed at runtime: no npm, no apt packages.
COPY --from=builder /usr/local/bin/node /usr/local/bin/node

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY scripts ./scripts
COPY --chmod=755 entrypoint.sh ./

VOLUME ["/data/db", "/app/import"]

EXPOSE 8000

ENV DYNAMODB_HOSTNAME=0.0.0.0
ENV DYNAMODB_PORT=8000
ENV MONGO_URI=mongodb://localhost:27017
ENV MONGO_DB=local
ENV MONGO_HOST=localhost
ENV MONGO_PORT=27017

ENTRYPOINT ["./entrypoint.sh"]
