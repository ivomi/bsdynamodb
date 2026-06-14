import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Db, MongoClient } from 'mongodb';
import { ConfigService } from './config.service.js';
import type {
  CreateTableInput,
  DeleteItemInput,
  GlobalSecondaryIndexUpdate,
  PutItemInput,
  UpdateItemInput,
  UpdateTableInput,
} from './dynamodb.types.js';
import { validateCreateTable } from './validation-request/create-table.js';
import { validateDeleteItem } from './validation-request/delete-item.js';
import { validateDeleteTable } from './validation-request/delete-table.js';
import { validateDescribeTable } from './validation-request/describe-table.js';
import { parseListTables } from './validation-request/list-tables.js';
import { validatePutItem } from './validation-request/put-item.js';
import { validateUpdateItem } from './validation-request/update-item.js';
import { validateUpdateTable } from './validation-request/update-table.js';
import { buildKeyFilter } from './helpers/build-key-filter.js';
import { marshalItem } from './helpers/marshal-item.js';
import { parseUpdateExpression } from './helpers/parse-update-expression.js';
import { stripId } from './helpers/strip-id.js';
import { unmarshalItem } from './helpers/unmarshal-item.js';
import { unmarshalValue } from './helpers/unmarshal-value.js';

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
    const tableId = randomUUID();
    const tableArn = `arn:aws:dynamodb:us-east-1:000000000000:table/${tableName}`;
    const creationDateTime = Date.now() / 1000;

    const tableDoc = {
      name: tableName,
      tableId,
      tableArn,
      tableStatus: 'ACTIVE',
      creationDateTime,
      keySchema: input.KeySchema,
      attributeDefinitions: input.AttributeDefinitions,
      billingMode,
      provisionedThroughput: input.ProvisionedThroughput,
      globalSecondaryIndexes: input.GlobalSecondaryIndexes,
      localSecondaryIndexes: input.LocalSecondaryIndexes,
      tableClass: input.TableClass,
      sseSpecification: input.SSESpecification,
      streamSpecification: input.StreamSpecification,
    };

    await this.db.collection('_tables').insertOne(tableDoc);
    await this.db.createCollection(tableName);

    const description: Record<string, unknown> = {
      TableName: tableName,
      TableStatus: 'ACTIVE',
      CreationDateTime: creationDateTime,
      TableSizeBytes: 0,
      ItemCount: 0,
      TableArn: tableArn,
      TableId: tableId,
      KeySchema: input.KeySchema,
      AttributeDefinitions: input.AttributeDefinitions,
      BillingModeSummary: { BillingMode: billingMode },
    };

    if (billingMode === 'PROVISIONED' && input.ProvisionedThroughput != null) {
      description['ProvisionedThroughput'] = {
        ReadCapacityUnits: input.ProvisionedThroughput.ReadCapacityUnits,
        WriteCapacityUnits: input.ProvisionedThroughput.WriteCapacityUnits,
        NumberOfDecreasesToday: 0,
      };
    }
    if (input.GlobalSecondaryIndexes != null) {
      description['GlobalSecondaryIndexes'] = input.GlobalSecondaryIndexes;
    }
    if (input.LocalSecondaryIndexes != null) {
      description['LocalSecondaryIndexes'] = input.LocalSecondaryIndexes;
    }
    if (input.TableClass != null) {
      description['TableClassSummary'] = { TableClass: input.TableClass };
    }
    if (input.StreamSpecification != null) {
      description['StreamSpecification'] = input.StreamSpecification;
    }

    return { TableDescription: description };
  }

  async listTables(
    body: Record<string, unknown>,
  ): Promise<{ TableNames: string[]; LastEvaluatedTableName?: string }> {
    const { start, limit = 100 } = parseListTables(body);
    const filter = start != null ? { name: { $gt: start } } : {};
    const docs = await this.db
      .collection('_tables')
      .find(filter)
      .sort({ name: 1 })
      .limit(limit + 1)
      .toArray();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const tableNames = page.map((d) => String(d['name']));

    return {
      TableNames: tableNames,
      ...(hasMore ? { LastEvaluatedTableName: tableNames[tableNames.length - 1] } : {}),
    };
  }

  async updateTable(body: Record<string, unknown>) {
    const tableName = validateUpdateTable(body);
    const doc = await this.db.collection('_tables').findOne({ name: tableName });
    if (doc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const input = body as unknown as UpdateTableInput;
    const update: Record<string, unknown> = {};

    if (input.BillingMode != null) {
      update['billingMode'] = input.BillingMode;
    }
    if (input.ProvisionedThroughput != null) {
      update['provisionedThroughput'] = input.ProvisionedThroughput;
    }
    if (input.StreamSpecification != null) {
      update['streamSpecification'] = input.StreamSpecification;
    }
    if (input.SSESpecification != null) {
      update['sseSpecification'] = input.SSESpecification;
    }
    if (input.TableClass != null) {
      update['tableClass'] = input.TableClass;
    }
    if (input.AttributeDefinitions != null) {
      update['attributeDefinitions'] = input.AttributeDefinitions;
    }

    let gsiList: unknown[] = Array.isArray(doc['globalSecondaryIndexes'])
      ? (doc['globalSecondaryIndexes'] as unknown[])
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
      update['globalSecondaryIndexes'] = gsiList;
    }

    await this.db.collection('_tables').updateOne({ name: tableName }, { $set: update });

    const updated = { ...doc, ...update };
    const billingMode = (updated['billingMode'] as string | undefined) ?? 'PROVISIONED';

    const description: Record<string, unknown> = {
      TableName: tableName,
      TableStatus: updated['tableStatus'],
      CreationDateTime: updated['creationDateTime'],
      TableSizeBytes: 0,
      ItemCount: 0,
      TableArn: updated['tableArn'],
      TableId: updated['tableId'],
      KeySchema: updated['keySchema'],
      AttributeDefinitions: updated['attributeDefinitions'],
      BillingModeSummary: { BillingMode: billingMode },
    };

    if (billingMode === 'PROVISIONED' && updated['provisionedThroughput'] != null) {
      const pt = updated['provisionedThroughput'] as Record<string, unknown>;
      description['ProvisionedThroughput'] = {
        ReadCapacityUnits: pt['ReadCapacityUnits'],
        WriteCapacityUnits: pt['WriteCapacityUnits'],
        NumberOfDecreasesToday: 0,
      };
    }
    if (gsiList.length > 0) {
      description['GlobalSecondaryIndexes'] = gsiList;
    }
    if (updated['localSecondaryIndexes'] != null) {
      description['LocalSecondaryIndexes'] = updated['localSecondaryIndexes'];
    }
    if (updated['tableClass'] != null) {
      description['TableClassSummary'] = { TableClass: updated['tableClass'] };
    }
    if (updated['streamSpecification'] != null) {
      description['StreamSpecification'] = updated['streamSpecification'];
    }

    return { TableDescription: description };
  }

  async deleteTable(body: Record<string, unknown>) {
    const tableName = validateDeleteTable(body);
    const doc = await this.db.collection('_tables').findOne({ name: tableName });
    if (doc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.db.collection('_tables').deleteOne({ name: tableName });
    await this.db.dropCollection(tableName);

    const billingMode = (doc['billingMode'] as string | undefined) ?? 'PROVISIONED';
    const description: Record<string, unknown> = {
      TableName: tableName,
      TableStatus: 'DELETING',
      CreationDateTime: doc['creationDateTime'],
      TableSizeBytes: 0,
      ItemCount: 0,
      TableArn: doc['tableArn'],
      TableId: doc['tableId'],
      KeySchema: doc['keySchema'],
      AttributeDefinitions: doc['attributeDefinitions'],
      BillingModeSummary: { BillingMode: billingMode },
    };

    if (billingMode === 'PROVISIONED' && doc['provisionedThroughput'] != null) {
      const pt = doc['provisionedThroughput'] as Record<string, unknown>;
      description['ProvisionedThroughput'] = {
        ReadCapacityUnits: pt['ReadCapacityUnits'],
        WriteCapacityUnits: pt['WriteCapacityUnits'],
        NumberOfDecreasesToday: 0,
      };
    }
    if (doc['globalSecondaryIndexes'] != null) {
      description['GlobalSecondaryIndexes'] = doc['globalSecondaryIndexes'];
    }
    if (doc['localSecondaryIndexes'] != null) {
      description['LocalSecondaryIndexes'] = doc['localSecondaryIndexes'];
    }
    if (doc['tableClass'] != null) {
      description['TableClassSummary'] = { TableClass: doc['tableClass'] };
    }
    if (doc['streamSpecification'] != null) {
      description['StreamSpecification'] = doc['streamSpecification'];
    }

    return { TableDescription: description };
  }

  async putItem(body: Record<string, unknown>) {
    const tableName = validatePutItem(body);
    const tableDoc = await this.db.collection('_tables').findOne({ name: tableName });
    if (tableDoc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const input = body as unknown as PutItemInput;
    const keySchema = tableDoc['keySchema'] as Array<{ AttributeName: string }>;
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

  async deleteItem(body: Record<string, unknown>) {
    const tableName = validateDeleteItem(body);
    const tableDoc = await this.db.collection('_tables').findOne({ name: tableName });
    if (tableDoc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const input = body as unknown as DeleteItemInput;
    const key = input.Key as Record<string, unknown>;
    const keySchema = tableDoc['keySchema'] as Array<{ AttributeName: string }>;
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
    const tableDoc = await this.db.collection('_tables').findOne({ name: tableName });
    if (tableDoc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const input = body as unknown as UpdateItemInput;
    const key = input.Key as Record<string, unknown>;
    const keySchema = tableDoc['keySchema'] as Array<{ AttributeName: string }>;
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
          Object.fromEntries(changedKeys.filter((k) => k in updatedAttrs).map((k) => [k, updatedAttrs[k]])),
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
    const doc = await this.db.collection('_tables').findOne({ name: tableName });
    if (doc == null) {
      throw new HttpException(
        { __type: 'ResourceNotFoundException', message: `Table not found: ${tableName}` },
        HttpStatus.BAD_REQUEST,
      );
    }
    return { Table: doc };
  }
}
