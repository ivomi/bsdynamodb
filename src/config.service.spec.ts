import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from './config.service.js';

const TEST_KEY = '__TEST_CONFIG_KEY__';

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(() => {
    service = new ConfigService();
    delete process.env[TEST_KEY];
  });

  afterEach(() => {
    delete process.env[TEST_KEY];
  });

  it('returns env var when set', () => {
    process.env[TEST_KEY] = 'from-env';
    expect(service.get(TEST_KEY)).toBe('from-env');
  });

  it('returns provided defaultValue when env var is absent and no hardcoded default', () => {
    expect(service.get(TEST_KEY, 'fallback')).toBe('fallback');
  });

  it('returns undefined when env var not set and no defaults exist', () => {
    expect(service.get(TEST_KEY)).toBeUndefined();
  });

  it('returns hardcoded default for MONGO_URI when env var is absent', () => {
    const saved = process.env['MONGO_URI'];
    delete process.env['MONGO_URI'];
    try {
      expect(service.get('MONGO_URI')).toBe('mongodb://root:root@localhost:27017');
    } finally {
      if (saved !== undefined) process.env['MONGO_URI'] = saved;
    }
  });

  it('returns hardcoded default for MONGO_DB when env var is absent', () => {
    const saved = process.env['MONGO_DB'];
    delete process.env['MONGO_DB'];
    try {
      expect(service.get('MONGO_DB')).toBe('local');
    } finally {
      if (saved !== undefined) process.env['MONGO_DB'] = saved;
    }
  });

  it('prefers env var over hardcoded default', () => {
    process.env['MONGO_DB'] = 'mydb';
    try {
      expect(service.get('MONGO_DB')).toBe('mydb');
    } finally {
      delete process.env['MONGO_DB'];
    }
  });

  it('set writes the value to process.env', () => {
    service.set(TEST_KEY, 'new-value');
    expect(process.env[TEST_KEY]).toBe('new-value');
  });

  it('set overwrites an existing env var', () => {
    process.env[TEST_KEY] = 'old';
    service.set(TEST_KEY, 'new');
    expect(process.env[TEST_KEY]).toBe('new');
  });
});
