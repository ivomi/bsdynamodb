import { HttpException, HttpStatus } from '@nestjs/common';
import { Collection } from 'mongodb';

export async function validateCreateTable(
  body: Record<string, unknown>,
  tables: Collection,
): Promise<void> {
  const tableName = body['TableName'];
  const keySchema = body['KeySchema'];
  const attributeDefinitions = body['AttributeDefinitions'];

  if (typeof tableName !== 'string' || !tableName) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'TableName is required' },
      HttpStatus.BAD_REQUEST,
    );
  }
  if (!Array.isArray(keySchema) || keySchema.length === 0) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'KeySchema is required' },
      HttpStatus.BAD_REQUEST,
    );
  }
  if (!Array.isArray(attributeDefinitions) || attributeDefinitions.length === 0) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'AttributeDefinitions is required' },
      HttpStatus.BAD_REQUEST,
    );
  }

  const existing = await tables.findOne({ TableName: tableName });
  if (existing != null) {
    throw new HttpException(
      { __type: 'ResourceInConflictException', message: `Table already exists: ${tableName}` },
      HttpStatus.BAD_REQUEST,
    );
  }
}
