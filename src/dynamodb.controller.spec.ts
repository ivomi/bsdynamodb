import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DynamodbController } from './dynamodb.controller.js';
import type { DynamodbProvider } from './dynamodb.provider.js';

function makeProvider(): DynamodbProvider {
  return {
    createTable: vi.fn().mockResolvedValue({ TableDescription: { TableName: 'Test' } }),
    listTables: vi.fn().mockResolvedValue({ TableNames: ['A', 'B'] }),
    describeTable: vi.fn().mockResolvedValue({ Table: { name: 'Test' } }),
  } as unknown as DynamodbProvider;
}

describe('DynamodbController', () => {
  it('routes CreateTable target to provider.createTable', async () => {
    const provider = makeProvider();
    const controller = new DynamodbController(provider);
    const body = { TableName: 'Test' };
    await controller.handle('DynamoDB_20120810.CreateTable', body);
    expect(provider.createTable).toHaveBeenCalledWith(body);
  });

  it('returns the result of provider.createTable', async () => {
    const provider = makeProvider();
    const controller = new DynamodbController(provider);
    const result = await controller.handle('DynamoDB_20120810.CreateTable', { TableName: 'Test' });
    expect(result).toEqual({ TableDescription: { TableName: 'Test' } });
  });

  it('routes ListTables target to provider.listTables', async () => {
    const provider = makeProvider();
    const controller = new DynamodbController(provider);
    const body = { Limit: 10 };
    await controller.handle('DynamoDB_20120810.ListTables', body);
    expect(provider.listTables).toHaveBeenCalledWith(body);
  });

  it('returns the result of provider.listTables', async () => {
    const provider = makeProvider();
    const controller = new DynamodbController(provider);
    const result = await controller.handle('DynamoDB_20120810.ListTables', {});
    expect(result).toEqual({ TableNames: ['A', 'B'] });
  });

  it('throws HttpException for an unknown target', async () => {
    const provider = makeProvider();
    const controller = new DynamodbController(provider);
    await expect(controller.handle('DynamoDB_20120810.Unknown', {})).rejects.toThrow(HttpException);
  });

  it('throws 400 for unknown target', async () => {
    const provider = makeProvider();
    const controller = new DynamodbController(provider);
    let caught: HttpException | undefined;
    try {
      await controller.handle('DynamoDB_20120810.DeleteTable', {});
    } catch (e) {
      caught = e as HttpException;
    }
    expect(caught!.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('includes UnknownOperationException in response body for unknown target', async () => {
    const provider = makeProvider();
    const controller = new DynamodbController(provider);
    let caught: HttpException | undefined;
    try {
      await controller.handle('DynamoDB_20120810.DeleteTable', {});
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('UnknownOperationException');
    expect(response['message']).toContain('DynamoDB_20120810.DeleteTable');
  });

  it('does not call provider methods for unknown target', async () => {
    const provider = makeProvider();
    const controller = new DynamodbController(provider);
    await controller.handle('DynamoDB_20120810.Unknown', {}).catch(() => {});
    expect(provider.createTable).not.toHaveBeenCalled();
    expect(provider.listTables).not.toHaveBeenCalled();
  });

  it('routes DescribeTable target to provider.describeTable', async () => {
    const provider = makeProvider();
    const controller = new DynamodbController(provider);
    const body = { TableName: 'Test' };
    await controller.handle('DynamoDB_20120810.DescribeTable', body);
    expect(provider.describeTable).toHaveBeenCalledWith(body);
  });

  it('returns the result of provider.describeTable', async () => {
    const provider = makeProvider();
    const controller = new DynamodbController(provider);
    const result = await controller.handle('DynamoDB_20120810.DescribeTable', { TableName: 'Test' });
    expect(result).toEqual({ Table: { name: 'Test' } });
  });
});
