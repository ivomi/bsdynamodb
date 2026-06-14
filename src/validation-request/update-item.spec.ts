import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateUpdateItem } from './update-item.js';

const validAttributeUpdates = { name: { Value: { S: 'Alice' }, Action: 'PUT' as const } };

describe('validateUpdateItem', () => {
  it('returns tableName when using AttributeUpdates', () => {
    const result = validateUpdateItem({
      TableName: 'MyTable',
      Key: { pk: { S: 'user-1' } },
      AttributeUpdates: validAttributeUpdates,
    });
    expect(result).toBe('MyTable');
  });

  it('returns tableName when using UpdateExpression', () => {
    const result = validateUpdateItem({
      TableName: 'MyTable',
      Key: { pk: { S: 'user-1' } },
      UpdateExpression: 'SET #n = :n',
      ExpressionAttributeNames: { '#n': 'name' },
      ExpressionAttributeValues: { ':n': { S: 'Alice' } },
    });
    expect(result).toBe('MyTable');
  });

  it('throws when TableName is missing', () => {
    expect(() =>
      validateUpdateItem({ Key: { pk: { S: 'x' } }, AttributeUpdates: validAttributeUpdates }),
    ).toThrow(HttpException);
  });

  it('throws when TableName is empty string', () => {
    expect(() =>
      validateUpdateItem({ TableName: '', Key: { pk: { S: 'x' } }, AttributeUpdates: validAttributeUpdates }),
    ).toThrow(HttpException);
  });

  it('throws when Key is missing', () => {
    expect(() =>
      validateUpdateItem({ TableName: 'MyTable', AttributeUpdates: validAttributeUpdates }),
    ).toThrow(HttpException);
  });

  it('throws when Key is null', () => {
    expect(() =>
      validateUpdateItem({ TableName: 'MyTable', Key: null, AttributeUpdates: validAttributeUpdates }),
    ).toThrow(HttpException);
  });

  it('throws when Key is an array', () => {
    expect(() =>
      validateUpdateItem({ TableName: 'MyTable', Key: [], AttributeUpdates: validAttributeUpdates }),
    ).toThrow(HttpException);
  });

  it('throws when neither AttributeUpdates nor UpdateExpression is provided', () => {
    expect(() =>
      validateUpdateItem({ TableName: 'MyTable', Key: { pk: { S: 'x' } } }),
    ).toThrow(HttpException);
  });

  it('throws when both AttributeUpdates and UpdateExpression are provided', () => {
    expect(() =>
      validateUpdateItem({
        TableName: 'MyTable',
        Key: { pk: { S: 'x' } },
        AttributeUpdates: validAttributeUpdates,
        UpdateExpression: 'SET name = :n',
      }),
    ).toThrow(HttpException);
  });

  it('sets __type to ValidationException for missing TableName', () => {
    let caught: HttpException | undefined;
    try {
      validateUpdateItem({ Key: { pk: { S: 'x' } }, AttributeUpdates: validAttributeUpdates });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('sets __type to ValidationException when neither update field is provided', () => {
    let caught: HttpException | undefined;
    try {
      validateUpdateItem({ TableName: 'MyTable', Key: { pk: { S: 'x' } } });
    } catch (e) {
      caught = e as HttpException;
    }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });
});
