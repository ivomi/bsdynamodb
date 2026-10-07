#!/bin/sh
# Runs as PID 1: forwards stop signals to the Node process and shuts MongoDB down cleanly.

DBPATH=/data/db
CHILD_PID=

shutdown() {
  echo "Shutting down..."
  if [ -n "$CHILD_PID" ]; then
    kill -TERM "$CHILD_PID" 2>/dev/null
    wait "$CHILD_PID" 2>/dev/null
  fi
  mongod --dbpath "$DBPATH" --shutdown > /dev/null 2>&1
  exit "$1"
}

trap 'shutdown 143' TERM
trap 'shutdown 130' INT

# Runs a command in the background and waits for it, so the traps fire while it runs.
run() {
  "$@" &
  CHILD_PID=$!
  wait "$CHILD_PID"
  status=$?
  CHILD_PID=
  return "$status"
}

echo "Starting MongoDB..."
mongod --dbpath "$DBPATH" --logpath /var/log/mongod.log --fork || exit 1

echo "Waiting for MongoDB at ${MONGO_HOST}:${MONGO_PORT}..."
until mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
  sleep 1
done
echo "MongoDB is ready."

run node scripts/import.mjs || shutdown $?
run node dist/main.js
shutdown $?
