# bsdynamodb

A DynamoDB-compatible HTTP server backed by MongoDB, for local development and testing. It speaks the DynamoDB JSON protocol (`X-Amz-Target: DynamoDB_20120810.*`), so the AWS SDKs, the AWS CLI and `dynamodb-admin` work against it unchanged.

Built with NestJS on Node.js 24. Tables are stored as MongoDB collections, and table definitions live in the `_tables` collection.

## Run with Docker

The published image bundles MongoDB and the server in one container:

```sh
docker run -d -p 8000:8000 -v bsdynamodb-data:/data/db imis/bsdynamodb
```

See [DOCKERHUB.md](DOCKERHUB.md) (also shown on [Docker Hub](https://hub.docker.com/r/imis/bsdynamodb)) for volumes, seeding and environment variables.

## Local development

Requirements: Node.js 24, npm 11 and Docker (for MongoDB).

```sh
npm ci
docker compose up -d     # MongoDB on localhost:27017 (root / root)
npm run start:dev        # server on http://localhost:8000, restarts on changes
```

Point a client at it:

```sh
aws dynamodb list-tables --endpoint-url http://localhost:8000 --region us-east-1
npm run start:admin      # dynamodb-admin web UI on http://localhost:8001
```

### Configuration

| Variable            | Default                               | Description                                              |
| ------------------- | ------------------------------------- | -------------------------------------------------------- |
| `DYNAMODB_PORT`     | `8000`                                | Port the server listens on.                              |
| `DYNAMODB_HOSTNAME` | `localhost` (`0.0.0.0` in Docker)     | Interface the server binds to.                           |
| `MONGO_URI`         | `mongodb://root:root@localhost:27017` | MongoDB connection string; matches `docker-compose.yml`. |
| `MONGO_DB`          | `local`                               | Database that holds the tables.                          |

### Seed data

Put `<collection>.json` files in [import/](import/) (contents are git-ignored) and run:

```sh
npm run import
```

Each file is inserted into the collection of the same name: `_tables.json` for table definitions, `<TableName>.json` for items as plain JSON. Imported files are recorded in `_imports` and skipped on later runs; delete an entry there to import a file again. A file that fails to import is logged and skipped.

## Scripts

| Script                                         | What it does                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run start:dev`                            | Run the server in watch mode.                                                     |
| `npm run build` / `npm start`                  | Compile to `dist/` / run the compiled server.                                     |
| `npm test`                                     | Run the unit tests (Vitest). `test:watch` and `test:coverage` are also available. |
| `npm run lint` / `npm run format`              | ESLint / Prettier.                                                                |
| `npm run import`                               | Load seed data from `import/`.                                                    |
| `npm run start:admin`                          | Start `dynamodb-admin`.                                                           |
| `npm run docker:build` / `npm run docker:push` | Build / push `imis/bsdynamodb:<version>` and `:latest`.                           |

## Supported operations

| Tables        | Items      | Batch          | Other                     |
| ------------- | ---------- | -------------- | ------------------------- |
| CreateTable   | PutItem    | BatchGetItem   | DescribeTimeToLive        |
| DescribeTable | GetItem    | BatchWriteItem | DescribeContinuousBackups |
| UpdateTable   | UpdateItem |                | UpdateContinuousBackups   |
| DeleteTable   | DeleteItem |                |                           |
| ListTables    | Query      |                |                           |
|               | Scan       |                |                           |

Expressions support `=`, `<>`, `<`, `<=`, `>`, `>=`, `BETWEEN`, `IN`, `AND`, `OR`, `NOT` and the functions `attribute_exists`, `attribute_not_exists`, `attribute_type`, `begins_with`, `contains` and `size`.

## Project layout

```
src/
  main.ts                  bootstrap; parses application/x-amz-json-1.0 bodies
  dynamodb.controller.ts   single POST / endpoint, routes on X-Amz-Target
  dynamodb.provider.ts     operation implementations on top of MongoDB
  validation-request/      request validation, one file per operation
  helpers/                 (un)marshalling and expression parsing
scripts/import.mjs         seed data importer
Dockerfile, entrypoint.sh  all-in-one image (MongoDB + server)
```

### Adding an operation

1. Add a validator in `src/validation-request/<operation>.ts` with a spec next to it.
2. Implement the operation in `DynamodbProvider`.
3. Route its `X-Amz-Target` in `DynamodbController`.
4. Add it to the operation tables in this README and in `DOCKERHUB.md`.

## Releasing

```sh
npm version patch --no-git-tag-version   # or minor / major; commit via a PR
npm run docker:build
npm run docker:push                      # requires: docker login -u imis
```

After the PR is merged, tag the merge commit on `main` (`git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z`).

## License

[MIT](LICENSE)
