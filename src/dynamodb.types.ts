export interface KeySchemaElement {
  AttributeName: string;
  KeyType: 'HASH' | 'RANGE';
}

export interface AttributeDefinition {
  AttributeName: string;
  AttributeType: 'S' | 'N' | 'B';
}

export interface ProvisionedThroughput {
  ReadCapacityUnits: number;
  WriteCapacityUnits: number;
}

export interface GlobalSecondaryIndexCreate {
  IndexName: string;
  KeySchema: KeySchemaElement[];
  Projection: unknown;
  ProvisionedThroughput?: ProvisionedThroughput;
}

export interface GlobalSecondaryIndexUpdate {
  Create?: GlobalSecondaryIndexCreate;
  Update?: { IndexName: string; ProvisionedThroughput: ProvisionedThroughput };
  Delete?: { IndexName: string };
}

export interface UpdateTableInput {
  TableName: string;
  AttributeDefinitions?: AttributeDefinition[];
  BillingMode?: 'PROVISIONED' | 'PAY_PER_REQUEST';
  ProvisionedThroughput?: ProvisionedThroughput;
  GlobalSecondaryIndexUpdates?: GlobalSecondaryIndexUpdate[];
  StreamSpecification?: unknown;
  SSESpecification?: unknown;
  TableClass?: string;
}

export type AttributeValue =
  | { S: string }
  | { N: string }
  | { B: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { M: Record<string, AttributeValue> }
  | { L: AttributeValue[] }
  | { SS: string[] }
  | { NS: string[] }
  | { BS: string[] };

export type Item = Record<string, AttributeValue>;

export interface PutItemInput {
  TableName: string;
  Item: Item;
  ReturnValues?: 'NONE' | 'ALL_OLD';
}

export interface DeleteItemInput {
  TableName: string;
  Key: Item;
  ReturnValues?: 'NONE' | 'ALL_OLD';
}

export interface UpdateItemInput {
  TableName: string;
  Key: Item;
  AttributeUpdates?: Record<string, { Value?: AttributeValue; Action: 'PUT' | 'DELETE' | 'ADD' }>;
  UpdateExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Item;
  ReturnValues?: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW';
}

export interface GetItemInput {
  TableName: string;
  Key: Item;
  ProjectionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ConsistentRead?: boolean;
}

export interface CreateTableInput {
  TableName: string;
  KeySchema: KeySchemaElement[];
  AttributeDefinitions: AttributeDefinition[];
  BillingMode?: 'PROVISIONED' | 'PAY_PER_REQUEST';
  ProvisionedThroughput?: ProvisionedThroughput;
  GlobalSecondaryIndexes?: unknown[];
  LocalSecondaryIndexes?: unknown[];
  TableClass?: string;
  Tags?: unknown[];
  SSESpecification?: unknown;
  StreamSpecification?: unknown;
}
