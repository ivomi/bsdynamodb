import { HttpException, HttpStatus } from '@nestjs/common';

export function validateBatchGetItem(body: Record<string, unknown>): void {
  const requestItems = body['RequestItems'];
  if (requestItems == null || typeof requestItems !== 'object' || Array.isArray(requestItems)) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'RequestItems is required' },
      HttpStatus.BAD_REQUEST,
    );
  }
  for (const [tableName, tableRequest] of Object.entries(requestItems as Record<string, unknown>)) {
    const keys = (tableRequest as Record<string, unknown>)?.['Keys'];
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new HttpException(
        { __type: 'ValidationException', message: `RequestItems.${tableName}.Keys must be a non-empty array` },
        HttpStatus.BAD_REQUEST,
      );
    }
    for (const key of keys as unknown[]) {
      if (key == null || typeof key !== 'object' || Array.isArray(key)) {
        throw new HttpException(
          { __type: 'ValidationException', message: `Each key in RequestItems.${tableName}.Keys must be an object` },
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }
}
