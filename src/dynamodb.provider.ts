import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Db, MongoClient } from 'mongodb';
import { ConfigService } from './config.service.js';
import type { CreateTableInput } from './dynamodb.types.js';
import { validateCreateTable } from './validation-request/create-table.js';
import { validateDescribeTable } from './validation-request/describe-table.js';
import { parseListTables } from './validation-request/list-tables.js';

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
