#!/bin/sh
set -e

echo "Starting MongoDB..."
mongod --dbpath /data/db --logpath /var/log/mongod.log --fork

echo "Waiting for MongoDB at ${MONGO_HOST}:${MONGO_PORT}..."
until mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
  sleep 1
done
echo "MongoDB is ready."

node scripts/import.mjs
exec node dist/main.js
