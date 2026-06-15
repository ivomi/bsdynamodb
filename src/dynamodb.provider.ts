import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { BillingMode, TableClass, TableDescription } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';
import { Db, MongoClient } from 'mongodb';
import { ConfigService } from './config.service.js';
import type {
  CreateTableInput,
  DeleteItemInput,
  GetItemInput,
  GlobalSecondaryIndexUpdate,
  PutItemInput,
  UpdateItemInput,
  UpdateTableInput,
} from './dynamodb.types.js';
import { buildKeyFilter } from './helpers/build-key-filter.js';
import { marshalItem } from './helpers/marshal-item.js';
import { parseUpdateExpression } from './helpers/parse-update-expression.js';
import { stripId } from './helpers/strip-id.js';
import { unmarshalItem } from './helpers/unmarshal-item.js';
import { unmarshalValue } from './helpers/unmarshal-value.js';
import { validateCreateTable } from './validation-request/create-table.js';
import { validateDeleteItem } from './validation-request/delete-item.js';
import { validateGetItem } from './validation-request/get-item.js';
import { validateDeleteTable } from './validation-request/delete-table.js';
import { validateDescribeTable } from './validation-request/describe-table.js';
import { parseListTables } from './validation-request/list-tables.js';
import { validatePutItem } from './validation-request/put-item.js';
import { validateUpdateItem } from './validation-request/update-item.js';
import { validateUpdateTable } from './validation-request/update-table.js';

@Injectable()
export class DynamodbProvider implements OnModuleInit, OnModuleDestroy {
  private client!: MongoClient;
  private db!: Db;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const uri = this.config.get('MONGO_URI')!;
    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(this.config.get('MONGO_DB'));
  }

  async onModuleDestroy() {
    await this.client.close();
  }

  async createTable(body: Record<string, unknown>) {
    await validateCreateTable(body, this.db.collection('_tables'));

    const input = body as unknown as CreateTableInput;
    const tableName = input.TableName;
    const billingMode = input.BillingMode ?? 'PROVISIONED';

    const tableDoc: TableDescription = {
      TableName: tableName,
      TableId: randomUUID(),
      TableArn: `arn:aws:dynamodb:us-east-1:000000000000:table/${tableName}`,
      TableStatus: 'ACTIVE',
      CreationDateTime: (Date.now() / 1000) as unknown as Date,
      TableSizeBytes: 0,
      ItemCount: 0,
      KeySchema: input.KeySchema as TableDescription['KeySchema'],
      AttributeDefinitions: input.AttributeDefinitions as TableDescription['AttributeDefinitions'],
      BillingModeSummary: { BillingMode: billingMode as BillingMode },
    };

    if (billingMode === 'PROVISIONED' && input.ProvisionedThroughput != null) {
      tableDoc.ProvisionedThroughput = {
        ReadCapacityUnits: input.ProvisionedThroughput.ReadCapacityUnits,
        WriteCapacityUnits: input.ProvisionedThroughput.WriteCapacityUnits,
        NumberOfDecreasesToday: 0,
      };
    }
    if (input.GlobalSecondaryIndexes != null) {
      tableDoc.GlobalSecondaryIndexes = input.GlobalSecondaryIndexes as TableDescription['GlobalSecondaryIndexes'];
    }
    if (input.LocalSecondaryIndexes != null) {
      tableDoc.LocalSecondaryIndexes = input.LocalSecondaryIndexes as TableDescription['LocalSecondaryIndexes'];
    }
    if (input.TableClass != null) {
      tableDoc.TableClassSummary = { TableClass: input.TableClass as TableClass };
    }
    if (input.StreamSpecification != null) {
      tableDoc.StreamSpecification = input.StreamSpecification as TableDescription['StreamSpecification'];
    }

    await this.db.collection('_tables').insertOne(tableDoc as unknown as Record<string, unknown>);
    await this.db.createCollection(tableName);

    return { TableDescription: tableDoc };
  }

  async listTables(
    body: Record<string, unknown>,
  ): Promise<{ TableNames: string[]; LastEvaluatedTableName?: string }> {
    const { start, limit = 100 } = parseListTables(body);
    const filter = start != null ? { TableName: { $gt: start } } : {};
    const docs = await this.db
      .collection('_tables')
      .find(filter)
      .sort({ TableName: 1 })
      .limit(limit + 1)
      .toArray();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const tableNames = page.map((d) => String(d['TableName']));

    return {
      TableNames: tableNames,
      ...(hasMore ? { LastEvaluatedTableName: tableNames[tableNames.length - 1] } : {}),
    };
  }

  async updateTable(body: Record<string, unknown>) {
    const tableName = validateUpdateTable(body);
    const doc = await this.db.collection('_tables').findOne({ TableName: tableName });
    if (doc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const input = body as unknown as UpdateTableInput;
    const update: Record<string, unknown> = {};

    if (input.BillingMode != null) {
      update['BillingModeSummary.BillingMode'] = input.BillingMode;
    }
    if (input.ProvisionedThroughput != null) {
      update['ProvisionedThroughput'] = {
        ReadCapacityUnits: input.ProvisionedThroughput.ReadCapacityUnits,
        WriteCapacityUnits: input.ProvisionedThroughput.WriteCapacityUnits,
        NumberOfDecreasesToday: 0,
      };
    }
    if (input.StreamSpecification != null) {
      update['StreamSpecification'] = input.StreamSpecification;
    }
    if (input.SSESpecification != null) {
      update['SSESpecification'] = input.SSESpecification;
    }
    if (input.TableClass != null) {
      update['TableClassSummary'] = { TableClass: input.TableClass };
    }
    if (input.AttributeDefinitions != null) {
      update['AttributeDefinitions'] = input.AttributeDefinitions;
    }

    let gsiList: unknown[] = Array.isArray(doc['GlobalSecondaryIndexes'])
      ? (doc['GlobalSecondaryIndexes'] as unknown[])
      : [];

    if (input.GlobalSecondaryIndexUpdates != null) {
      for (const gsiUpdate of input.GlobalSecondaryIndexUpdates as GlobalSecondaryIndexUpdate[]) {
        if (gsiUpdate.Create != null) {
          gsiList = [...gsiList, gsiUpdate.Create];
        } else if (gsiUpdate.Delete != null) {
          const indexName = gsiUpdate.Delete.IndexName;
          gsiList = gsiList.filter(
            (g) => (g as Record<string, unknown>)['IndexName'] !== indexName,
          );
        } else if (gsiUpdate.Update != null) {
          const { IndexName, ProvisionedThroughput } = gsiUpdate.Update;
          gsiList = gsiList.map((g) => {
            const gsiDoc = g as Record<string, unknown>;
            return gsiDoc['IndexName'] === IndexName
              ? { ...gsiDoc, ProvisionedThroughput }
              : gsiDoc;
          });
        }
      }
      update['GlobalSecondaryIndexes'] = gsiList;
    }

    await this.db.collection('_tables').updateOne({ TableName: tableName }, { $set: update });

    const updated = await this.db
      .collection('_tables')
      .findOne({ TableName: tableName }, { projection: { _id: 0 } });

    return { TableDescription: updated as unknown as TableDescription };
  }

  async deleteTable(body: Record<string, unknown>) {
    const tableName = validateDeleteTable(body);
    const doc = await this.db
      .collection('_tables')
      .findOne({ TableName: tableName }, { projection: { _id: 0 } });
    if (doc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.db.collection('_tables').deleteOne({ TableName: tableName });
    await this.db.dropCollection(tableName);

    const tableDescription: TableDescription = {
      ...(doc as unknown as TableDescription),
      TableStatus: 'DELETING',
    };

    return { TableDescription: tableDescription };
  }

  async putItem(body: Record<string, unknown>) {
    const tableName = validatePutItem(body);
    const tableDoc = await this.db.collection('_tables').findOne({ TableName: tableName });
    if (tableDoc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const input = body as unknown as PutItemInput;
    const keySchema = tableDoc['KeySchema'] as Array<{ AttributeName: string }>;
    const filter = buildKeyFilter(keySchema, input.Item as Record<string, unknown>);
    const stored = unmarshalItem(input.Item as Record<string, unknown>);

    let oldItem: Record<string, unknown> | null = null;
    if (input.ReturnValues === 'ALL_OLD') {
      oldItem = await this.db.collection(tableName).findOne(filter);
    }

    await this.db.collection(tableName).replaceOne(filter, stored, { upsert: true });

    if (input.ReturnValues === 'ALL_OLD' && oldItem != null) {
      return { Attributes: marshalItem(stripId(oldItem)) };
    }
    return {};
  }

  async getItem(body: Record<string, unknown>) {
    const tableName = validateGetItem(body);
    const tableDoc = await this.db.collection('_tables').findOne({ TableName: tableName });
    if (tableDoc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const input = body as unknown as GetItemInput;
    const keySchema = tableDoc['KeySchema'] as Array<{ AttributeName: string }>;
    const filter = buildKeyFilter(keySchema, input.Key as Record<string, unknown>);

    const doc = await this.db.collection(tableName).findOne(filter);
    if (doc == null) {
      return {};
    }

    return { Item: marshalItem(stripId(doc)) };
  }

  async deleteItem(body: Record<string, unknown>) {
    const tableName = validateDeleteItem(body);
    const tableDoc = await this.db.collection('_tables').findOne({ TableName: tableName });
    if (tableDoc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const input = body as unknown as DeleteItemInput;
    const key = input.Key as Record<string, unknown>;
    const keySchema = tableDoc['KeySchema'] as Array<{ AttributeName: string }>;
    const filter = buildKeyFilter(keySchema, key);

    let oldItem: Record<string, unknown> | null = null;
    if (input.ReturnValues === 'ALL_OLD') {
      oldItem = await this.db.collection(tableName).findOne(filter);
    }

    await this.db.collection(tableName).deleteOne(filter);

    if (input.ReturnValues === 'ALL_OLD' && oldItem != null) {
      return { Attributes: marshalItem(stripId(oldItem)) };
    }
    return {};
  }

  async updateItem(body: Record<string, unknown>) {
    const tableName = validateUpdateItem(body);
    const tableDoc = await this.db.collection('_tables').findOne({ TableName: tableName });
    if (tableDoc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const input = body as unknown as UpdateItemInput;
    const key = input.Key as Record<string, unknown>;
    const keySchema = tableDoc['KeySchema'] as Array<{ AttributeName: string }>;
    const filter = buildKeyFilter(keySchema, key);

    const existing = await this.db.collection(tableName).findOne(filter);
    if (existing == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Item not found in table: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, unknown> = {};

    if (input.AttributeUpdates != null) {
      for (const [attr, update] of Object.entries(input.AttributeUpdates)) {
        if ((update.Action === 'PUT' || update.Action === 'ADD') && update.Value != null) {
          $set[attr] = unmarshalValue(update.Value);
        } else if (update.Action === 'DELETE') {
          $unset[attr] = '';
        }
      }
    } else if (input.UpdateExpression != null) {
      const names = input.ExpressionAttributeNames ?? {};
      const rawValues = (input.ExpressionAttributeValues ?? {}) as Record<string, unknown>;
      const values = Object.fromEntries(
        Object.entries(rawValues).map(([k, v]) => [k, unmarshalValue(v)]),
      );
      parseUpdateExpression(input.UpdateExpression, names, values, $set, $unset);
    }

    const mongoUpdate: Record<string, unknown> = {};
    if (Object.keys($set).length > 0) mongoUpdate['$set'] = $set;
    if (Object.keys($unset).length > 0) mongoUpdate['$unset'] = $unset;

    const oldItem = { ...existing };

    if (Object.keys(mongoUpdate).length > 0) {
      await this.db.collection(tableName).updateOne(filter, mongoUpdate);
    }

    const returnValues = input.ReturnValues ?? 'NONE';
    if (returnValues === 'NONE') return {};

    if (returnValues === 'ALL_OLD') {
      return { Attributes: marshalItem(stripId(oldItem)) };
    }

    const updated = await this.db.collection(tableName).findOne(filter);
    if (updated == null) return {};
    const updatedAttrs = stripId(updated);

    if (returnValues === 'ALL_NEW') {
      return { Attributes: marshalItem(updatedAttrs) };
    }
    if (returnValues === 'UPDATED_NEW') {
      const changedKeys = [...Object.keys($set), ...Object.keys($unset)];
      return {
        Attributes: marshalItem(
          Object.fromEntries(
            changedKeys.filter((k) => k in updatedAttrs).map((k) => [k, updatedAttrs[k]]),
          ),
        ),
      };
    }
    if (returnValues === 'UPDATED_OLD') {
      const changedKeys = [...Object.keys($set), ...Object.keys($unset)];
      const oldAttrs = stripId(oldItem);
      return {
        Attributes: marshalItem(
          Object.fromEntries(changedKeys.filter((k) => k in oldAttrs).map((k) => [k, oldAttrs[k]])),
        ),
      };
    }
    return {};
  }

  async describeTable(body: Record<string, unknown>) {
    const tableName = validateDescribeTable(body);
    const doc = await this.db
      .collection('_tables')
      .findOne({ TableName: tableName }, { projection: { _id: 0 } });
    if (doc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }
    return { Table: doc as unknown as TableDescription };
  }
}
