import { readdir, readFile } from 'fs/promises';
import { MongoClient, ObjectId } from 'mongodb';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const IMPORT_DIR = join(__dirname, '..', 'import');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://root:root@localhost:27017/?authSource=admin';
const DB_NAME = process.env.MONGO_DB ?? 'local';
// Tracks imported files so that restarts with a persistent database do not import them again.
const IMPORTS_COLLECTION = '_imports';

async function importFile(db, file) {
  const imports = db.collection(IMPORTS_COLLECTION);
  const collectionName = basename(file, '.json');
  const marker = await imports.findOne({ _id: file });

  if (marker?.status === 'done') {
    console.log(`- ${collectionName}: already imported, skipping`);
    return;
  }

  // A previous run stopped partway through this file: remove what it inserted before retrying.
  if (marker?.status === 'pending') {
    const { deletedCount } = await db.collection(collectionName).deleteMany({ _id: { $in: marker.ids } });
    console.log(`- ${collectionName}: removed ${deletedCount} document(s) from an incomplete import`);
  }

  const raw = await readFile(join(IMPORT_DIR, file), 'utf8');
  const data = JSON.parse(raw);
  // Ids are assigned up front so an interrupted import can be rolled back on the next start.
  const docs = (Array.isArray(data) ? data : [data]).map((doc) => ({ _id: new ObjectId(), ...doc }));

  await imports.replaceOne(
    { _id: file },
    { status: 'pending', ids: docs.map((doc) => doc._id) },
    { upsert: true },
  );
  const result = await db.collection(collectionName).insertMany(docs);
  await imports.replaceOne({ _id: file }, { status: 'done', importedAt: new Date() });

  console.log(`✓ ${collectionName}: inserted ${result.insertedCount} document(s)`);
}

async function main() {
  const files = (await readdir(IMPORT_DIR)).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('No JSON files found in import/');
    return;
  }

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  try {
    for (const file of files) {
      await importFile(db, file);
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
