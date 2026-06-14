import { HttpException, HttpStatus } from '@nestjs/common';

export function validatePutItem(body: Record<string, unknown>): string {
  const tableName = body['TableName'];
  if (typeof tableName !== 'string' || !tableName) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'TableName is required' },
      HttpStatus.BAD_REQUEST,
    );
  }
  const item = body['Item'];
  if (item == null || typeof item !== 'object' || Array.isArray(item)) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'Item is required' },
      HttpStatus.BAD_REQUEST,
    );
  }
  return tableName;
}
