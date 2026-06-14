import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateDeleteItem } from './delete-item.js';

describe('validateDeleteItem', () => {
  it('returns tableName when TableName and Key are valid', () => {
    const result = validateDeleteItem({ TableName: 'MyTable', Key: { pk: { S: 'user-1' } } });
    expect(result).toBe('MyTable');
  });

  it('throws when TableName is missing', () => {
    expect(() => validateDeleteItem({ Key: { pk: { S: 'x' } } })).toThrow(HttpException);
  });

  it('throws when TableName is empty string', () => {
    expect(() => validateDeleteItem({ TableName: '', Key: { pk: { S: 'x' } } })).toThrow(HttpException);
  });

  it('throws when TableName is not a string', () => {
    expect(() => validateDeleteItem({ TableName: 42, Key: { pk: { S: 'x' } } })).toThrow(HttpException);
  });

  it('throws when Key is missing', () => {
    expect(() => validateDeleteItem({ TableName: 'MyTable' })).toThrow(HttpException);
  });

  it('throws when Key is null', () => {
    expect(() => validateDeleteItem({ TableName: 'MyTable', Key: null })).toThrow(HttpException);
  });

  it('throws when Key is an array', () => {
    expect(() => validateDeleteItem({ TableName: 'MyTable', Key: [] })).toThrow(HttpException);
  });

  it('sets __type to ValidationException for missing TableName', () => {
    let caught: HttpException | undefined;
    try {
      validateDeleteItem({ Key: { pk: { S: 'x' } } });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('sets __type to ValidationException for missing Key', () => {
    let caught: HttpException | undefined;
    try {
      validateDeleteItem({ TableName: 'MyTable' });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });
});
