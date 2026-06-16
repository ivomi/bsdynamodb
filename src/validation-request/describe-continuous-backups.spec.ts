import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateDescribeContinuousBackups } from './describe-continuous-backups.js';

describe('validateDescribeContinuousBackups', () => {
  it('returns the table name when valid', () => {
    expect(validateDescribeContinuousBackups({ TableName: 'MyTable' })).toBe('MyTable');
  });

  it('throws ValidationException when TableName is missing', () => {
    expect(() => validateDescribeContinuousBackups({})).toThrow(HttpException);
  });

  it('throws ValidationException when TableName is an empty string', () => {
    expect(() => validateDescribeContinuousBackups({ TableName: '' })).toThrow(HttpException);
  });

  it('throws ValidationException when TableName is not a string', () => {
    expect(() => validateDescribeContinuousBackups({ TableName: 42 })).toThrow(HttpException);
  });

  it('includes correct __type in ValidationException', () => {
    let caught: HttpException | undefined;
    try {
      validateDescribeContinuousBackups({ TableName: '' });
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });
});
