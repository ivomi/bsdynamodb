import { HttpException, HttpStatus } from '@nestjs/common';

export function validateUpdateTable(body: Record<string, unknown>): string {
  const tableName = body['TableName'];
  if (typeof tableName !== 'string' || !tableName) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'TableName is required' },
      HttpStatus.BAD_REQUEST,
    );
  }

  const hasBillingMode = body['BillingMode'] != null;
  const hasProvisionedThroughput = body['ProvisionedThroughput'] != null;
  const hasGsiUpdates =
    Array.isArray(body['GlobalSecondaryIndexUpdates']) &&
    (body['GlobalSecondaryIndexUpdates'] as unknown[]).length > 0;
  const hasStreamSpec = body['StreamSpecification'] != null;
  const hasSseSpec = body['SSESpecification'] != null;
  const hasTableClass = body['TableClass'] != null;
  const hasAttrDefs =
    Array.isArray(body['AttributeDefinitions']) &&
    (body['AttributeDefinitions'] as unknown[]).length > 0;

  if (
    !hasBillingMode &&
    !hasProvisionedThroughput &&
    !hasGsiUpdates &&
    !hasStreamSpec &&
    !hasSseSpec &&
    !hasTableClass &&
    !hasAttrDefs
  ) {
    throw new HttpException(
      {
        __type: 'ValidationException',
        message: 'Nothing to update',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  return tableName;
}
