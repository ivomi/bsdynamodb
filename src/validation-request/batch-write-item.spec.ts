import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateBatchWriteItem } from './batch-write-item.js';

describe('validateBatchWriteItem', () => {
  const validPut = { PutRequest: { Item: { pk: { S: 'u1' } } } };
  const validDelete = { DeleteRequest: { Key: { pk: { S: 'u1' } } } };

  it('does not throw for a valid PutRequest', () => {
    expect(() => validateBatchWriteItem({ RequestItems: { MyTable: [validPut] } })).not.toThrow();
  });

  it('does not throw for a valid DeleteRequest', () => {
    expect(() => validateBatchWriteItem({ RequestItems: { MyTable: [validDelete] } })).not.toThrow();
  });

  it('does not throw for mixed PutRequest and DeleteRequest', () => {
    expect(() =>
      validateBatchWriteItem({ RequestItems: { MyTable: [validPut, validDelete] } }),
    ).not.toThrow();
  });

  it('throws ValidationException when RequestItems is missing', () => {
    let caught: HttpException | undefined;
    try { validateBatchWriteItem({}); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when RequestItems is null', () => {
    let caught: HttpException | undefined;
    try { validateBatchWriteItem({ RequestItems: null }); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when RequestItems is an array', () => {
    let caught: HttpException | undefined;
    try { validateBatchWriteItem({ RequestItems: [] }); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when table requests array is empty', () => {
    let caught: HttpException | undefined;
    try { validateBatchWriteItem({ RequestItems: { MyTable: [] } }); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when table requests is not an array', () => {
    let caught: HttpException | undefined;
    try { validateBatchWriteItem({ RequestItems: { MyTable: {} } }); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when a request has neither PutRequest nor DeleteRequest', () => {
    let caught: HttpException | undefined;
    try { validateBatchWriteItem({ RequestItems: { MyTable: [{}] } }); } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when PutRequest.Item is missing', () => {
    let caught: HttpException | undefined;
    try {
      validateBatchWriteItem({ RequestItems: { MyTable: [{ PutRequest: {} }] } });
    } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when PutRequest.Item is an array', () => {
    let caught: HttpException | undefined;
    try {
      validateBatchWriteItem({ RequestItems: { MyTable: [{ PutRequest: { Item: [] } }] } });
    } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when DeleteRequest.Key is missing', () => {
    let caught: HttpException | undefined;
    try {
      validateBatchWriteItem({ RequestItems: { MyTable: [{ DeleteRequest: {} }] } });
    } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });

  it('throws ValidationException when DeleteRequest.Key is an array', () => {
    let caught: HttpException | undefined;
    try {
      validateBatchWriteItem({ RequestItems: { MyTable: [{ DeleteRequest: { Key: [] } }] } });
    } catch (e) { caught = e as HttpException; }
    expect((caught!.getResponse() as Record<string, unknown>)['__type']).toBe('ValidationException');
  });
});
