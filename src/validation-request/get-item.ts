import { HttpException, HttpStatus } from '@nestjs/common';

export function validateGetItem(body: Record<string, unknown>): string {
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
  return tableName;
}
