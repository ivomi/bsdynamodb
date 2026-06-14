import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateDeleteTable } from './delete-table.js';

describe('validateDeleteTable', () => {
  it('returns the table name when valid', () => {
    expect(validateDeleteTable({ TableName: 'MyTable' })).toBe('MyTable');
  });

  it('throws ValidationException when TableName is missing', () => {
    expect(() => validateDeleteTable({})).toThrow(HttpException);
  });

  it('throws ValidationException when TableName is an empty string', () => {
    expect(() => validateDeleteTable({ TableName: '' })).toThrow(HttpException);
  });

  it('throws ValidationException when TableName is not a string', () => {
    expect(() => validateDeleteTable({ TableName: 42 })).toThrow(HttpException);
  });

  it('includes correct __type in ValidationException', () => {
    let caught: HttpException | undefined;
    try {
      validateDeleteTable({ TableName: '' });
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });
});
