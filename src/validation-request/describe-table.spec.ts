import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateDescribeTable } from './describe-table.js';

describe('validateDescribeTable', () => {
  it('returns the table name when valid', () => {
    expect(validateDescribeTable({ TableName: 'MyTable' })).toBe('MyTable');
  });

  it('throws ValidationException when TableName is missing', () => {
    expect(() => validateDescribeTable({})).toThrow(HttpException);
  });

  it('throws ValidationException when TableName is an empty string', () => {
    expect(() => validateDescribeTable({ TableName: '' })).toThrow(HttpException);
  });

  it('throws ValidationException when TableName is not a string', () => {
    expect(() => validateDescribeTable({ TableName: 42 })).toThrow(HttpException);
  });

  it('includes correct __type in ValidationException', () => {
    let caught: HttpException | undefined;
    try {
      validateDescribeTable({ TableName: '' });
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });
});
