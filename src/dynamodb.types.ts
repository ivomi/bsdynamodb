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
