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
  const db = { collection: vi.fn().mockReturnValue(collectionMock) } as unknown as Db;
  (provider as unknown as Record<string, unknown>)['db'] = db;
  return provider;
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
    expect(doc['name']).toBe('MyTable');
    expect(doc['tableStatus']).toBe('ACTIVE');
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
});

describe('DynamodbProvider.listTables', () => {
  it('returns table names sorted from MongoDB results', async () => {
    const docs = [{ name: 'Alpha' }, { name: 'Beta' }];
    const col = makeCollectionMock(null, docs);
    const provider = makeProvider(col);
    const result = await provider.listTables({});
    expect(result.TableNames).toEqual(['Alpha', 'Beta']);
  });

  it('does not include LastEvaluatedTableName when results fit within limit', async () => {
    const docs = [{ name: 'A' }, { name: 'B' }];
    const col = makeCollectionMock(null, docs);
    const provider = makeProvider(col);
    const result = await provider.listTables({ Limit: 10 });
    expect(result.LastEvaluatedTableName).toBeUndefined();
  });

  it('includes LastEvaluatedTableName when results exceed limit', async () => {
    // Limit is 2, so query fetches limit+1 = 3 docs; if 3 returned, there are more
    const docs = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
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
    expect(col.find).toHaveBeenCalledWith({ name: { $gt: 'MyTable' } });
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
    expect(cursor.sort).toHaveBeenCalledWith({ name: 1 });
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
