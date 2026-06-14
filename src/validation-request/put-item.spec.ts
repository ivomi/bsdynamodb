import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validatePutItem } from './put-item.js';

describe('validatePutItem', () => {
  it('returns tableName when TableName and Item are valid', () => {
    const result = validatePutItem({ TableName: 'MyTable', Item: { pk: { S: 'user-1' } } });
    expect(result).toBe('MyTable');
  });

  it('throws when TableName is missing', () => {
    expect(() => validatePutItem({ Item: { pk: { S: 'x' } } })).toThrow(HttpException);
  });

  it('throws when TableName is empty string', () => {
    expect(() => validatePutItem({ TableName: '', Item: { pk: { S: 'x' } } })).toThrow(HttpException);
  });

  it('throws when TableName is not a string', () => {
    expect(() => validatePutItem({ TableName: 123, Item: { pk: { S: 'x' } } })).toThrow(HttpException);
  });

  it('throws when Item is missing', () => {
    expect(() => validatePutItem({ TableName: 'MyTable' })).toThrow(HttpException);
  });

  it('throws when Item is null', () => {
    expect(() => validatePutItem({ TableName: 'MyTable', Item: null })).toThrow(HttpException);
  });

  it('throws when Item is an array', () => {
    expect(() => validatePutItem({ TableName: 'MyTable', Item: [] })).toThrow(HttpException);
  });

  it('sets __type to ValidationException for missing TableName', () => {
    let caught: HttpException | undefined;
    try {
      validatePutItem({ Item: { pk: { S: 'x' } } });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('sets __type to ValidationException for missing Item', () => {
    let caught: HttpException | undefined;
    try {
      validatePutItem({ TableName: 'MyTable' });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });
});
