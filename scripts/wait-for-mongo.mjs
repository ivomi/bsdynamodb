import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017';

// Pings MongoDB until it answers, so the entrypoint does not need mongosh.
for (;;) {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 1000 });
  try {
    await client.db('admin').command({ ping: 1 });
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } finally {
    await client.close();
  }
}
