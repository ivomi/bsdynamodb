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
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
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
  findDocs?: Record<string, unknown>[];
  replaceOneResult?: unknown;
  deleteOneResult?: unknown;
  updateOneResult?: unknown;
}) {
  return {
    findOne: vi.fn().mockResolvedValue(opts.findOneResult ?? null),
    find: vi.fn().mockReturnValue(makeCursorMock(opts.findDocs ?? [])),
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

describe('DynamodbProvider.describeTimeToLive', () => {
  it('returns DISABLED TimeToLiveStatus when table exists', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable' });
    const provider = makeProvider(col);
    const result = await provider.describeTimeToLive({ TableName: 'MyTable' });
    expect(result.TimeToLiveDescription.TimeToLiveStatus).toBe('DISABLED');
  });

  it('does not include AttributeName in the response', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable' });
    const provider = makeProvider(col);
    const result = await provider.describeTimeToLive({ TableName: 'MyTable' });
    expect(result.TimeToLiveDescription.AttributeName).toBeUndefined();
  });

  it('queries _tables by table name with _id projection', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable' });
    const provider = makeProvider(col);
    await provider.describeTimeToLive({ TableName: 'MyTable' });
    expect(col.findOne).toHaveBeenCalledWith({ TableName: 'MyTable' }, { projection: { _id: 0 } });
  });

  it('throws ResourceNotFoundException when table does not exist', async () => {
    const col = makeCollectionMock(null);
    const provider = makeProvider(col);
    let caught: HttpException | undefined;
    try {
      await provider.describeTimeToLive({ TableName: 'Missing' });
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
      await provider.describeTimeToLive({});
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });
});

describe('DynamodbProvider.describeContinuousBackups', () => {
  it('returns ENABLED ContinuousBackupsStatus when table exists', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable' });
    const provider = makeProvider(col);
    const result = await provider.describeContinuousBackups({ TableName: 'MyTable' });
    expect(result.ContinuousBackupsDescription.ContinuousBackupsStatus).toBe('ENABLED');
  });

  it('returns DISABLED PointInTimeRecoveryStatus when table exists', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable' });
    const provider = makeProvider(col);
    const result = await provider.describeContinuousBackups({ TableName: 'MyTable' });
    expect(result.ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus).toBe('DISABLED');
  });

  it('queries _tables by table name with _id projection', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable' });
    const provider = makeProvider(col);
    await provider.describeContinuousBackups({ TableName: 'MyTable' });
    expect(col.findOne).toHaveBeenCalledWith({ TableName: 'MyTable' }, { projection: { _id: 0 } });
  });

  it('throws ResourceNotFoundException when table does not exist', async () => {
    const col = makeCollectionMock(null);
    const provider = makeProvider(col);
    let caught: HttpException | undefined;
    try {
      await provider.describeContinuousBackups({ TableName: 'Missing' });
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
      await provider.describeContinuousBackups({});
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });

  it('returns stored PointInTimeRecoveryStatus when present in the table document', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable', PointInTimeRecoveryStatus: 'ENABLED' });
    const provider = makeProvider(col);
    const result = await provider.describeContinuousBackups({ TableName: 'MyTable' });
    expect(result.ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus).toBe('ENABLED');
  });
});

describe('DynamodbProvider.updateContinuousBackups', () => {
  const validBody = {
    TableName: 'MyTable',
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
  };

  it('calls updateOne with ENABLED when PointInTimeRecoveryEnabled is true', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable' });
    const provider = makeProvider(col);
    await provider.updateContinuousBackups(validBody);
    expect(col.updateOne).toHaveBeenCalledWith(
      { TableName: 'MyTable' },
      { $set: { PointInTimeRecoveryStatus: 'ENABLED' } },
    );
  });

  it('calls updateOne with DISABLED when PointInTimeRecoveryEnabled is false', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable' });
    const provider = makeProvider(col);
    await provider.updateContinuousBackups({ ...validBody, PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: false } });
    expect(col.updateOne).toHaveBeenCalledWith(
      { TableName: 'MyTable' },
      { $set: { PointInTimeRecoveryStatus: 'DISABLED' } },
    );
  });

  it('returns PointInTimeRecoveryStatus ENABLED in response when enabled', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable' });
    const provider = makeProvider(col);
    const result = await provider.updateContinuousBackups(validBody);
    expect(result.ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus).toBe('ENABLED');
  });

  it('returns PointInTimeRecoveryStatus DISABLED in response when disabled', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable' });
    const provider = makeProvider(col);
    const result = await provider.updateContinuousBackups({ ...validBody, PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: false } });
    expect(result.ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus).toBe('DISABLED');
  });

  it('returns ContinuousBackupsStatus ENABLED', async () => {
    const col = makeCollectionMock({ TableName: 'MyTable' });
    const provider = makeProvider(col);
    const result = await provider.updateContinuousBackups(validBody);
    expect(result.ContinuousBackupsDescription.ContinuousBackupsStatus).toBe('ENABLED');
  });

  it('throws ResourceNotFoundException when table does not exist', async () => {
    const col = makeCollectionMock(null);
    const provider = makeProvider(col);
    let caught: HttpException | undefined;
    try {
      await provider.updateContinuousBackups({ ...validBody, TableName: 'Missing' });
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
      await provider.updateContinuousBackups({ PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true } });
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });

  it('throws ValidationException for missing PointInTimeRecoverySpecification', async () => {
    const col = makeCollectionMock(null);
    const provider = makeProvider(col);
    let caught: HttpException | undefined;
    try {
      await provider.updateContinuousBackups({ TableName: 'MyTable' });
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });
});

describe('DynamodbProvider.scan', () => {
  const storedItems = [
    { pk: 'user-1', status: 'active', age: 25 },
    { pk: 'user-2', status: 'inactive', age: 30 },
    { pk: 'user-3', status: 'active', age: 35 },
  ];

  function makeScanProvider(findDocs: Record<string, unknown>[], findOneForKey: Record<string, unknown> | null = null) {
    const config = new ConfigService();
    const provider = new DynamodbProvider(config);
    const tablesCol = {
      findOne: vi.fn().mockResolvedValue(tableDoc),
      insertOne: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockReturnValue(makeCursorMock([])),
    };
    const itemCursor = makeCursorMock(findDocs);
    const itemCol = {
      findOne: vi.fn().mockResolvedValue(findOneForKey),
      find: vi.fn().mockReturnValue(itemCursor),
      replaceOne: vi.fn(),
      deleteOne: vi.fn(),
      updateOne: vi.fn(),
    };
    const db = {
      collection: vi.fn().mockImplementation((name: string) => name === '_tables' ? tablesCol : itemCol),
      createCollection: vi.fn().mockResolvedValue(undefined),
      dropCollection: vi.fn().mockResolvedValue(undefined),
    } as unknown as Db;
    (provider as unknown as Record<string, unknown>)['db'] = db;
    return { provider, itemCol, itemCursor };
  }

  it('returns all items marshalled to DynamoDB format', async () => {
    const { provider } = makeScanProvider(storedItems);
    const result = await provider.scan({ TableName: 'MyTable' }) as Record<string, unknown>;
    const items = result['Items'] as Record<string, unknown>[];
    expect(items).toHaveLength(3);
    expect(items[0]!['pk']).toEqual({ S: 'user-1' });
    expect(items[0]!['age']).toEqual({ N: '25' });
  });

  it('returns Count and ScannedCount equal to the number of items', async () => {
    const { provider } = makeScanProvider(storedItems);
    const result = await provider.scan({ TableName: 'MyTable' }) as Record<string, unknown>;
    expect(result['Count']).toBe(3);
    expect(result['ScannedCount']).toBe(3);
  });

  it('passes FilterExpression as a MongoDB filter', async () => {
    const { provider, itemCol } = makeScanProvider(storedItems);
    await provider.scan({
      TableName: 'MyTable',
      FilterExpression: '#s = :val',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':val': { S: 'active' } },
    });
    const filter = vi.mocked(itemCol.find).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(filter).toMatchObject({ status: 'active' });
  });

  it('applies limit+1 to detect next page', async () => {
    const { provider, itemCursor } = makeScanProvider(storedItems);
    await provider.scan({ TableName: 'MyTable', Limit: 2 });
    expect(itemCursor.limit).toHaveBeenCalledWith(3);
  });

  it('includes LastEvaluatedKey when results exceed Limit', async () => {
    const { provider } = makeScanProvider(storedItems); // 3 items, limit 2
    const result = await provider.scan({ TableName: 'MyTable', Limit: 2 }) as Record<string, unknown>;
    const items = result['Items'] as unknown[];
    expect(items).toHaveLength(2);
    const lek = result['LastEvaluatedKey'] as Record<string, unknown>;
    expect(lek).toBeDefined();
    expect(lek['pk']).toEqual({ S: 'user-2' });
  });

  it('does not include LastEvaluatedKey when results fit within Limit', async () => {
    const { provider } = makeScanProvider(storedItems.slice(0, 2)); // 2 items, limit 5
    const result = await provider.scan({ TableName: 'MyTable', Limit: 5 }) as Record<string, unknown>;
    expect(result['LastEvaluatedKey']).toBeUndefined();
  });

  it('uses ExclusiveStartKey to build _id $gt cursor filter', async () => {
    const lastDoc = { _id: 'mongo-id-2', pk: 'user-2' };
    const { provider, itemCol } = makeScanProvider(storedItems, lastDoc);
    await provider.scan({ TableName: 'MyTable', ExclusiveStartKey: { pk: { S: 'user-2' } } });
    const filter = vi.mocked(itemCol.find).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(filter).toMatchObject({ _id: { $gt: 'mongo-id-2' } });
  });

  it('returns only Count and ScannedCount when Select is COUNT', async () => {
    const { provider } = makeScanProvider(storedItems);
    const result = await provider.scan({ TableName: 'MyTable', Select: 'COUNT' }) as Record<string, unknown>;
    expect(result['Count']).toBe(3);
    expect(result['ScannedCount']).toBe(3);
    expect(result['Items']).toBeUndefined();
  });

  it('applies ProjectionExpression to returned items', async () => {
    const { provider } = makeScanProvider(storedItems);
    const result = await provider.scan({
      TableName: 'MyTable',
      ProjectionExpression: 'pk',
    }) as Record<string, unknown>;
    const items = result['Items'] as Record<string, unknown>[];
    expect(items[0]).toHaveProperty('pk');
    expect(items[0]).not.toHaveProperty('status');
    expect(items[0]).not.toHaveProperty('age');
  });

  it('throws ResourceNotFoundException when table does not exist', async () => {
    const config = new ConfigService();
    const provider = new DynamodbProvider(config);
    const tablesCol = { findOne: vi.fn().mockResolvedValue(null), find: vi.fn().mockReturnValue(makeCursorMock([])) };
    const db = {
      collection: vi.fn().mockReturnValue(tablesCol),
      createCollection: vi.fn(),
    } as unknown as Db;
    (provider as unknown as Record<string, unknown>)['db'] = db;

    let caught: HttpException | undefined;
    try {
      await provider.scan({ TableName: 'Missing' });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ResourceNotFoundException');
  });

  it('throws ValidationException when TableName is missing', async () => {
    const { provider } = makeScanProvider([]);
    let caught: HttpException | undefined;
    try {
      await provider.scan({});
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });
});

describe('DynamodbProvider.query', () => {
  const tableDocHashRange = {
    TableName: 'MyTable',
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
  };

  const tableDocHashOnly = {
    TableName: 'MyTable',
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  };

  const storedItems = [
    { pk: 'user-1', sk: 'a', status: 'active' },
    { pk: 'user-1', sk: 'b', status: 'inactive' },
    { pk: 'user-1', sk: 'c', status: 'active' },
  ];

  function makeQueryProvider(
    tableDoc: Record<string, unknown>,
    findDocs: Record<string, unknown>[],
    findOneForKey: Record<string, unknown> | null = null,
  ) {
    const config = new ConfigService();
    const provider = new DynamodbProvider(config);
    const tablesCol = {
      findOne: vi.fn().mockResolvedValue(tableDoc),
      insertOne: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockReturnValue(makeCursorMock([])),
    };
    const itemCursor = makeCursorMock(findDocs);
    const itemCol = {
      findOne: vi.fn().mockResolvedValue(findOneForKey),
      find: vi.fn().mockReturnValue(itemCursor),
      replaceOne: vi.fn(),
      deleteOne: vi.fn(),
      updateOne: vi.fn(),
    };
    const db = {
      collection: vi.fn().mockImplementation((name: string) => name === '_tables' ? tablesCol : itemCol),
      createCollection: vi.fn().mockResolvedValue(undefined),
      dropCollection: vi.fn().mockResolvedValue(undefined),
    } as unknown as Db;
    (provider as unknown as Record<string, unknown>)['db'] = db;
    return { provider, itemCol, itemCursor };
  }

  it('returns items marshalled to DynamoDB format', async () => {
    const { provider } = makeQueryProvider(tableDocHashRange, storedItems);
    const result = await provider.query({ TableName: 'MyTable', KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': { S: 'user-1' } } }) as Record<string, unknown>;
    const items = result['Items'] as Record<string, unknown>[];
    expect(items).toHaveLength(3);
    expect(items[0]!['pk']).toEqual({ S: 'user-1' });
    expect(items[0]!['sk']).toEqual({ S: 'a' });
  });

  it('returns Count and ScannedCount equal to number of items', async () => {
    const { provider } = makeQueryProvider(tableDocHashRange, storedItems);
    const result = await provider.query({ TableName: 'MyTable', KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': { S: 'user-1' } } }) as Record<string, unknown>;
    expect(result['Count']).toBe(3);
    expect(result['ScannedCount']).toBe(3);
  });

  it('passes KeyConditionExpression as a MongoDB filter', async () => {
    const { provider, itemCol } = makeQueryProvider(tableDocHashRange, storedItems);
    await provider.query({
      TableName: 'MyTable',
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': { S: 'user-1' } },
    });
    const filter = vi.mocked(itemCol.find).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(filter).toMatchObject({ pk: 'user-1' });
  });

  it('merges FilterExpression with KeyConditionExpression via $and', async () => {
    const { provider, itemCol } = makeQueryProvider(tableDocHashRange, storedItems);
    await provider.query({
      TableName: 'MyTable',
      KeyConditionExpression: 'pk = :pk',
      FilterExpression: 'status = :s',
      ExpressionAttributeValues: { ':pk': { S: 'user-1' }, ':s': { S: 'active' } },
    });
    const filter = vi.mocked(itemCol.find).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(filter).toHaveProperty('$and');
    const clauses = filter['$and'] as Record<string, unknown>[];
    expect(clauses.some((c) => 'pk' in c)).toBe(true);
    expect(clauses.some((c) => 'status' in c)).toBe(true);
  });

  it('sorts ascending on range key when ScanIndexForward is true (default)', async () => {
    const { provider, itemCursor } = makeQueryProvider(tableDocHashRange, storedItems);
    await provider.query({ TableName: 'MyTable', KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': { S: 'user-1' } } });
    expect(itemCursor.sort).toHaveBeenCalledWith({ sk: 1 });
  });

  it('sorts descending on range key when ScanIndexForward is false', async () => {
    const { provider, itemCursor } = makeQueryProvider(tableDocHashRange, storedItems);
    await provider.query({ TableName: 'MyTable', KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': { S: 'user-1' } }, ScanIndexForward: false });
    expect(itemCursor.sort).toHaveBeenCalledWith({ sk: -1 });
  });

  it('does not call sort on HASH-only table', async () => {
    const { provider, itemCursor } = makeQueryProvider(tableDocHashOnly, storedItems);
    await provider.query({ TableName: 'MyTable', KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': { S: 'user-1' } } });
    expect(itemCursor.sort).not.toHaveBeenCalled();
  });

  it('applies limit+1 to detect next page', async () => {
    const { provider, itemCursor } = makeQueryProvider(tableDocHashRange, storedItems);
    await provider.query({ TableName: 'MyTable', KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': { S: 'user-1' } }, Limit: 2 });
    expect(itemCursor.limit).toHaveBeenCalledWith(3);
  });

  it('includes LastEvaluatedKey with pk and sk when results exceed Limit', async () => {
    const { provider } = makeQueryProvider(tableDocHashRange, storedItems);
    const result = await provider.query({ TableName: 'MyTable', KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': { S: 'user-1' } }, Limit: 2 }) as Record<string, unknown>;
    expect((result['Items'] as unknown[]).length).toBe(2);
    const lek = result['LastEvaluatedKey'] as Record<string, unknown>;
    expect(lek['pk']).toEqual({ S: 'user-1' });
    expect(lek['sk']).toEqual({ S: 'b' });
  });

  it('does not include LastEvaluatedKey when results fit within Limit', async () => {
    const { provider } = makeQueryProvider(tableDocHashRange, storedItems.slice(0, 2));
    const result = await provider.query({ TableName: 'MyTable', KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': { S: 'user-1' } }, Limit: 5 }) as Record<string, unknown>;
    expect(result['LastEvaluatedKey']).toBeUndefined();
  });

  it('uses range key $gt for ascending pagination with ExclusiveStartKey', async () => {
    const lastDoc = { _id: 'mongo-id-1', pk: 'user-1', sk: 'a' };
    const { provider, itemCol } = makeQueryProvider(tableDocHashRange, storedItems, lastDoc);
    await provider.query({
      TableName: 'MyTable',
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': { S: 'user-1' } },
      ExclusiveStartKey: { pk: { S: 'user-1' }, sk: { S: 'a' } },
    });
    const filter = vi.mocked(itemCol.find).mock.calls[0]?.[0] as Record<string, unknown>;
    const clauses = (filter['$and'] as Record<string, unknown>[]);
    expect(clauses.some((c) => JSON.stringify(c).includes('$gt'))).toBe(true);
  });

  it('uses range key $lt for descending pagination with ExclusiveStartKey', async () => {
    const lastDoc = { _id: 'mongo-id-1', pk: 'user-1', sk: 'b' };
    const { provider, itemCol } = makeQueryProvider(tableDocHashRange, storedItems, lastDoc);
    await provider.query({
      TableName: 'MyTable',
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': { S: 'user-1' } },
      ExclusiveStartKey: { pk: { S: 'user-1' }, sk: { S: 'b' } },
      ScanIndexForward: false,
    });
    const filter = vi.mocked(itemCol.find).mock.calls[0]?.[0] as Record<string, unknown>;
    const clauses = (filter['$and'] as Record<string, unknown>[]);
    expect(clauses.some((c) => JSON.stringify(c).includes('$lt'))).toBe(true);
  });

  it('falls back to _id $gt pagination for HASH-only table with ExclusiveStartKey', async () => {
    const lastDoc = { _id: 'mongo-id-2', pk: 'user-1' };
    const { provider, itemCol } = makeQueryProvider(tableDocHashOnly, storedItems, lastDoc);
    await provider.query({
      TableName: 'MyTable',
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': { S: 'user-1' } },
      ExclusiveStartKey: { pk: { S: 'user-1' } },
    });
    const filter = vi.mocked(itemCol.find).mock.calls[0]?.[0] as Record<string, unknown>;
    const clauses = (filter['$and'] as Record<string, unknown>[]);
    expect(clauses.some((c) => JSON.stringify(c).includes('"$gt"'))).toBe(true);
    expect(clauses.some((c) => '_id' in c)).toBe(true);
  });

  it('returns only Count and ScannedCount when Select is COUNT', async () => {
    const { provider } = makeQueryProvider(tableDocHashRange, storedItems);
    const result = await provider.query({ TableName: 'MyTable', KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': { S: 'user-1' } }, Select: 'COUNT' }) as Record<string, unknown>;
    expect(result['Count']).toBe(3);
    expect(result['ScannedCount']).toBe(3);
    expect(result['Items']).toBeUndefined();
  });

  it('applies ProjectionExpression to returned items', async () => {
    const { provider } = makeQueryProvider(tableDocHashRange, storedItems);
    const result = await provider.query({
      TableName: 'MyTable',
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': { S: 'user-1' } },
      ProjectionExpression: 'pk',
    }) as Record<string, unknown>;
    const items = result['Items'] as Record<string, unknown>[];
    expect(items[0]).toHaveProperty('pk');
    expect(items[0]).not.toHaveProperty('sk');
    expect(items[0]).not.toHaveProperty('status');
  });

  it('throws ResourceNotFoundException when table does not exist', async () => {
    const config = new ConfigService();
    const provider = new DynamodbProvider(config);
    const tablesCol = { findOne: vi.fn().mockResolvedValue(null), find: vi.fn().mockReturnValue(makeCursorMock([])) };
    const db = {
      collection: vi.fn().mockReturnValue(tablesCol),
      createCollection: vi.fn(),
    } as unknown as Db;
    (provider as unknown as Record<string, unknown>)['db'] = db;
    let caught: HttpException | undefined;
    try {
      await provider.query({ TableName: 'Missing', KeyConditionExpression: 'pk = :pk' });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ResourceNotFoundException');
  });

  it('throws ValidationException when TableName is missing', async () => {
    const { provider } = makeQueryProvider(tableDocHashRange, []);
    let caught: HttpException | undefined;
    try {
      await provider.query({ KeyConditionExpression: 'pk = :pk' });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when KeyConditionExpression is missing', async () => {
    const { provider } = makeQueryProvider(tableDocHashRange, []);
    let caught: HttpException | undefined;
    try {
      await provider.query({ TableName: 'MyTable' });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });
});

function makeProviderWithNamedCollections(
  tableMap: Record<string, Record<string, unknown> | null>,
  itemColMap: Record<string, ReturnType<typeof makeItemCollectionMock>>,
): DynamodbProvider {
  const config = new ConfigService();
  const provider = new DynamodbProvider(config);
  const tablesCol = {
    findOne: vi.fn().mockImplementation(({ TableName }: { TableName: string }) =>
      Promise.resolve(tableMap[TableName] ?? null),
    ),
    insertOne: vi.fn().mockResolvedValue({}),
    find: vi.fn().mockReturnValue(makeCursorMock([])),
  };
  const db = {
    collection: vi.fn().mockImplementation((name: string) =>
      name === '_tables' ? tablesCol : (itemColMap[name] ?? makeItemCollectionMock({})),
    ),
    createCollection: vi.fn().mockResolvedValue(undefined),
    dropCollection: vi.fn().mockResolvedValue(undefined),
  } as unknown as Db;
  (provider as unknown as Record<string, unknown>)['db'] = db;
  return provider;
}

describe('DynamodbProvider.batchWriteItem', () => {
  const putRequest = { PutRequest: { Item: { pk: { S: 'u1' }, name: { S: 'Alice' } } } };
  const deleteRequest = { DeleteRequest: { Key: { pk: { S: 'u2' } } } };

  it('calls replaceOne with upsert for a PutRequest', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    await provider.batchWriteItem({ RequestItems: { MyTable: [putRequest] } });
    expect(itemCol.replaceOne).toHaveBeenCalledOnce();
    const [filter, doc, opts] = vi.mocked(itemCol.replaceOne).mock.calls[0]!;
    expect(filter).toMatchObject({ pk: 'u1' });
    expect(doc).toEqual({ pk: 'u1', name: 'Alice' });
    expect(opts).toEqual({ upsert: true });
  });

  it('calls deleteOne with the key filter for a DeleteRequest', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    await provider.batchWriteItem({ RequestItems: { MyTable: [deleteRequest] } });
    expect(itemCol.deleteOne).toHaveBeenCalledOnce();
    const [filter] = vi.mocked(itemCol.deleteOne).mock.calls[0]!;
    expect(filter).toMatchObject({ pk: 'u2' });
  });

  it('handles mixed PutRequest and DeleteRequest in same batch', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    await provider.batchWriteItem({ RequestItems: { MyTable: [putRequest, deleteRequest] } });
    expect(itemCol.replaceOne).toHaveBeenCalledOnce();
    expect(itemCol.deleteOne).toHaveBeenCalledOnce();
  });

  it('handles requests across multiple tables', async () => {
    const tableDoc2 = { ...tableDoc, TableName: 'OtherTable' };
    const itemCol1 = makeItemCollectionMock({});
    const itemCol2 = makeItemCollectionMock({});
    const provider = makeProviderWithNamedCollections(
      { MyTable: tableDoc, OtherTable: tableDoc2 },
      { MyTable: itemCol1, OtherTable: itemCol2 },
    );
    await provider.batchWriteItem({
      RequestItems: {
        MyTable: [putRequest],
        OtherTable: [deleteRequest],
      },
    });
    expect(itemCol1.replaceOne).toHaveBeenCalledOnce();
    expect(itemCol2.deleteOne).toHaveBeenCalledOnce();
  });

  it('returns UnprocessedItems as empty object', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    const result = await provider.batchWriteItem({ RequestItems: { MyTable: [putRequest] } });
    expect(result).toEqual({ UnprocessedItems: {} });
  });

  it('throws ResourceNotFoundException when table does not exist', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(null, itemCol);
    let caught: HttpException | undefined;
    try {
      await provider.batchWriteItem({ RequestItems: { Missing: [putRequest] } });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ResourceNotFoundException');
  });

  it('throws ValidationException when RequestItems is missing', async () => {
    const itemCol = makeItemCollectionMock({});
    const provider = makeProviderWithItemCollections(tableDoc, itemCol);
    let caught: HttpException | undefined;
    try {
      await provider.batchWriteItem({});
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });
});
