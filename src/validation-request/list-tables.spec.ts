import { describe, expect, it } from 'vitest';
import { parseListTables } from './list-tables.js';

describe('parseListTables', () => {
  it('returns undefined for both fields when body is empty', () => {
    expect(parseListTables({})).toEqual({ start: undefined, limit: undefined });
  });

  it('returns numeric Limit as limit', () => {
    expect(parseListTables({ Limit: 10 })).toMatchObject({ limit: 10 });
  });

  it('returns ExclusiveStartTableName as start', () => {
    expect(parseListTables({ ExclusiveStartTableName: 'MyTable' })).toMatchObject({ start: 'MyTable' });
  });

  it('returns both fields when both are provided', () => {
    expect(parseListTables({ Limit: 5, ExclusiveStartTableName: 'Start' })).toEqual({
      limit: 5,
      start: 'Start',
    });
  });

  it('ignores Limit when it is a string', () => {
    expect(parseListTables({ Limit: '10' })).toMatchObject({ limit: undefined });
  });

  it('ignores Limit when it is null', () => {
    expect(parseListTables({ Limit: null })).toMatchObject({ limit: undefined });
  });

  it('ignores ExclusiveStartTableName when it is a number', () => {
    expect(parseListTables({ ExclusiveStartTableName: 123 })).toMatchObject({ start: undefined });
  });

  it('ignores ExclusiveStartTableName when it is null', () => {
    expect(parseListTables({ ExclusiveStartTableName: null })).toMatchObject({ start: undefined });
  });
});
