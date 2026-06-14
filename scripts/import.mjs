import { readdir, readFile } from 'fs/promises';
import { MongoClient } from 'mongodb';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const IMPORT_DIR = join(__dirname, '..', 'import');
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://root:root@localhost:27017/?authSource=admin';
const DB_NAME = process.env.MONGO_DB ?? 'local';

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
      const collectionName = basename(file, '.json');
      const raw = await readFile(join(IMPORT_DIR, file), 'utf8');
      const data = JSON.parse(raw);
      const docs = Array.isArray(data) ? data : [data];

      const result = await db.collection(collectionName).insertMany(docs);
      console.log(`✓ ${collectionName}: inserted ${result.insertedCount} document(s)`);
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
