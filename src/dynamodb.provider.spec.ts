import { HttpException } from '@nestjs/common';
import type { Db } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from './config.service.js';
import { DynamodbProvider } from './dynamodb.provider.js';

function makeCursorMock(docs: Record<string, unknown>[]) {
  const cursor = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(docs),
  };
  return cursor;
}

function makeCollectionMock(findOneResult: Record<string, unknown> | null, findDocs: Record<string, unknown>[] = []) {
  return {
    findOne: vi.fn().mockResolvedValue(findOneResult),
    insertOne: vi.fn().mockResolvedValue({ insertedId: 'mock-id' }),
    find: vi.fn().mockReturnValue(makeCursorMock(findDocs)),
  };
}

function makeProvider(collectionMock: ReturnType<typeof makeCollectionMock>): DynamodbProvider {
  const config = new ConfigService();
  const provider = new DynamodbProvider(config);
  const db = {
    collection: vi.fn().mockReturnValue(collectionMock),
    createCollection: vi.fn().mockResolvedValue(undefined),
  } as unknown as Db;
  (provider as unknown as Record<string, unknown>)['db'] = db;
  return provider;
}

function getDb(provider: DynamodbProvider): Db {
  return (provider as unknown as Record<string, unknown>)['db'] as Db;
}

const minimalInput: Record<string, unknown> = {
  TableName: 'MyTable',
  KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
};

describe('DynamodbProvider.createTable', () => {
  let col: ReturnType<typeof makeCollectionMock>;
  let provider: DynamodbProvider;

  beforeEach(() => {
    col = makeCollectionMock(null);
    provider = makeProvider(col);
  });

  it('returns TableDescription with ACTIVE status', async () => {
    const result = await provider.createTable({ ...minimalInput });
    expect(result.TableDescription['TableStatus']).toBe('ACTIVE');
    expect(result.TableDescription['TableName']).toBe('MyTable');
  });

  it('returns a TableArn with the table name', async () => {
    const result = await provider.createTable({ ...minimalInput });
    expect(String(result.TableDescription['TableArn'])).toContain('MyTable');
  });

  it('inserts a document into the _tables collection', async () => {
    await provider.createTable({ ...minimalInput });
    expect(col.insertOne).toHaveBeenCalledOnce();
    const doc = vi.mocked(col.insertOne).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(doc['TableName']).toBe('MyTable');
    expect(doc['TableStatus']).toBe('ACTIVE');
  });

  it('defaults BillingMode to PROVISIONED', async () => {
    const result = await provider.createTable({ ...minimalInput });
    const billing = result.TableDescription['BillingModeSummary'] as Record<string, unknown>;
    expect(billing['BillingMode']).toBe('PROVISIONED');
  });

  it('uses the provided BillingMode', async () => {
    const result = await provider.createTable({ ...minimalInput, BillingMode: 'PAY_PER_REQUEST' });
    const billing = result.TableDescription['BillingModeSummary'] as Record<string, unknown>;
    expect(billing['BillingMode']).toBe('PAY_PER_REQUEST');
  });

  it('includes ProvisionedThroughput with NumberOfDecreasesToday when PROVISIONED', async () => {
    const result = await provider.createTable({
      ...minimalInput,
      BillingMode: 'PROVISIONED',
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    });
    const pt = result.TableDescription['ProvisionedThroughput'] as Record<string, unknown>;
    expect(pt['ReadCapacityUnits']).toBe(5);
    expect(pt['WriteCapacityUnits']).toBe(5);
    expect(pt['NumberOfDecreasesToday']).toBe(0);
  });

  it('omits ProvisionedThroughput when BillingMode is PAY_PER_REQUEST', async () => {
    const result = await provider.createTable({
      ...minimalInput,
      BillingMode: 'PAY_PER_REQUEST',
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    });
    expect(result.TableDescription['ProvisionedThroughput']).toBeUndefined();
  });

  it('includes GlobalSecondaryIndexes when provided', async () => {
    const gsi = [{ IndexName: 'gsi1' }];
    const result = await provider.createTable({ ...minimalInput, GlobalSecondaryIndexes: gsi });
    expect(result.TableDescription['GlobalSecondaryIndexes']).toEqual(gsi);
  });

  it('omits GlobalSecondaryIndexes when not provided', async () => {
    const result = await provider.createTable({ ...minimalInput });
    expect(result.TableDescription['GlobalSecondaryIndexes']).toBeUndefined();
  });

  it('includes LocalSecondaryIndexes when provided', async () => {
    const lsi = [{ IndexName: 'lsi1' }];
    const result = await provider.createTable({ ...minimalInput, LocalSecondaryIndexes: lsi });
    expect(result.TableDescription['LocalSecondaryIndexes']).toEqual(lsi);
  });

  it('includes TableClassSummary when TableClass is provided', async () => {
    const result = await provider.createTable({ ...minimalInput, TableClass: 'STANDARD_INFREQUENT_ACCESS' });
    const summary = result.TableDescription['TableClassSummary'] as Record<string, unknown>;
    expect(summary['TableClass']).toBe('STANDARD_INFREQUENT_ACCESS');
  });

  it('omits TableClassSummary when TableClass is not provided', async () => {
    const result = await provider.createTable({ ...minimalInput });
    expect(result.TableDescription['TableClassSummary']).toBeUndefined();
  });

  it('includes StreamSpecification when provided', async () => {
    const stream = { StreamEnabled: true, StreamViewType: 'NEW_IMAGE' };
    const result = await provider.createTable({ ...minimalInput, StreamSpecification: stream });
    expect(result.TableDescription['StreamSpecification']).toEqual(stream);
  });

  it('returns zero TableSizeBytes and ItemCount', async () => {
    const result = await provider.createTable({ ...minimalInput });
    expect(result.TableDescription['TableSizeBytes']).toBe(0);
    expect(result.TableDescription['ItemCount']).toBe(0);
  });

  it('creates a collection named after the table', async () => {
    await provider.createTable({ ...minimalInput });
    expect(vi.mocked(getDb(provider).createCollection)).toHaveBeenCalledWith('MyTable');
  });
});

describe('DynamodbProvider.listTables', () => {
  it('returns table names sorted from MongoDB results', async () => {
    const docs = [{ TableName: 'Alpha' }, { TableName: 'Beta' }];
    const col = makeCollectionMock(null, docs);
    const provider = makeProvider(col);
    const result = await provider.listTables({});
    expect(result.TableNames).toEqual(['Alpha', 'Beta']);
  });

  it('does not include LastEvaluatedTableName when results fit within limit', async () => {
    const docs = [{ TableName: 'A' }, { TableName: 'B' }];
    const col = makeCollectionMock(null, docs);
    const provider = makeProvider(col);
    const result = await provider.listTables({ Limit: 10 });
    expect(result.LastEvaluatedTableName).toBeUndefined();
  });

  it('includes LastEvaluatedTableName when results exceed limit', async () => {
    // Limit is 2, so query fetches limit+1 = 3 docs; if 3 returned, there are more
    const docs = [{ TableName: 'A' }, { TableName: 'B' }, { TableName: 'C' }];
    const col = makeCollectionMock(null, docs);
    const provider = makeProvider(col);
    const result = await provider.listTables({ Limit: 2 });
    expect(result.TableNames).toEqual(['A', 'B']);
    expect(result.LastEvaluatedTableName).toBe('B');
  });

  it('passes ExclusiveStartTableName as $gt filter', async () => {
    const col = makeCollectionMock(null, []);
    const provider = makeProvider(col);
    await provider.listTables({ ExclusiveStartTableName: 'MyTable' });
    expect(col.find).toHaveBeenCalledWith({ TableName: { $gt: 'MyTable' } });
  });

  it('uses empty filter when ExclusiveStartTableName is not provided', async () => {
    const col = makeCollectionMock(null, []);
    const provider = makeProvider(col);
    await provider.listTables({});
    expect(col.find).toHaveBeenCalledWith({});
  });

  it('applies sort by name ascending', async () => {
    const col = makeCollectionMock(null, []);
    const provider = makeProvider(col);
    await provider.listTables({});
    const cursor = vi.mocked(col.find).mock.results[0]?.value as ReturnType<typeof makeCursorMock>;
    expect(cursor.sort).toHaveBeenCalledWith({ TableName: 1 });
  });

  it('applies limit+1 to detect next page', async () => {
    const col = makeCollectionMock(null, []);
    const provider = makeProvider(col);
    await provider.listTables({ Limit: 5 });
    const cursor = vi.mocked(col.find).mock.results[0]?.value as ReturnType<typeof makeCursorMock>;
    expect(cursor.limit).toHaveBeenCalledWith(6);
  });

  it('defaults limit to 100 when not specified', async () => {
    const col = makeCollectionMock(null, []);
    const provider = makeProvider(col);
    await provider.listTables({});
    const cursor = vi.mocked(col.find).mock.results[0]?.value as ReturnType<typeof makeCursorMock>;
    expect(cursor.limit).toHaveBeenCalledWith(101);
  });

  it('returns empty TableNames array when no tables exist', async () => {
    const col = makeCollectionMock(null, []);
    const provider = makeProvider(col);
    const result = await provider.listTables({});
    expect(result.TableNames).toEqual([]);
  });
});

function makeItemCollectionMock(opts: {
  findOneResult?: Record<string, unknown> | null;
  replaceOneResult?: unknown;
  deleteOneResult?: unknown;
  updateOneResult?: unknown;
}) {
  return {
    findOne: vi.fn().mockResolvedValue(opts.findOneResult ?? null),
    replaceOne: vi.fn().mockResolvedValue(opts.replaceOneResult ?? { modifiedCount: 1 }),
    deleteOne: vi.fn().mockResolvedValue(opts.deleteOneResult ?? { deletedCount: 1 }),
    updateOne: vi.fn().mockResolvedValue(opts.updateOneResult ?? { modifiedCount: 1 }),
  };
}

function makeProviderWithItemCollections(
  tableDoc: Record<string, unknown> | null,
  itemColMock: ReturnType<typeof makeItemCollectionMock>,
): DynamodbProvider {
  const config = new ConfigService();
  const provider = new DynamodbProvider(config);
  const tablesCol = {
    findOne: vi.fn().mockResolvedValue(tableDoc),
    insertOne: vi.fn().mockResolvedValue({}),
    find: vi.fn().mockReturnValue(makeCursorMock([])),
  };
  const db = {
    collection: vi.fn().mockImplementation((name: string) =>
      name === '_tables' ? tablesCol : itemColMock,
    ),
    createCollection: vi.fn().mockResolvedValue(undefined),
    dropCollection: vi.fn().mockResolvedValue(undefined),
  } as unknown as Db;
  (provider as unknown as Record<string, unknown>)['db'] = db;
  return provider;
}

const tableDoc = {
  TableName: 'MyTable',
  KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  TableStatus: 'ACTIVE',
  TableArn: 'arn:aws:dynamodb:us-east-1:000000000000:table/MyTable',
  TableId: 'table-id-1',
  BillingMode: 'PROVISIONED',
};

describe('DynamodbProvider.getItem', () => {
  const key = { pk: { S: 'user-1' } };

  it('returns Item marshalled to DynamoDB format when item exists', async () => {
    const existing = { pk: 'user-1', name: 'Alice' };
    const itemCol = makeItemCollectionMock({ findOneResult: existing });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    const result = await provider.getItem({ TableName: 'MyTable', Key: key });
    const item = (result as Record<string, unknown>)['Item'] as Record<string, unknown>;
    expect(item['pk']).toEqual({ S: 'user-1' });
    expect(item['name']).toEqual({ S: 'Alice' });
    expect(item['_id']).toBeUndefined();
  });

  it('returns empty object when item does not exist', async () => {
    const itemCol = makeItemCollectionMock({ findOneResult: null });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    const result = await provider.getItem({ TableName: 'MyTable', Key: key });
    expect(result).toEqual({});
  });

  it('queries collection with key filter', async () => {
    const itemCol = makeItemCollectionMock({ findOneResult: null });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    await provider.getItem({ TableName: 'MyTable', Key: key });
    expect(itemCol.findOne).toHaveBeenCalledWith({ pk: 'user-1' });
  });

  it('throws ResourceNotFoundException when table does not exist', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(null, itemCol);
    let caught: HttpException | undefined;
    try {
      await provider.getItem({ TableName: 'Missing', Key: key });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ResourceNotFoundException');
  });

  it('throws ValidationException when Key is missing', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    let caught: HttpException | undefined;
    try {
      await provider.getItem({ TableName: 'MyTable' });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });
});

describe('DynamodbProvider.putItem', () => {
  const item = { pk: { S: 'user-1' }, name: { S: 'Alice' } };

  it('calls replaceOne with upsert on the table collection', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    await provider.putItem({ TableName: 'MyTable', Item: item });
    expect(itemCol.replaceOne).toHaveBeenCalledOnce();
    const [filter, doc, opts] = vi.mocked(itemCol.replaceOne).mock.calls[0]!;
    expect(filter).toMatchObject({ pk: 'user-1' });
    expect(doc).toEqual({ pk: 'user-1', name: 'Alice' });
    expect(opts).toEqual({ upsert: true });
  });

  it('returns empty object by default', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    const result = await provider.putItem({ TableName: 'MyTable', Item: item });
    expect(result).toEqual({});
  });

  it('returns Attributes with old item when ReturnValues is ALL_OLD and item existed', async () => {
    const existing = { pk: 'user-1', name: 'OldName', _id: 'mongo-id' };
    const itemCol = makeItemCollectionMock({ findOneResult: existing });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    const result = await provider.putItem({ TableName: 'MyTable', Item: item, ReturnValues: 'ALL_OLD' });
    expect(result).toHaveProperty('Attributes');
    const attrs = (result as Record<string, unknown>)['Attributes'] as Record<string, unknown>;
    expect(attrs['pk']).toEqual({ S: 'user-1' });
    expect(attrs['_id']).toBeUndefined();
  });

  it('returns empty object when ReturnValues is ALL_OLD but no existing item', async () => {
    const itemCol = makeItemCollectionMock({ findOneResult: null });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    const result = await provider.putItem({ TableName: 'MyTable', Item: item, ReturnValues: 'ALL_OLD' });
    expect(result).toEqual({});
  });

  it('throws ResourceNotFoundException when table does not exist', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(null, itemCol);
    let caught: HttpException | undefined;
    try {
      await provider.putItem({ TableName: 'Missing', Item: item });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ResourceNotFoundException');
  });
});

describe('DynamodbProvider.deleteItem', () => {
  const key = { pk: { S: 'user-1' } };

  it('calls deleteOne with the key filter on the table collection', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    await provider.deleteItem({ TableName: 'MyTable', Key: key });
    expect(itemCol.deleteOne).toHaveBeenCalledOnce();
    const [filter] = vi.mocked(itemCol.deleteOne).mock.calls[0]!;
    expect(filter).toMatchObject({ pk: 'user-1' });
  });

  it('returns empty object by default', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    const result = await provider.deleteItem({ TableName: 'MyTable', Key: key });
    expect(result).toEqual({});
  });

  it('returns Attributes with deleted item when ReturnValues is ALL_OLD', async () => {
    const existing = { pk: 'user-1', name: 'Alice', _id: 'mongo-id' };
    const itemCol = makeItemCollectionMock({ findOneResult: existing });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    const result = await provider.deleteItem({ TableName: 'MyTable', Key: key, ReturnValues: 'ALL_OLD' });
    const attrs = (result as Record<string, unknown>)['Attributes'] as Record<string, unknown>;
    expect(attrs['pk']).toEqual({ S: 'user-1' });
    expect(attrs['_id']).toBeUndefined();
  });

  it('throws ResourceNotFoundException when table does not exist', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(null, itemCol);
    let caught: HttpException | undefined;
    try {
      await provider.deleteItem({ TableName: 'Missing', Key: key });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ResourceNotFoundException');
  });
});

describe('DynamodbProvider.updateItem', () => {
  const key = { pk: { S: 'user-1' } };
  const existingItem = { pk: 'user-1', name: 'OldName' };

  it('calls updateOne with $set from AttributeUpdates PUT action', async () => {
    const itemCol = makeItemCollectionMock({ findOneResult: existingItem });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    await provider.updateItem({
      TableName: 'MyTable',
      Key: key,
      AttributeUpdates: { name: { Value: { S: 'NewName' }, Action: 'PUT' } },
    });
    expect(itemCol.updateOne).toHaveBeenCalledOnce();
    const [, update] = vi.mocked(itemCol.updateOne).mock.calls[0]!;
    expect((update as Record<string, unknown>)['$set']).toEqual({ name: 'NewName' });
  });

  it('calls updateOne with $unset from AttributeUpdates DELETE action', async () => {
    const itemCol = makeItemCollectionMock({ findOneResult: existingItem });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    await provider.updateItem({
      TableName: 'MyTable',
      Key: key,
      AttributeUpdates: { name: { Action: 'DELETE' } },
    });
    const [, update] = vi.mocked(itemCol.updateOne).mock.calls[0]!;
    expect((update as Record<string, unknown>)['$unset']).toMatchObject({ name: '' });
  });

  it('applies SET clause from UpdateExpression', async () => {
    const itemCol = makeItemCollectionMock({ findOneResult: existingItem });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    await provider.updateItem({
      TableName: 'MyTable',
      Key: key,
      UpdateExpression: 'SET name = :n',
      ExpressionAttributeValues: { ':n': { S: 'NewName' } },
    });
    const [, update] = vi.mocked(itemCol.updateOne).mock.calls[0]!;
    expect((update as Record<string, unknown>)['$set']).toEqual({ name: 'NewName' });
  });

  it('applies REMOVE clause from UpdateExpression', async () => {
    const itemCol = makeItemCollectionMock({ findOneResult: existingItem });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    await provider.updateItem({
      TableName: 'MyTable',
      Key: key,
      UpdateExpression: 'REMOVE name',
    });
    const [, update] = vi.mocked(itemCol.updateOne).mock.calls[0]!;
    expect((update as Record<string, unknown>)['$unset']).toMatchObject({ name: '' });
  });

  it('returns empty object by default (ReturnValues NONE)', async () => {
    const itemCol = makeItemCollectionMock({ findOneResult: existingItem });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    const result = await provider.updateItem({
      TableName: 'MyTable',
      Key: key,
      AttributeUpdates: { name: { Value: { S: 'New' }, Action: 'PUT' } },
    });
    expect(result).toEqual({});
  });

  it('returns old Attributes marshalled to DynamoDB format when ReturnValues is ALL_OLD', async () => {
    const itemCol = makeItemCollectionMock({ findOneResult: existingItem });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    const result = await provider.updateItem({
      TableName: 'MyTable',
      Key: key,
      AttributeUpdates: { name: { Value: { S: 'New' }, Action: 'PUT' } },
      ReturnValues: 'ALL_OLD',
    });
    const attrs = (result as Record<string, unknown>)['Attributes'] as Record<string, unknown>;
    expect(attrs['name']).toEqual({ S: 'OldName' });
  });

  it('throws ResourceNotFoundException when table does not exist', async () => {
    const itemCol = makeItemCollectionMock({ findOneResult: existingItem });
    const provider = makeProviderWithItemCollections(null, itemCol);
    let caught: HttpException | undefined;
    try {
      await provider.updateItem({
        TableName: 'Missing',
        Key: key,
        AttributeUpdates: { name: { Value: { S: 'x' }, Action: 'PUT' } },
      });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ResourceNotFoundException');
  });

  it('throws ResourceNotFoundException when item does not exist', async () => {
    const itemCol = makeItemCollectionMock({ findOneResult: null });
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    let caught: HttpException | undefined;
    try {
      await provider.updateItem({
        TableName: 'MyTable',
        Key: key,
        AttributeUpdates: { name: { Value: { S: 'x' }, Action: 'PUT' } },
      });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ResourceNotFoundException');
  });
});

describe('DynamodbProvider.describeTable', () => {
  it('returns the raw _tables document under Table key', async () => {
    const doc = { name: 'MyTable', tableStatus: 'ACTIVE', tableArn: 'arn:aws:...' };
    const col = makeCollectionMock(doc);
    const provider = makeProvider(col);
    const result = await provider.describeTable({ TableName: 'MyTable' });
    expect(result.Table).toBe(doc);
  });

  it('queries _tables by table name', async () => {
    const col = makeCollectionMock({ name: 'MyTable' });
    const provider = makeProvider(col);
    await provider.describeTable({ TableName: 'MyTable' });
    expect(col.findOne).toHaveBeenCalledWith({ TableName: 'MyTable' }, { projection: { _id: 0 } });
  });

  it('throws ResourceNotFoundException when table does not exist', async () => {
    const col = makeCollectionMock(null);
    const provider = makeProvider(col);
    let caught: HttpException | undefined;
    try {
      await provider.describeTable({ TableName: 'Missing' });
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ResourceNotFoundException');
    expect(response['message']).toContain('Missing');
  });

  it('throws ValidationException for missing TableName', async () => {
    const col = makeCollectionMock(null);
    const provider = makeProvider(col);
    let caught: HttpException | undefined;
    try {
      await provider.describeTable({});
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });
});
