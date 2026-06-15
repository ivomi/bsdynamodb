import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateQuery } from './query.js';

describe('validateQuery', () => {
  it('returns tableName when TableName and KeyConditionExpression are valid', () => {
    const result = validateQuery({ TableName: 'MyTable', KeyConditionExpression: 'pk = :pk' });
    expect(result).toBe('MyTable');
  });

  it('throws when TableName is missing', () => {
    expect(() => validateQuery({ KeyConditionExpression: 'pk = :pk' })).toThrow(HttpException);
  });

  it('throws when TableName is empty string', () => {
    expect(() => validateQuery({ TableName: '', KeyConditionExpression: 'pk = :pk' })).toThrow(HttpException);
  });

  it('throws when TableName is not a string', () => {
    expect(() => validateQuery({ TableName: 123, KeyConditionExpression: 'pk = :pk' })).toThrow(HttpException);
  });

  it('throws when KeyConditionExpression is missing', () => {
    expect(() => validateQuery({ TableName: 'MyTable' })).toThrow(HttpException);
  });

  it('throws when KeyConditionExpression is empty string', () => {
    expect(() => validateQuery({ TableName: 'MyTable', KeyConditionExpression: '' })).toThrow(HttpException);
  });

  it('throws when KeyConditionExpression is not a string', () => {
    expect(() => validateQuery({ TableName: 'MyTable', KeyConditionExpression: 42 })).toThrow(HttpException);
  });

  it('sets __type to ValidationException for missing TableName', () => {
    let caught: HttpException | undefined;
    try {
      validateQuery({ KeyConditionExpression: 'pk = :pk' });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('sets __type to ValidationException for missing KeyConditionExpression', () => {
    let caught: HttpException | undefined;
    try {
      validateQuery({ TableName: 'MyTable' });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });
});
