import { HttpException } from '@nestjs/common';
import type { Collection } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { validateCreateTable } from './create-table.js';

function makeCollection(existingDoc: Record<string, unknown> | null = null): Collection {
  return {
    findOne: vi.fn().mockResolvedValue(existingDoc),
  } as unknown as Collection;
}

const validBody: Record<string, unknown> = {
  TableName: 'MyTable',
  KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
};

describe('validateCreateTable', () => {
  it('resolves when input is valid and table does not exist', async () => {
    await expect(validateCreateTable({ ...validBody }, makeCollection(null))).resolves.toBeUndefined();
  });

  it('throws ValidationException when TableName is missing', async () => {
    const { TableName: _, ...body } = validBody;
    await expect(validateCreateTable(body, makeCollection())).rejects.toThrow(HttpException);
  });

  it('throws ValidationException when TableName is an empty string', async () => {
    await expect(validateCreateTable({ ...validBody, TableName: '' }, makeCollection())).rejects.toThrow(HttpException);
  });

  it('throws ValidationException when TableName is not a string', async () => {
    await expect(validateCreateTable({ ...validBody, TableName: 42 }, makeCollection())).rejects.toThrow(HttpException);
  });

  it('throws ValidationException when KeySchema is missing', async () => {
    const { KeySchema: _, ...body } = validBody;
    await expect(validateCreateTable(body, makeCollection())).rejects.toThrow(HttpException);
  });

  it('throws ValidationException when KeySchema is an empty array', async () => {
    await expect(validateCreateTable({ ...validBody, KeySchema: [] }, makeCollection())).rejects.toThrow(HttpException);
  });

  it('throws ValidationException when AttributeDefinitions is missing', async () => {
    const { AttributeDefinitions: _, ...body } = validBody;
    await expect(validateCreateTable(body, makeCollection())).rejects.toThrow(HttpException);
  });

  it('throws ValidationException when AttributeDefinitions is an empty array', async () => {
    await expect(
      validateCreateTable({ ...validBody, AttributeDefinitions: [] }, makeCollection()),
    ).rejects.toThrow(HttpException);
  });

  it('throws ResourceInConflictException when table already exists', async () => {
    const col = makeCollection({ name: 'MyTable' });
    await expect(validateCreateTable(validBody, col)).rejects.toThrow(HttpException);
  });

  it('includes correct __type in ResourceInConflictException', async () => {
    const col = makeCollection({ name: 'MyTable' });
    let caught: HttpException | undefined;
    try {
      await validateCreateTable(validBody, col);
    } catch (e) {
      caught = e as HttpException;
    }
    expect(caught).toBeInstanceOf(HttpException);
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ResourceInConflictException');
    expect(response['message']).toContain('MyTable');
  });

  it('includes correct __type in ValidationException for missing TableName', async () => {
    let caught: HttpException | undefined;
    try {
      await validateCreateTable({ ...validBody, TableName: '' }, makeCollection());
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });

  it('calls findOne with the table name to check for duplicates', async () => {
    const col = makeCollection(null);
    await validateCreateTable(validBody, col);
    expect(col.findOne).toHaveBeenCalledWith({ name: 'MyTable' });
  });
});
