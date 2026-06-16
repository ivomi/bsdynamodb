import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateBatchGetItem } from './batch-get-item.js';

describe('validateBatchGetItem', () => {
  const validKey = { pk: { S: 'u1' } };

  it('does not throw for a valid request', () => {
    expect(() =>
      validateBatchGetItem({ RequestItems: { MyTable: { Keys: [validKey] } } }),
    ).not.toThrow();
  });

  it('throws ValidationException when RequestItems is missing', () => {
    let caught: HttpException | undefined;
    try { validateBatchGetItem({}); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when RequestItems is null', () => {
    let caught: HttpException | undefined;
    try { validateBatchGetItem({ RequestItems: null }); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when RequestItems is an array', () => {
    let caught: HttpException | undefined;
    try { validateBatchGetItem({ RequestItems: [] }); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when Keys is missing', () => {
    let caught: HttpException | undefined;
    try { validateBatchGetItem({ RequestItems: { MyTable: {} } }); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when Keys is an empty array', () => {
    let caught: HttpException | undefined;
    try { validateBatchGetItem({ RequestItems: { MyTable: { Keys: [] } } }); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when Keys is not an array', () => {
    let caught: HttpException | undefined;
    try { validateBatchGetItem({ RequestItems: { MyTable: { Keys: {} } } }); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when a key entry is an array', () => {
    let caught: HttpException | undefined;
    try { validateBatchGetItem({ RequestItems: { MyTable: { Keys: [[]] } } }); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });
});
