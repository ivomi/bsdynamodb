import { HttpException, HttpStatus } from '@nestjs/common';

export function validateUpdateContinuousBackups(body: Record<string, unknown>): string {
  const tableName = body['TableName'];
  if (typeof tableName !== 'string' || !tableName) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'TableName is required' },
      HttpStatus.BAD_REQUEST,
    );
  }
  const spec = body['PointInTimeRecoverySpecification'];
  if (spec == null || typeof spec !== 'object') {
    throw new HttpException(
      { __type: 'ValidationException', message: 'PointInTimeRecoverySpecification is required' },
      HttpStatus.BAD_REQUEST,
    );
  }
  const enabled = (spec as Record<string, unknown>)['PointInTimeRecoveryEnabled'];
  if (typeof enabled !== 'boolean') {
    throw new HttpException(
      { __type: 'ValidationException', message: 'PointInTimeRecoveryEnabled must be a boolean' },
      HttpStatus.BAD_REQUEST,
    );
  }
  return tableName;
}
