import { HttpException, HttpStatus } from '@nestjs/common';

export function validateDescribeTimeToLive(body: Record<string, unknown>): string {
  const tableName = body['TableName'];
  if (typeof tableName !== 'string' || !tableName) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'TableName is required' },
      HttpStatus.BAD_REQUEST,
    );
  }
  return tableName;
}
