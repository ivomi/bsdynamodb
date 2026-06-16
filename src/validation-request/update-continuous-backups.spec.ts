import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateUpdateContinuousBackups } from './update-continuous-backups.js';

const validBody = {
  TableName: 'MyTable',
  PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
};

describe('validateUpdateContinuousBackups', () => {
  it('returns the table name when valid', () => {
    expect(validateUpdateContinuousBackups(validBody)).toBe('MyTable');
  });

  it('throws ValidationException when TableName is missing', () => {
    expect(() => validateUpdateContinuousBackups({ ...validBody, TableName: undefined })).toThrow(HttpException);
  });

  it('throws ValidationException when TableName is an empty string', () => {
    expect(() => validateUpdateContinuousBackups({ ...validBody, TableName: '' })).toThrow(HttpException);
  });

  it('throws ValidationException when PointInTimeRecoverySpecification is missing', () => {
    expect(() => validateUpdateContinuousBackups({ TableName: 'MyTable' })).toThrow(HttpException);
  });

  it('throws ValidationException when PointInTimeRecoveryEnabled is not a boolean', () => {
    expect(() =>
      validateUpdateContinuousBackups({
        TableName: 'MyTable',
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: 'true' },
      }),
    ).toThrow(HttpException);
  });

  it('includes correct __type in ValidationException for missing TableName', () => {
    let caught: HttpException | undefined;
    try {
      validateUpdateContinuousBackups({ ...validBody, TableName: '' });
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });

  it('includes correct __type in ValidationException for missing spec', () => {
    let caught: HttpException | undefined;
    try {
      validateUpdateContinuousBackups({ TableName: 'MyTable' });
    } catch (e) {
      caught = e as HttpException;
    }
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['__type']).toBe('ValidationException');
  });
});
