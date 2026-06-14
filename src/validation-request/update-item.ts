import { HttpException, HttpStatus } from '@nestjs/common';

export function validateUpdateItem(body: Record<string, unknown>): string {
  const tableName = body['TableName'];
  if (typeof tableName !== 'string' || !tableName) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'TableName is required' },
      HttpStatus.BAD_REQUEST,
    );
  }
  const key = body['Key'];
  if (key == null || typeof key !== 'object' || Array.isArray(key)) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'Key is required' },
      HttpStatus.BAD_REQUEST,
    );
  }
  const hasAttributeUpdates =
    body['AttributeUpdates'] != null &&
    typeof body['AttributeUpdates'] === 'object' &&
    !Array.isArray(body['AttributeUpdates']);
  const hasUpdateExpression = typeof body['UpdateExpression'] === 'string';
  if (!hasAttributeUpdates && !hasUpdateExpression) {
    throw new HttpException(
      {
        __type: 'ValidationException',
        message: 'Either AttributeUpdates or UpdateExpression is required',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  if (hasAttributeUpdates && hasUpdateExpression) {
    throw new HttpException(
      {
        __type: 'ValidationException',
        message: 'AttributeUpdates and UpdateExpression cannot both be specified',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  return tableName;
}
