# bsdynamodb

A lightweight DynamoDB-compatible server for local development and testing, backed by MongoDB. A single container runs both MongoDB and the API, so all you need is `docker run`.

Point any AWS SDK, the AWS CLI or `dynamodb-admin` at it the same way you would at DynamoDB Local.

## Quick start

```sh
docker run -d --name bsdynamodb -p 8000:8000 -v bsdynamodb-data:/data/db imis/bsdynamodb
```

Check it is up:

```sh
curl http://localhost:8000/
# {"message":"DynamoDB local server is running"}
```

Use it from the AWS CLI:

```sh
aws dynamodb list-tables --endpoint-url http://localhost:8000 --region us-east-1
```

Or from the AWS SDK for JavaScript v3:

```js
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
```

Credentials and region are not checked, but the SDK requires some value.

## Docker Compose

```yaml
services:
  dynamodb:
    image: imis/bsdynamodb:latest
    ports:
      - '8000:8000'
    volumes:
      - dynamodb-data:/data/db
      - ./import:/app/import

volumes:
  dynamodb-data:
```

## Supported operations

| Tables | Items | Batch | Other |
|---|---|---|---|
| CreateTable | PutItem | BatchGetItem | DescribeTimeToLive |
| DescribeTable | GetItem | BatchWriteItem | DescribeContinuousBackups |
| UpdateTable | UpdateItem | | UpdateContinuousBackups |
| DeleteTable | DeleteItem | | |
| ListTables | Query | | |
| | Scan | | |

Filter and condition expressions support `=`, `<>`, `<`, `<=`, `>`, `>=`, `BETWEEN`, `IN`, `AND`, `OR`, `NOT` and the functions `attribute_exists`, `attribute_not_exists`, `attribute_type`, `begins_with`, `contains` and `size`. Operations not in this list are not supported.

## Volumes

| Path | Purpose |
|---|---|
| `/data/db` | MongoDB data. Mount a volume here to keep tables and items between restarts. |
| `/app/import` | Optional seed data. Every `*.json` file here is loaded on startup. |

### Seeding data

On startup, each `<name>.json` file in `/app/import` is inserted into the MongoDB collection `<name>`. A file can contain a single object or an array of objects.

- Items go in a file named after the table, e.g. `Users.json`, written as plain JSON, not in DynamoDB's `{"S": "..."}` attribute format.
- Table definitions are stored in the `_tables` collection, so `_tables.json` can hold `CreateTable`-style definitions (`TableName`, `KeySchema`, `AttributeDefinitions`, ...).

Each file is imported only once per database. Completed imports are recorded in the `_imports` collection, so restarting with a persistent `/data/db` does not insert the seed data again, and an import that was interrupted is rolled back and retried on the next start. To re-import a file, delete its entry from `_imports` or start with an empty volume.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DYNAMODB_PORT` | `8000` | Port the API listens on inside the container. |
| `DYNAMODB_HOSTNAME` | `0.0.0.0` | Interface the API binds to. |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string. |
| `MONGO_DB` | `local` | MongoDB database that holds the tables. |

## Tags

- `latest`: the most recent release
- `1.0.0`: a specific version

Images are built for `linux/amd64`. They are based on `mongo:8.0` with Node.js 24.

## Not intended for production

This image is meant for local development, CI and tests. It has no authentication, no IAM, no streams and no transactions, and it does not reproduce DynamoDB's capacity limits or pricing.
