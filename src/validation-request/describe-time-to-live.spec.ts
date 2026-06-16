import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateDescribeTimeToLive } from './describe-time-to-live.js';

describe('validateDescribeTimeToLive', () => {
  it('returns the table name when valid', () => {
    expect(validateDescribeTimeToLive({ TableName: 'MyTable' })).toBe('MyTable');
  });

  it('throws ValidationException when TableName is missing', () => {
    expect(() => validateDescribeTimeToLive({})).toThrow(HttpException);
  });

  it('throws ValidationException when TableName is an empty string', () => {
    expect(() => validateDescribeTimeToLive({ TableName: '' })).toThrow(HttpException);
  });

  it('throws ValidationException when TableName is not a string', () => {
    expect(() => validateDescribeTimeToLive({ TableName: 42 })).toThrow(HttpException);
  });

  it('includes correct __type in ValidationException', () => {
    let caught: HttpException | undefined;
    try {
      validateDescribeTimeToLive({ TableName: '' });
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });
});
